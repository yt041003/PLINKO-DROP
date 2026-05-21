'use strict';

const express = require('express');
const path    = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Plinko Drop server running on port ${PORT}`);
});
