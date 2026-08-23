require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pool = require('../db');
const { logFlag } = require('../dataQuality');

// --- Cleaning helpers ---

function normaliseAbn(rawAbn) {
  if (!rawAbn || rawAbn.trim() === '') return null;
  const digitsOnly = rawAbn.split(' ').join('');
  if (digitsOnly.length !== 11) return null; // not a valid ABN length
  return digitsOnly;
}

function normaliseNameForMatching(name) {
  // Strip common legal suffixes/punctuation so near-identical names can be compared
  let value = name.trim().toLowerCase();
  const suffixesToStrip = ['pty ltd', 'p/l', 'co', 'ltd', 'pty', 'inc'];
  for (const suffix of suffixesToStrip) {
    value = value.split(' ' + suffix).join('');
  }
  value = value.split('.').join('').split(',').join('').trim();
  return value;
}

// --- Main ingestion ---

async function ingestSuppliers() {
  await pool.query('TRUNCATE suppliers RESTART IDENTITY CASCADE');

  const filePath = path.join(__dirname, '../../../data/suppliers.csv');
  const csvContent = fs.readFileSync(filePath, 'utf-8');

  const records = parse(csvContent, {
    columns: header => header.map(h => h.trim()),
    skip_empty_lines: true,
  });

  // --- Pass 1: group rows by normalised name ---
  const nameGroups = {}; // nameKey -> array of rows
  for (const row of records) {
    const nameKey = normaliseNameForMatching(row['supplier_name']);
    if (!nameGroups[nameKey]) nameGroups[nameKey] = [];
    nameGroups[nameKey].push(row);
  }

  // --- Pass 2: merge any two name-groups that share a valid ABN ---
  // (this catches typo cases like Blackwood, where names don't match but ABN does)
  const abnToNameKey = {}; // abn -> the first nameKey we saw it under

  for (const nameKey in nameGroups) {
    for (const row of nameGroups[nameKey]) {
      const abn = normaliseAbn(row['abn']);
      if (!abn) continue;

      if (abnToNameKey[abn] && abnToNameKey[abn] !== nameKey) {
        // Found a different name-group sharing this ABN -> merge into it
        const targetKey = abnToNameKey[abn];
        nameGroups[targetKey].push(...nameGroups[nameKey]);
        nameGroups[nameKey] = []; // empty out the merged-away group
      } else {
        abnToNameKey[abn] = nameKey;
      }
    }
  }

  let inserted = 0;
  let flagged = 0;

  for (const nameKey in nameGroups) {
    const rows = nameGroups[nameKey];
    if (rows.length === 0) continue; // skip groups that got merged away

    const canonical = rows.reduce((best, r) =>
      parseFloat(r['fy_spend_aud']) > parseFloat(best['fy_spend_aud']) ? r : best
    );

    const canonicalAbn = rows.map(r => normaliseAbn(r['abn'])).find(a => a) || null;
    const totalSpend = rows.reduce((sum, r) => sum + parseFloat(r['fy_spend_aud']), 0);

    await pool.query(
      `INSERT INTO suppliers (canonical_name, abn, category) VALUES ($1,$2,$3)`,
      [canonical['supplier_name'], canonicalAbn, canonical['category']]
    );
    inserted++;

    if (rows.length > 1) {
      const namesInvolved = rows.map(r => `"${r['supplier_name']}"`).join(', ');
      await logFlag(pool, {
        sourceTable: 'suppliers',
        sourceRecordRef: canonical['supplier_name'],
        issueDescription: `Merged ${rows.length} rows appearing to be the same supplier: ${namesInvolved}`,
        actionTaken: 'fixed',
        justification: `Matched via shared ABN and/or near-identical name after stripping legal suffixes. Combined FY spend across rows ($${totalSpend.toLocaleString()}) rather than treating as separate suppliers.`,
      });
      flagged++;
    }

    if (!canonicalAbn) {
      await logFlag(pool, {
        sourceTable: 'suppliers',
        sourceRecordRef: canonical['supplier_name'],
        issueDescription: `Missing or invalid ABN across all merged rows`,
        actionTaken: 'flagged',
        justification: 'No row in this group had a valid 11-digit ABN.',
      });
      flagged++;
    }
  }

  console.log(`Suppliers: ${inserted} rows inserted (from ${records.length} source rows), ${flagged} flags raised.`);
}

ingestSuppliers()
  .then(() => pool.end())
  .catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });