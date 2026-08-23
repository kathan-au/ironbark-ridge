require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a mine safety compliance analyst reviewing incident reports for Ironbark Ridge Resources.

You will receive a JSON array of incidents, each with: id, type (original coding), sev (severity: Low/Medium/High), desc (free-text description).

For EACH incident:
1. Assign "ai_category" — a safety category based on the actual description, which may differ from "type" if the original coding looks wrong. Use: Vehicle/Traffic, Equipment Failure, Dust/Air Quality, Environmental, Slip/Trip/Fall, Psychosocial, Electrical, Other.
2. Set "is_psychosocial" true if the description describes bullying, harassment, fatigue, understaffing, exclusion, or stress — REGARDLESS of the original "type" code.
3. Set "severity_mismatch" true ONLY if the description clearly contradicts "sev" (e.g. trivial description marked High, or serious/prolonged event marked Low).
4. Provide "evidence" — UNDER 15 WORDS, a short quote or precise paraphrase from "desc" that justifies your decisions. Must be grounded in the actual text.
5. Provide "confidence" — 0.0 to 1.0.

Respond with ONLY a JSON array, one object per incident, matching this shape exactly, nothing else:
[{"incident_id":"INC-2025-001","ai_category":"...","is_psychosocial":false,"severity_mismatch":false,"evidence":"...","confidence":0.9}]`;

function stripMarkdownFences(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    // Remove the opening fence line (```json or just ```)
    cleaned = cleaned.split('\n').slice(1).join('\n');
    const lastFenceIndex = cleaned.lastIndexOf('```');
    if (lastFenceIndex !== -1) {
      cleaned = cleaned.slice(0, lastFenceIndex);
    }
  }
  return cleaned.trim();
}

async function classifyIncidents() {
  const incidentsResult = await pool.query(`
    SELECT id, incident_id, type_code, severity_normalised, description
    FROM incidents
    ORDER BY id
  `);

  const incidents = incidentsResult.rows;
  console.log(`Classifying ${incidents.length} incidents...`);

  const userMessage = incidents.map(inc => ({
    id: inc.incident_id,
    type: inc.type_code,
    sev: inc.severity_normalised,
    desc: inc.description,
  }));

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: JSON.stringify(userMessage) }
    ],
  });

  console.log(`Tokens used: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

  if (response.stop_reason === 'max_tokens') {
    console.warn('WARNING: response was truncated by max_tokens — increase the limit or reduce batch size.');
  }

  const rawText = stripMarkdownFences(response.content[0].text);
  let findings;
  try {
    findings = JSON.parse(rawText);
  } catch (err) {
    console.error('Failed to parse AI response as JSON:', rawText.slice(0, 500));
    throw err;
  }

  // --- Grounding check: only accept findings for incident_ids that actually exist ---
  const validIncidentIds = new Set(incidents.map(i => i.incident_id));
  const incidentIdToDbId = {};
  for (const inc of incidents) incidentIdToDbId[inc.incident_id] = inc.id;

  await pool.query(`DELETE FROM ai_incident_findings`); // clear previous run

  let stored = 0;
  let rejected = 0;

  for (const finding of findings) {
    if (!validIncidentIds.has(finding.incident_id)) {
      console.warn(`Rejected finding for unknown incident_id: ${finding.incident_id}`);
      rejected++;
      continue; // never store a finding we can't trace back to a real record
    }

    await pool.query(
      `INSERT INTO ai_incident_findings
       (incident_id, ai_category, is_psychosocial, severity_mismatch, evidence, confidence, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        incidentIdToDbId[finding.incident_id],
        finding.ai_category,
        finding.is_psychosocial,
        finding.severity_mismatch,
        finding.evidence,
        finding.confidence,
        MODEL,
      ]
    );
    stored++;
  }

  console.log(`Stored ${stored} findings, rejected ${rejected} ungrounded/invalid findings.`);
}

classifyIncidents()
  .then(() => pool.end())
  .catch(err => {
    console.error('Classification failed:', err);
    process.exit(1);
  });