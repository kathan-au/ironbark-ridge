const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/summary', async (req, res) => {
  try {
    // --- By month ---
    const byMonthResult = await pool.query(`
      SELECT to_char(incident_date, 'YYYY-MM') AS month, COUNT(*) AS count
      FROM incidents
      WHERE incident_date IS NOT NULL
      GROUP BY month
      ORDER BY month
    `);

    // --- By type ---
    const byTypeResult = await pool.query(`
      SELECT type_code, COUNT(*) AS count
      FROM incidents
      GROUP BY type_code
      ORDER BY count DESC
    `);

    // --- By severity ---
    const bySeverityResult = await pool.query(`
      SELECT severity_normalised, COUNT(*) AS count
      FROM incidents
      WHERE severity_normalised IS NOT NULL
      GROUP BY severity_normalised
      ORDER BY
        CASE severity_normalised
          WHEN 'Low' THEN 1
          WHEN 'Medium' THEN 2
          WHEN 'High' THEN 3
          ELSE 4
        END
    `);

    // --- Combined: month x type, useful for trend charts ---
    const byMonthAndTypeResult = await pool.query(`
      SELECT to_char(incident_date, 'YYYY-MM') AS month, type_code, COUNT(*) AS count
      FROM incidents
      WHERE incident_date IS NOT NULL
      GROUP BY month, type_code
      ORDER BY month, type_code
    `);

    res.json({
      total_incidents: byMonthResult.rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0),
      by_month: byMonthResult.rows.map(r => ({ month: r.month, count: parseInt(r.count, 10) })),
      by_type: byTypeResult.rows.map(r => ({ type_code: r.type_code, count: parseInt(r.count, 10) })),
      by_severity: bySeverityResult.rows.map(r => ({ severity: r.severity_normalised, count: parseInt(r.count, 10) })),
      by_month_and_type: byMonthAndTypeResult.rows.map(r => ({
        month: r.month,
        type_code: r.type_code,
        count: parseInt(r.count, 10),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate incident summary' });
  }
});

module.exports = router;