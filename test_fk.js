const { createPool } = require('mysql2/promise');

async function test() {
  const pool = createPool({
    host: '192.168.1.12',
    user: 'payroll_app',
    password: 'Payroll@SecurePass123',
    database: 'payroll_db'
  });

  try {
    const [comp] = await pool.execute("SELECT id FROM companies LIMIT 1");
    if (comp.length === 0) {
      console.log('No company found');
      return;
    }
    const companyId = comp[0].id;
    const empId = require('crypto').randomUUID();
    
    // Test 1: Insert with null
    console.log("Testing insert with NULL...");
    await pool.execute(
      `INSERT INTO employees (id, company_id, employee_code, full_name, joining_date, reporting_manager_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [empId, companyId, 'TEST-001', 'Test User', '2026-01-01', null]
    );
    console.log("Insert with NULL worked!");
    await pool.execute("DELETE FROM employees WHERE id = ?", [empId]);
    
    // Test 2: Insert with ''
    try {
      const empId2 = require('crypto').randomUUID();
      console.log("Testing insert with '' (empty string)...");
      await pool.execute(
        `INSERT INTO employees (id, company_id, employee_code, full_name, joining_date, reporting_manager_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [empId2, companyId, 'TEST-002', 'Test User 2', '2026-01-01', '']
      );
      console.log("Insert with '' worked? This shouldn't happen if FK fails.");
      await pool.execute("DELETE FROM employees WHERE id = ?", [empId2]);
    } catch(err) {
      console.error("Insert with '' failed as expected: ", err.message);
    }
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

test();
