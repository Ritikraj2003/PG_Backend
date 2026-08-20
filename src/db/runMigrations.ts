import fs from 'fs';
import path from 'path';
import pool from './database';

async function runMigrations() {
  console.log('Running Database Migrations...');
  try {
    const migrationFile = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    await pool.query(sql);
    console.log('✅ Migrations executed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.pool.end();
  }
}

runMigrations();
