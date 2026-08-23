
ALTER TABLE incidents DROP COLUMN IF EXISTS ai_category;
ALTER TABLE incidents DROP COLUMN IF EXISTS ai_is_psychosocial;
ALTER TABLE incidents DROP COLUMN IF EXISTS ai_severity_mismatch;
ALTER TABLE incidents DROP COLUMN IF EXISTS ai_mismatch_reasoning;

-- New table: keeps AI-derived judgments separate from source ground truth
CREATE TABLE ai_incident_findings (
    id SERIAL PRIMARY KEY,
    incident_id INT REFERENCES incidents(id) NOT NULL,
    ai_category TEXT,
    is_psychosocial BOOLEAN,
    severity_mismatch BOOLEAN,
    evidence TEXT,
    confidence NUMERIC,
    model TEXT,
    created_at TIMESTAMP DEFAULT now()
);