const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { source_table, action_taken } = req.query;

    let query = `
      SELECT id, source_table, source_record_ref, issue_description, action_taken, justification, created_at
      FROM data_quality_flags
      WHERE 1=1
    `;
    const params = [];

    if (source_table) {
      params.push(source_table);
      query += ` AND source_table = $${params.length}`;
    }

    if (action_taken) {
      params.push(action_taken);
      query += ` AND action_taken = $${params.length}`;
    }

    query += ` ORDER BY source_table, source_record_ref`;

    const flagsResult = await pool.query(query, params);

    // Build summary from the SAME filtered rows, not a separate unfiltered query
    const summary = {};
    for (const row of flagsResult.rows) {
      if (!summary[row.source_table]) summary[row.source_table] = {};
      summary[row.source_table][row.action_taken] = (summary[row.source_table][row.action_taken] || 0) + 1;
    }

    res.json({
      summary,
      total_flags: flagsResult.rows.length,
      flags: flagsResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate data quality report' });
  }
});

module.exports = router;