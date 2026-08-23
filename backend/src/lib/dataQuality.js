async function logFlag(pool, { sourceTable, sourceRecordRef, issueDescription, actionTaken, justification }) {
  await pool.query(
    `INSERT INTO data_quality_flags (source_table, source_record_ref, issue_description, action_taken, justification)
     VALUES ($1, $2, $3, $4, $5)`,
    [sourceTable, sourceRecordRef, issueDescription, actionTaken, justification]
  );
}

module.exports = { logFlag };