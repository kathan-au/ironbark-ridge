require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const emissionsRouter = require('./routes/emissions');
const dataQualityRouter = require('./routes/dataQuality');
const incidentsRouter = require('./routes/incidents');
const aiFlagsRouter = require('./routes/aiFlags');


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/emissions', emissionsRouter);
app.use('/data-quality-report', dataQualityRouter);
app.use('/incidents', incidentsRouter);
app.use('/incidents/ai-flags', aiFlagsRouter);


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});