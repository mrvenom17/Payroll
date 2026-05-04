const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: '192.168.1.12',
    port: 3306,
    user: 'payroll_app',
    password: 'Payroll@SecurePass123',
    database: 'payroll_db'
  });

  try {
    console.log('Adding pf_override and esic_override columns to employees table...');
    await connection.query('ALTER TABLE employees ADD COLUMN pf_override DECIMAL(14,2) DEFAULT NULL, ADD COLUMN esic_override DECIMAL(14,2) DEFAULT NULL;');
    console.log('Successfully added columns!');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('Columns already exist.');
    } else {
      console.error('Error adding columns:', error.message);
    }
  } finally {
    await connection.end();
  }
}

main();
