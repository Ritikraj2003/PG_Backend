import fs from 'fs';
import path from 'path';
import pool from './database';

async function runMigrations() {
  console.log('Running Database Migrations...');
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      console.log(`Executing migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      await pool.query(sql);
      console.log(`  ✓ ${file} executed successfully`);
    }

    console.log('✅ All migrations executed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.pool.end();
  }
}

runMigrations();
