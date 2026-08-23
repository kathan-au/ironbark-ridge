require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pool = require('../db');
const { logFlag } = require('../dataQuality');

// --- Cleaning helpers ---

function parsePeriod(rawPeriod) {
  // Expected format: "2025-01" (YYYY-MM) -> first of month as a real date
  const value = rawPeriod.trim();
  if (!value.includes('-')) return null;

  const parts = value.split('-');
  if (parts.length !== 2) return null;

  const [year, month] = parts;
  if (year.length !== 4 || month.length !== 2) return null;

  return `${year}-${month}-01`;
}

function parseConsumption(rawConsumption, rawUnit) {
  const value = parseFloat(rawConsumption);
  if (isNaN(value)) return null;

  const unit = rawUnit.trim().toLowerCase();
  if (unit === 'kwh') return value;

  return null; // unrecognised unit, don't guess
}

// --- Anomaly detection: flag readings far below a meter's own average ---

function findLowReadings(records) {
  const byMeter = {};
  for (const r of records) {
    const meterId = r['meter_id'];
    const consumption = parseFloat(r['consumption']);
    if (!byMeter[meterId]) byMeter[meterId] = [];
    if (!isNaN(consumption)) byMeter[meterId].push(consumption);
  }

  const averages = {};
  for (const meterId in byMeter) {
    const values = byMeter[meterId];
    averages[meterId] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  const lowReadingRefs = new Set();
  for (const r of records) {
    const meterId = r['meter_id'];
    const consumption = parseFloat(r['consumption']);
    if (isNaN(consumption)) continue;

    const avg = averages[meterId];
    // Flag if a reading is less than half the meter's own average
    if (consumption < avg * 0.5) {
      lowReadingRefs.add(`${meterId}|${r['period']}`);
    }
  }
  return lowReadingRefs;
}

// --- Main ingestion ---

async function ingestElectricityReadings() {
  await pool.query('TRUNCATE electricity_readings RESTART IDENTITY CASCADE');
  await pool.query(`DELETE FROM data_quality_flags WHERE source_table = 'electricity_readings'`);

  const filePath = path.join(__dirname, '../../../data/electricity_meter_readings.csv');
  const csvContent = fs.readFileSync(filePath, 'utf-8');

  const records = parse(csvContent, {
    columns: header => header.map(h => h.trim()),
    skip_empty_lines: true,
  });

  const lowReadingRefs = findLowReadings(records);

  let inserted = 0;
  let flagged = 0;

  for (const row of records) {
    const meterId = row['meter_id'];
    const meterDescription = row['meter_description'];
    const rawPeriod = row['period'];
    const rawConsumption = row['consumption'];
    const rawUnit = row['unit'];

    const cleanedPeriod = parsePeriod(rawPeriod);
    const consumptionKwh = parseConsumption(rawConsumption, rawUnit);

    await pool.query(
      `INSERT INTO electricity_readings
       (meter_id, meter_description, period, consumption_kwh)
       VALUES ($1,$2,$3,$4)`,
      [meterId, meterDescription, cleanedPeriod, consumptionKwh]
    );
    inserted++;

    if (!cleanedPeriod) {
      await logFlag(pool, {
        sourceTable: 'electricity_readings',
        sourceRecordRef: `${meterId} ${rawPeriod}`,
        issueDescription: `Unparseable period format: "${rawPeriod}"`,
        actionTaken: 'flagged',
        justification: 'Period did not match expected YYYY-MM format; left as NULL rather than guessing.',
      });
      flagged++;
    }

    if (consumptionKwh === null) {
      await logFlag(pool, {
        sourceTable: 'electricity_readings',
        sourceRecordRef: `${meterId} ${rawPeriod}`,
        issueDescription: `Unrecognised unit "${rawUnit}" for consumption`,
        actionTaken: 'flagged',
        justification: 'Unit did not match expected kWh; normalised value left NULL to avoid misconverting.',
      });
      flagged++;
    }

    if (lowReadingRefs.has(`${meterId}|${rawPeriod}`)) {
      await logFlag(pool, {
        sourceTable: 'electricity_readings',
        sourceRecordRef: `${meterId} ${rawPeriod}`,
        issueDescription: `Reading (${rawConsumption} kWh) is less than half this meter's average consumption`,
        actionTaken: 'flagged',
        justification: 'Statistical anomaly relative to the meter\'s own 18-month average; likely a partial-month reading or meter fault rather than genuine consumption drop. Kept as-is since we cannot confirm the true value, but flagged for investigation.',
      });
      flagged++;
    }
  }

  // Check for a missing meter number in the sequence (MTR-01, 02, 03... gap?)
  const meterIds = [...new Set(records.map(r => r['meter_id']))].sort();
  const meterNumbers = meterIds.map(id => parseInt(id.replace('MTR-', ''), 10));
  const maxNumber = Math.max(...meterNumbers);
  for (let n = 1; n <= maxNumber; n++) {
    const expectedId = `MTR-${String(n).padStart(2, '0')}`;
    if (!meterIds.includes(expectedId)) {
      await logFlag(pool, {
        sourceTable: 'electricity_readings',
        sourceRecordRef: expectedId,
        issueDescription: `Meter ID "${expectedId}" is missing from the dataset entirely (sequence jumps from surrounding meters to MTR-${String(maxNumber).padStart(2,'0')})`,
        actionTaken: 'flagged',
        justification: 'Gap in meter numbering sequence; could indicate a decommissioned meter, a meter never reported, or a genuine numbering gap. No data exists to fill or reject.',
      });
      flagged++;
    }
  }

  console.log(`Electricity readings: ${inserted} rows inserted, ${flagged} flags raised.`);
}

ingestElectricityReadings()
  .then(() => pool.end())
  .catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });