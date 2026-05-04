const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Load .env.local manually (no dotenv dependency)
function loadEnvLocal() {
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

async function main() {
  const cfg = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'payroll_app',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'payroll_db',
  };
  console.log(`Connecting to ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ...`);

  const connection = await mysql.createConnection(cfg);

  const tryExec = async (label, sql) => {
    try {
      await connection.query(sql);
      console.log(`✓ ${label}`);
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_ENTRY') {
        console.log(`• ${label} (already applied)`);
      } else {
        console.error(`✗ ${label}: ${error.message}`);
      }
    }
  };

  try {
    await tryExec(
      'employees: pf_override / esic_override columns',
      'ALTER TABLE employees ADD COLUMN pf_override DECIMAL(14,2) DEFAULT NULL, ADD COLUMN esic_override DECIMAL(14,2) DEFAULT NULL;'
    );

    await tryExec(
      'payroll: petrol_allowance column',
      'ALTER TABLE payroll ADD COLUMN petrol_allowance DECIMAL(14,2) DEFAULT 0.00 AFTER conveyance;'
    );

    await tryExec(
      'salary_components: seed Petrol Allowance (PETROL)',
      `INSERT IGNORE INTO salary_components (id, name, code, type, is_statutory, is_fixed, percent_of, default_percent, description, display_order)
       VALUES ('sc_petrol', 'Petrol Allowance', 'PETROL', 'EARNING', 0, 1, NULL, NULL, 'Petrol allowance (excluded from PF & ESI base)', 4);`
    );
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
