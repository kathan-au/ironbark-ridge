require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pool = require('../db');

async function ingestEmissionFactors() {
  await pool.query('TRUNCATE emission_factors RESTART IDENTITY CASCADE');

  const filePath = path.join(__dirname, '../../../data/emission_factors.csv');
  const csvContent = fs.readFileSync(filePath, 'utf-8');

  const records = parse(csvContent, {
    columns: header => header.map(h => h.trim()),
    skip_empty_lines: true,
  });

  for (const row of records) {
    await pool.query(
      `INSERT INTO emission_factors (activity, scope, unit, kg_co2e_per_unit, source)
       VALUES ($1,$2,$3,$4,$5)`,
      [row['activity'], parseInt(row['scope'], 10), row['unit'], parseFloat(row['kg_co2e_per_unit']), row['source']]
    );
  }

  console.log(`Emission factors: ${records.length} rows inserted.`);
}

ingestEmissionFactors()
  .then(() => pool.end())
  .catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });