const express = require('express');
const pool = require('../db');

const router = express.Router();

const FUEL_TYPE_TO_ACTIVITY = {
  'Diesel': 'Diesel combustion (stationary & transport)',
  'Petrol (ULP)': 'Petrol (ULP) combustion',
};

router.get('/monthly', async (req, res) => {
  try {
    const { scope } = req.query;

    // --- Scope 1: fuel deliveries, grouped by month in SQL (no JS date math) ---
    const fuelFactorsResult = await pool.query(
      `SELECT activity, kg_co2e_per_unit FROM emission_factors WHERE scope = 1`
    );
    const fuelFactors = {};
    for (const row of fuelFactorsResult.rows) {
      fuelFactors[row.activity] = parseFloat(row.kg_co2e_per_unit);
    }

    const fuelRowsResult = await pool.query(
      `SELECT
         fuel_type,
         to_char(cleaned_delivery_date, 'YYYY-MM') AS month,
         quantity_litres
       FROM fuel_deliveries
       WHERE cleaned_delivery_date IS NOT NULL AND quantity_litres IS NOT NULL`
    );

    const scope1ByMonth = {};
    for (const row of fuelRowsResult.rows) {
      const activity = FUEL_TYPE_TO_ACTIVITY[row.fuel_type];
      const factor = fuelFactors[activity];
      if (!factor) continue;

      const emissions = parseFloat(row.quantity_litres) * factor;
      scope1ByMonth[row.month] = (scope1ByMonth[row.month] || 0) + emissions;
    }

    // --- Scope 2: electricity, same approach ---
    const electricityFactorResult = await pool.query(
      `SELECT kg_co2e_per_unit FROM emission_factors WHERE scope = 2 LIMIT 1`
    );
    const electricityFactor = parseFloat(electricityFactorResult.rows[0].kg_co2e_per_unit);

    const electricityRowsResult = await pool.query(
      `SELECT
         to_char(period, 'YYYY-MM') AS month,
         consumption_kwh
       FROM electricity_readings
       WHERE consumption_kwh IS NOT NULL`
    );

    const scope2ByMonth = {};
    for (const row of electricityRowsResult.rows) {
      const emissions = parseFloat(row.consumption_kwh) * electricityFactor;
      scope2ByMonth[row.month] = (scope2ByMonth[row.month] || 0) + emissions;
    }

    // --- Combine ---
    const allMonths = [...new Set([...Object.keys(scope1ByMonth), ...Object.keys(scope2ByMonth)])].sort();

    let results = allMonths.map(month => ({
      month,
      scope1_kg_co2e: Math.round(scope1ByMonth[month] || 0),
      scope2_kg_co2e: Math.round(scope2ByMonth[month] || 0),
    }));

    if (scope === '1') {
      results = results.map(r => ({ month: r.month, scope1_kg_co2e: r.scope1_kg_co2e }));
    } else if (scope === '2') {
      results = results.map(r => ({ month: r.month, scope2_kg_co2e: r.scope2_kg_co2e }));
    }

    res.json({ data: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate emissions' });
  }
});

module.exports = router;