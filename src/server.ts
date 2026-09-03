import app from './app';
import { config } from './config/env';
import pool from './db/database';

const PORT = config.port;

const server = app.listen(PORT, async () => {
  console.log(`
  🚀 PG & Rental House Management SaaS Backend Server Started!
  -------------------------------------------------------------
  Environment: ${config.nodeEnv}
  Port:        ${PORT}
  API Endpoint: http://localhost:${PORT}/api
  HealthCheck: http://localhost:${PORT}/health
  -------------------------------------------------------------
  `);

  try {
    const dbTest = await pool.query('SELECT NOW()');
    console.log(`✅ Database Connected Successfully at ${dbTest.rows[0].now}`);
    await pool.query('ALTER TABLE beds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;');
    await pool.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;');
  } catch (err) {
    console.warn(`⚠️ Warning: Database connection failed. Please verify DATABASE_URL in .env:`, err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
});

export default server;
