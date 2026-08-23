require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const pool = require('./db');
const { logFlag } = require('./dataQuality');
// --- Cleaning helpers ---

function parseDate(rawDate) {
  const value = rawDate.trim();

  // Format 1: ISO date, e.g. "2025-12-19"
  // These have dashes and the first chunk is 4 digits long (a year)
  if (value.includes('-')) {
    const parts = value.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${year}-${month}-${day}`;
    }
  }

  // Format 2: DD/MM/YYYY, e.g. "21/05/2026"
  if (value.includes('/')) {
    const parts = value.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }
  }

  // Format 3: Mon-YY, e.g. "Oct-25" or "Feb-26"
  const months = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  if (value.includes('-')) {
    const parts = value.split('-');
    if (parts.length === 2 && months[parts[0]]) {
      const monthNumber = months[parts[0]];
      const year = '20' + parts[1];
      return `${year}-${monthNumber}-01`; // no day given, default to the 1st
    }
  }

  return null; // couldn't recognise the format at all
}

function parseQuantityLitres(rawQty, rawUnit) {
  const qty = parseFloat(rawQty);
  if (isNaN(qty)) return null;

  const unit = rawUnit.trim().toLowerCase();
  const litreSpellings = ['l', 'litres', 'liters'];
  const kilolitreSpellings = ['kl', 'kilolitres', 'kiloliters'];

  if (litreSpellings.includes(unit)) return qty;
  if (kilolitreSpellings.includes(unit)) return qty * 1000;

  return null; // still unrecognised, don't guess
}

function parseCostAud(rawCost) {
  // Strip out $ and , characters one at a time
  const cleaned = String(rawCost)
    .split('$').join('')
    .split(',').join('')
    .trim();

  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

function isMonthYearFormat(rawDate) {
  const value = rawDate.trim();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (!value.includes('-')) return false;

  const parts = value.split('-');
  if (parts.length !== 2) return false;

  const [monthPart, yearPart] = parts;
  return months.includes(monthPart) && yearPart.length === 2;
}

// --- Main ingestion ---

async function getOrCreateSite(siteName) {
  const existing = await pool.query('SELECT site_id FROM sites WHERE site_name = $1', [siteName]);
  if (existing.rows.length > 0) return existing.rows[0].site_id;

  const inserted = await pool.query(
    'INSERT INTO sites (site_name) VALUES ($1) RETURNING site_id',
    [siteName]
  );
  return inserted.rows[0].site_id;
}

async function ingestFuelDeliveries() {
  const filePath = path.join(__dirname, '../../data/fuel_deliveries.csv');
  const csvContent = fs.readFileSync(filePath, 'utf-8');

  const records = parse(csvContent, {
    columns: header => header.map(h => h.trim()), // strip stray spaces from headers
    skip_empty_lines: true,
  });

  let inserted = 0;
  let flagged = 0;

  for (const row of records) {
    const invoiceNo = row['Invoice No'];
    const rawDate = row['Delivery Date'];
    const fuelType = row['Fuel Type'];
    const rawQuantity = row['Quantity'];
    const rawUnit = row['Unit'];
    const rawCost = row['Cost (AUD)'];
    const siteArea = row['Site Area'];

    const cleanedDate = parseDate(rawDate);
    const quantityLitres = parseQuantityLitres(rawQuantity, rawUnit);
    const costAud = parseCostAud(rawCost);
    const siteId = await getOrCreateSite(siteArea);

    // Insert the row regardless — we keep raw values even if cleaning failed
    const result = await pool.query(
      `INSERT INTO fuel_deliveries
       (invoice_no, raw_delivery_date, cleaned_delivery_date, fuel_type,
        raw_quantity, quantity_litres, raw_unit, raw_cost, cost_aud, site_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [invoiceNo, rawDate, cleanedDate, fuelType, rawQuantity, quantityLitres, rawUnit, rawCost, costAud, siteId]
    );
    inserted++;

    // Flag anything we couldn't confidently parse
    if (!cleanedDate) {
      await logFlag(pool, {
        sourceTable: 'fuel_deliveries',
        sourceRecordRef: invoiceNo,
        issueDescription: `Unparseable delivery date format: "${rawDate}"`,
        actionTaken: 'flagged',
        justification: 'Date format did not match known patterns (ISO, DD/MM/YYYY, or Mon-YY); kept raw value, cleaned_delivery_date left NULL rather than guessing.',
      });
      flagged++;
    } else if (isMonthYearFormat(rawDate)) {
      // Mon-YY format parsed, but note we defaulted the day
      await logFlag(pool, {
        sourceTable: 'fuel_deliveries',
        sourceRecordRef: invoiceNo,
        issueDescription: `Delivery date "${rawDate}" only specifies month/year, no day`,
        actionTaken: 'fixed',
        justification: 'Defaulted to the 1st of the month; exact day is unknown and unrecoverable from source data.',
      });
    }

    if (quantityLitres === null) {
      await logFlag(pool, {
        sourceTable: 'fuel_deliveries',
        sourceRecordRef: invoiceNo,
        issueDescription: `Unrecognised unit "${rawUnit}" for quantity`,
        actionTaken: 'flagged',
        justification: 'Unit did not match known litre variants; normalised value left NULL to avoid silently misconverting.',
      });
      flagged++;
    }

    if (costAud === null) {
      await logFlag(pool, {
        sourceTable: 'fuel_deliveries',
        sourceRecordRef: invoiceNo,
        issueDescription: `Unparseable cost value "${rawCost}"`,
        actionTaken: 'flagged',
        justification: 'Cost string could not be converted to a number after stripping $ and commas.',
      });
      flagged++;
    }
  }

  console.log(`Fuel deliveries: ${inserted} rows inserted, ${flagged} flags raised.`);
}

ingestFuelDeliveries()
  .then(() => pool.end())
  .catch(err => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });