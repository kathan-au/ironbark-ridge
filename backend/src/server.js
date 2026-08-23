require('dotenv').config();
const express = require('express');
const pool = require('./db');
const emissionsRouter = require('./routes/emissions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/emissions', emissionsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});