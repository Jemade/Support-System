const express = require('express');
const cors = require('cors');
const db = require('./database/db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 9141;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Avantis Support Backend API',
    database: db.isNativePgConnected ? 'PostgreSQL (Native Pool)' : 'PostgreSQL (In-Memory Engine)',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/v1', apiRoutes);

async function startServer() {
  console.log('[Avantis Backend] Initializing PostgreSQL database persistence...');
  await db.init();

  app.listen(PORT, () => {
    console.log(`[Avantis Backend] Server running on http://localhost:${PORT}`);
  });
}

startServer();
