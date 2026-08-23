require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pool = require('../db');
const { logFlag } = require('../lib/dataQuality');

// --- Cleaning helpers ---

const { parseIncidentDate } = require('../lib/dateParsers');

function normaliseSeverity(rawSeverity) {
  const value = rawSeverity.trim().toLowerCase();

  const wordMap = { low: 'Low', medium: 'Medium', high: 'High' };
  const numberMap = { '1': 'Low', '2': 'Medium', '3': 'High' };

  if (wordMap[value]) return wordMap[value];
  if (numberMap[value]) return numberMap[value];

  return null; // unrecognised severity value
}

async function getOrCreateSite(siteName) {
  const existing = await pool.query('SELECT site_id FROM sites WHERE site_name = $1', [siteName]);
  if (existing.rows.length > 0) return existing.rows[0].site_id;

  const inserted = await pool.query(
    'INSERT INTO sites (site_name) VALUES ($1) RETURNING site_id',
    [siteName]
  );
  return inserted.rows[0].site_id;
}

// --- Main ingestion ---

async function ingestIncidents() {
  await pool.query('TRUNCATE incidents RESTART IDENTITY CASCADE');
await pool.query(`DELETE FROM data_quality_flags WHERE source_table = 'incidents'`);

  const filePath = path.join(__dirname, '../../../data/incident_register.csv');
  const csvContent = fs.readFileSync(filePath, 'utf-8');

  const records = parse(csvContent, {
    columns: header => header.map(h => h.trim()),
    skip_empty_lines: true,
  });

  // Pre-scan: find incident_ids that appear more than once
  const idCounts = {};
  for (const row of records) {
    const id = row['incident_id'];
    idCounts[id] = (idCounts[id] || 0) + 1;
  }

  // Pre-scan: find descriptions that appear more than once (possible copy/paste reuse)
  const descriptionCounts = {};
  for (const row of records) {
    const desc = row['description'].trim();
    descriptionCounts[desc] = (descriptionCounts[desc] || 0) + 1;
  }

  let inserted = 0;
  let flagged = 0;

  for (const row of records) {
    const incidentId = row['incident_id'];
    const rawDate = row['incident_date'];
    const location = row['location'];
    const typeCode = row['type_code'];
    const rawSeverity = row['severity'];
    const description = row['description'].trim();

    const cleanedDate = parseIncidentDate(rawDate);
    const severityNormalised = normaliseSeverity(rawSeverity);
    const siteId = await getOrCreateSite(location);

    // Duplicate incident_id: still insert both, but only the first can keep the
    // UNIQUE constraint -- so we suffix repeats to avoid a hard DB error while
    // preserving both rows for inspection.
    let incidentIdToStore = incidentId;
    if (idCounts[incidentId] > 1) {
      const isFirstOccurrence = !(await pool.query(
        'SELECT 1 FROM incidents WHERE incident_id = $1', [incidentId]
      )).rows.length;
      if (!isFirstOccurrence) {
        incidentIdToStore = `${incidentId}-DUP`;
      }
    }

    await pool.query(
      `INSERT INTO incidents
       (incident_id, incident_date, site_id, type_code, raw_severity,
        severity_normalised, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [incidentIdToStore, cleanedDate, siteId, typeCode, rawSeverity, severityNormalised, description]
    );
    inserted++;

    if (idCounts[incidentId] > 1) {
      await logFlag(pool, {
        sourceTable: 'incidents',
        sourceRecordRef: incidentId,
        issueDescription: `Incident ID "${incidentId}" appears ${idCounts[incidentId]} times in the source file with different dates/descriptions`,
        actionTaken: 'flagged',
        justification: 'Duplicate ID likely a data entry error (ID reused for two unrelated events); kept both rows, suffixed the repeat as "-DUP" to satisfy uniqueness, rather than discarding either record.',
      });
      flagged++;
    }

    if (!cleanedDate) {
      await logFlag(pool, {
        sourceTable: 'incidents',
        sourceRecordRef: incidentId,
        issueDescription: `Unparseable incident date: "${rawDate}"`,
        actionTaken: 'flagged',
        justification: 'Date did not match expected DD/MM/YYYY format.',
      });
      flagged++;
    }

    if (!severityNormalised) {
      await logFlag(pool, {
        sourceTable: 'incidents',
        sourceRecordRef: incidentId,
        issueDescription: `Unrecognised severity value: "${rawSeverity}"`,
        actionTaken: 'flagged',
        justification: 'Severity did not match known word (Low/Medium/High) or number (1/2/3) forms.',
      });
      flagged++;
    }

    if (descriptionCounts[description] > 1) {
      await logFlag(pool, {
        sourceTable: 'incidents',
        sourceRecordRef: incidentId,
        issueDescription: `Description text is repeated verbatim across ${descriptionCounts[description]} incidents with different IDs/dates`,
        actionTaken: 'flagged',
        justification: 'Cannot confirm from available data whether this reflects a genuinely recurring incident type or a copy/paste data entry shortcut. Kept as-is and flagged for review rather than assuming either explanation.',
      });
      flagged++;
    }
  }

  console.log(`Incidents: ${inserted} rows inserted, ${flagged} flags raised.`);
}

ingestIncidents()
  .then(() => pool.end())
  .catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });