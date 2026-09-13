import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pg_management_db';
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.trim().substring(0, 100), duration, rows: res.rowCount });
  }
  return res;
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

export const queryNamed = async <T extends QueryResultRow = any>(
  text: string,
  params: Record<string, any>,
  clientOrPool: Pool | PoolClient = pool
): Promise<QueryResult<T>> => {
  const values: any[] = [];
  const paramMap = new Map<string, number>();

  // Replaces @variable or single :variable (excluding ::casts) with $1, $2, etc., dynamically tracking used variables
  const formattedSql = text.replace(/(?:@|(?<!:):(?!:))([a-zA-Z_]\w*)\b/g, (match, paramName) => {
    if (paramName in params) {
      if (!paramMap.has(paramName)) {
        paramMap.set(paramName, values.length + 1);
        values.push(params[paramName] !== undefined ? params[paramName] : null);
      }
      return `$${paramMap.get(paramName)}`;
    }
    return match;
  });

  const start = Date.now();
  const res = await clientOrPool.query<T>(formattedSql, values);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed named query', { text: formattedSql.trim().substring(0, 100), duration, rows: res.rowCount });
  }
  return res;
};

export default {
  pool,
  query,
  queryNamed,
  getClient
};
