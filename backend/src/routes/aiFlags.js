const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { psychosocial_only, mismatch_only } = req.query;

let query = `
  SELECT
    i.incident_id,
    to_char(i.incident_date, 'YYYY-MM-DD') AS incident_date,
    i.type_code,
    i.severity_normalised,
    i.description,
    f.ai_category,
    f.is_psychosocial,
    f.severity_mismatch,
    f.evidence,
    f.confidence,
    f.model
  FROM ai_incident_findings f
  JOIN incidents i ON i.id = f.incident_id
  WHERE 1=1
`;

    if (psychosocial_only === 'true') {
      query += ` AND f.is_psychosocial = true`;
    }

    if (mismatch_only === 'true') {
      query += ` AND f.severity_mismatch = true`;
    }

    query += ` ORDER BY i.incident_id`;

    const result = await pool.query(query);

    res.json({
      total: result.rows.length,
      findings: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch AI incident flags' });
  }
});

module.exports = router;