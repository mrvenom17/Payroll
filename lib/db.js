import mysql from 'mysql2/promise';
import crypto from 'crypto';

// ── Connection Pool (singleton) ──────────────────────────────
let pool;

/**
 * Returns a shared mysql2 connection pool.
 * Config is read from environment variables (set in .env.local).
 *
 * Usage in API routes:
 *   const pool = getPool();
 *   const [rows] = await pool.execute('SELECT * FROM employees WHERE company_id = ?', [companyId]);
 *   const [[row]] = await pool.execute('SELECT * FROM employees WHERE id = ?', [id]);
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host:     process.env.MYSQL_HOST     || '127.0.0.1',
      port:     parseInt(process.env.MYSQL_PORT || '3306', 10),
      user:     process.env.MYSQL_USER     || 'payroll_app',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'payroll_db',

      // Pool sizing
      waitForConnections: true,
      connectionLimit:    parseInt(process.env.MYSQL_POOL_MAX || '10', 10),
      idleTimeout:        parseInt(process.env.MYSQL_POOL_IDLE_TIMEOUT || '30000', 10),
      queueLimit:         0,

      // Safety & compatibility
      namedPlaceholders:  false,       // use ? positional params
      dateStrings:        true,        // return dates as strings (matches existing code)
      timezone:           '+05:30',    // IST — India Standard Time
      supportBigNumbers:  true,
      bigNumberStrings:   false,
      decimalNumbers:     true,        // return DECIMALs as JS numbers
    });
  }
  return pool;
}

/**
 * Generate a unique ID (used as primary key for all tables).
 * Format: id_<timestamp36>_<random9>
 */
function generateId() {
  const ts  = Date.now().toString(36);
  const rnd = crypto.randomBytes(6).toString('base64url').slice(0, 9);
  return `id_${ts}_${rnd}`;
}

export { getPool, generateId };
