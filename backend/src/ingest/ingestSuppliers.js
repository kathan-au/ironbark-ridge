require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pool = require('../db');
const { logFlag } = require('../lib/dataQuality');
const { normaliseAbn, groupDuplicateSuppliers } = require('../lib/supplierMatching');

async function ingestSuppliers() {
  await pool.query('TRUNCATE suppliers RESTART IDENTITY CASCADE');
  await pool.query(`DELETE FROM data_quality_flags WHERE source_table = 'suppliers'`);

  const filePath = path.join(__dirname, '../../../data/suppliers.csv');
  const csvContent = fs.readFileSync(filePath, 'utf-8');

  const records = parse(csvContent, {
    columns: header => header.map(h => h.trim()),
    skip_empty_lines: true,
  });

  const groups = groupDuplicateSuppliers(records);

  let inserted = 0;
  let flagged = 0;

  for (const rows of groups) {
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
        justification: `Matched via shared ABN and/or near-identical name after stripping legal suffixes. Combined FY spend across rows ($${totalSpend.toLocaleString('en-AU')}) rather than treating as separate suppliers.`,
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