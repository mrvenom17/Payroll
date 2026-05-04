const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '192.168.1.12',
    port: 3306,
    user: 'payroll_app',
    password: 'Payroll@SecurePass123',
    database: 'payroll_db'
  });

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

main();
