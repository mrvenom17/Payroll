import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data', 'payroll.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase(db);
    runMigrations(db);
  }
  return db;
}

function columnExists(database, table, column) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

function addColumnIfMissing(database, table, column, ddl) {
  if (!columnExists(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function runMigrations(database) {
  // 1. audit_logs: legacy schema used (user_id, entity, old_value, new_value).
  //    All routes in app/api use a newer schema (company_id, entity_type, details, performed_by).
  //    Drop & recreate — the legacy table never had successful writes.
  const auditCols = database.prepare('PRAGMA table_info(audit_logs)').all().map(c => c.name);
  const needsAuditRebuild = !auditCols.includes('entity_type') || !auditCols.includes('details') || !auditCols.includes('company_id');
  if (needsAuditRebuild) {
    database.exec(`
      DROP TABLE IF EXISTS audit_logs;
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details TEXT,
        performed_by TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_company_created ON audit_logs(company_id, created_at DESC);
    `);
  }

  // 2. fnf_settlements: add payment tracking columns (NEFT / Cheque etc.)
  addColumnIfMissing(database, 'fnf_settlements', 'payment_mode', "payment_mode TEXT DEFAULT 'NEFT'");
  addColumnIfMissing(database, 'fnf_settlements', 'payment_reference', 'payment_reference TEXT');
  addColumnIfMissing(database, 'fnf_settlements', 'payment_bank', 'payment_bank TEXT');
  addColumnIfMissing(database, 'fnf_settlements', 'payment_date', 'payment_date TEXT');
  addColumnIfMissing(database, 'fnf_settlements', 'payment_notes', 'payment_notes TEXT');
  addColumnIfMissing(database, 'fnf_settlements', 'paid_at', 'paid_at TEXT');

  // 3. payroll: add payment tracking columns at the batch level (per-employee detail in `payments`)
  addColumnIfMissing(database, 'payroll', 'payment_mode', 'payment_mode TEXT');
  addColumnIfMissing(database, 'payroll', 'payment_reference', 'payment_reference TEXT');

  // 4. payments table — one row per actual payment (NEFT batch entry or single cheque).
  //    Payroll runs use one NEFT row per employee (sharing UTR) or per-employee cheques.
  database.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      payment_kind TEXT NOT NULL CHECK(payment_kind IN ('PAYROLL','FNF','LOAN_DISBURSEMENT','ADVANCE')),
      reference_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      company_id TEXT,
      amount REAL NOT NULL,
      payment_mode TEXT NOT NULL CHECK(payment_mode IN ('NEFT','CHEQUE','CASH','UPI','RAZORPAY','IMPS','RTGS')),
      payment_date TEXT NOT NULL,
      utr_number TEXT,
      from_bank_account TEXT,
      cheque_number TEXT,
      cheque_bank TEXT,
      cheque_date TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('PENDING','COMPLETED','BOUNCED','CANCELLED')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );
    CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(payment_kind, reference_id);
    CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
  `);

  // 5. Seed default payment settings if absent
  const defaultMode = database.prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'default_payment_mode'`).get();
  if (!defaultMode) {
    const upsert = database.prepare(`INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO NOTHING`);
    upsert.run('default_payment_mode', 'NEFT');
    upsert.run('payer_bank_name', 'State Bank of India');
    upsert.run('payer_account_number', '');
    upsert.run('payer_ifsc', '');
    upsert.run('next_cheque_number', '000001');
  }
}

function initializeDatabase(database) {
  database.exec(`
    -- Companies
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      address TEXT,
      gstin TEXT,
      pan TEXT,
      tan TEXT,
      pf_registration TEXT,
      esic_registration TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Departments
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      UNIQUE(company_id, code)
    );

    -- Employees
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      employee_code TEXT NOT NULL UNIQUE,
      
      -- Personal
      full_name TEXT NOT NULL,
      father_spouse_name TEXT,
      date_of_birth TEXT,
      gender TEXT CHECK(gender IN ('Male','Female','Other')),
      mobile_number TEXT,
      email_id TEXT,
      current_address TEXT,
      permanent_address TEXT,
      photo_url TEXT,
      
      -- Employment
      joining_date TEXT NOT NULL,
      department_id TEXT,
      designation TEXT,
      reporting_manager_id TEXT,
      employment_type TEXT CHECK(employment_type IN ('Permanent','Contract','Trainee')) DEFAULT 'Permanent',
      work_location TEXT,
      probation_end_date TEXT,
      
      -- Statutory
      pan_number TEXT,
      aadhaar_number TEXT,
      uan TEXT,
      pf_number TEXT,
      esic_number TEXT,
      pt_state TEXT DEFAULT 'MP',
      lwf_applicable INTEGER DEFAULT 1,
      tds_applicable INTEGER DEFAULT 1,
      previous_employer_income REAL DEFAULT 0,
      previous_employer_tds REAL DEFAULT 0,
      
      -- Bank
      bank_name TEXT,
      account_number TEXT,
      ifsc_code TEXT,
      branch_name TEXT,
      payment_mode TEXT DEFAULT 'Bank Transfer',
      
      -- Tax
      tax_regime TEXT DEFAULT 'NEW' CHECK(tax_regime IN ('OLD','NEW')),
      skill_category TEXT DEFAULT 'Unskilled' CHECK(skill_category IN ('Unskilled','Semi-skilled','Skilled','Highly Skilled')),
      
      -- Status
      is_active INTEGER DEFAULT 1,
      exit_date TEXT,
      exit_reason TEXT,
      
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (reporting_manager_id) REFERENCES employees(id)
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Documents
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- System Settings (Key Value Store)
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );


    -- Salary Components Master
    CREATE TABLE IF NOT EXISTS salary_components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('EARNING','DEDUCTION')),
      is_statutory INTEGER DEFAULT 0,
      is_fixed INTEGER DEFAULT 1,
      is_taxable INTEGER DEFAULT 1,
      contributes_to_pf INTEGER DEFAULT 0,
      contributes_to_esic INTEGER DEFAULT 0,
      tax_deductible INTEGER DEFAULT 0,
      percent_of TEXT,
      default_percent REAL,
      default_amount REAL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0
    );

    -- Employee Salary Structure
    CREATE TABLE IF NOT EXISTS salary_structures (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL UNIQUE,
      ctc_annual REAL NOT NULL,
      ctc_monthly REAL NOT NULL,
      effective_from TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- Salary Structure Details (component-wise breakdown)
    CREATE TABLE IF NOT EXISTS salary_structure_details (
      id TEXT PRIMARY KEY,
      salary_structure_id TEXT NOT NULL,
      component_id TEXT NOT NULL,
      monthly_amount REAL NOT NULL,
      annual_amount REAL NOT NULL,
      FOREIGN KEY (salary_structure_id) REFERENCES salary_structures(id) ON DELETE CASCADE,
      FOREIGN KEY (component_id) REFERENCES salary_components(id),
      UNIQUE(salary_structure_id, component_id)
    );

    -- Investments (80C, 80D, HRA)
    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      section TEXT NOT NULL,
      type TEXT NOT NULL,
      declared_amount REAL DEFAULT 0,
      verified_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      documents TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- Attendance
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      total_working_days INTEGER DEFAULT 0,
      present_days REAL DEFAULT 0,
      absent_days REAL DEFAULT 0,
      paid_leaves REAL DEFAULT 0,
      unpaid_leaves REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      late_marks INTEGER DEFAULT 0,
      half_days REAL DEFAULT 0,
      holidays REAL DEFAULT 0,
      sundays INTEGER DEFAULT 0,
      cl_balance REAL DEFAULT 0,
      sl_balance REAL DEFAULT 0,
      el_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      UNIQUE(employee_id, month, year)
    );

    -- Payroll (Monthly Run)
    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      total_working_days INTEGER DEFAULT 0,
      paid_days REAL DEFAULT 0,
      
      basic_salary REAL DEFAULT 0,
      hra REAL DEFAULT 0,
      conveyance REAL DEFAULT 0,
      medical REAL DEFAULT 0,
      special_allowance REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      overtime REAL DEFAULT 0,
      arrears REAL DEFAULT 0,
      reimbursements REAL DEFAULT 0,
      gross_earnings REAL DEFAULT 0,
      
      pf_deduction REAL DEFAULT 0,
      esic_deduction REAL DEFAULT 0,
      pt_deduction REAL DEFAULT 0,
      tds_deduction REAL DEFAULT 0,
      loan_deduction REAL DEFAULT 0,
      advance_deduction REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      total_deductions REAL DEFAULT 0,
      
      net_salary REAL DEFAULT 0,
      
      employer_pf REAL DEFAULT 0,
      employer_esic REAL DEFAULT 0,
      
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','PAID')),
      approved_by TEXT,
      approved_at TEXT,
      paid_at TEXT,
      
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      UNIQUE(employee_id, month, year)
    );

    -- Loans
    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      loan_type TEXT NOT NULL,
      loan_amount REAL NOT NULL,
      emi_amount REAL NOT NULL,
      total_emis INTEGER NOT NULL,
      paid_emis INTEGER DEFAULT 0,
      balance_outstanding REAL NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED','WRITTEN_OFF')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- FNF Settlement
    CREATE TABLE IF NOT EXISTS fnf_settlements (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL UNIQUE,
      last_working_date TEXT NOT NULL,
      notice_period_days INTEGER DEFAULT 30,
      notice_period_recovery REAL DEFAULT 0,
      leave_encashment REAL DEFAULT 0,
      gratuity REAL DEFAULT 0,
      bonus_payable REAL DEFAULT 0,
      pending_deductions REAL DEFAULT 0,
      asset_recovery INTEGER DEFAULT 0,
      asset_recovery_amount REAL DEFAULT 0,
      noc_status TEXT DEFAULT 'PENDING',
      final_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','PAID')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- Investment Declarations
    CREATE TABLE IF NOT EXISTS investment_declarations (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      section_80c REAL DEFAULT 0,
      section_80d REAL DEFAULT 0,
      rent_paid REAL DEFAULT 0,
      landlord_pan TEXT,
      is_metro_city INTEGER DEFAULT 0,
      other_income REAL DEFAULT 0,
      other_deductions REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      UNIQUE(employee_id, financial_year)
    );

    -- Salary Revisions
    CREATE TABLE IF NOT EXISTS salary_revisions (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      old_ctc REAL NOT NULL,
      new_ctc REAL NOT NULL,
      effective_from TEXT NOT NULL,
      reason TEXT,
      approved_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- Audit Log
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default data
  seedDefaults(database);
}

function generateId() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

function seedDefaults(database) {
  // Check if already seeded
  const companyCount = database.prepare('SELECT COUNT(*) as count FROM companies').get();
  if (companyCount.count > 0) return;

  // Seed Companies
  database.prepare(`
    INSERT INTO companies (id, name, code, address) VALUES (?, ?, ?, ?)
  `).run('comp_uabiotech', 'UA BIOTECH', 'UABIO', 'Madhya Pradesh, India');

  database.prepare(`
    INSERT INTO companies (id, name, code, address) VALUES (?, ?, ?, ?)
  `).run('comp_anagha', 'ANAGHA', 'ANA', 'Madhya Pradesh, India');

  // Seed Departments
  const depts = [
    ['dept_hr', 'comp_uabiotech', 'Human Resources', 'HR'],
    ['dept_sales', 'comp_uabiotech', 'Sales & Marketing', 'SALES'],
    ['dept_prod', 'comp_uabiotech', 'Production', 'PROD'],
    ['dept_qa', 'comp_uabiotech', 'Quality Assurance', 'QA'],
    ['dept_accounts', 'comp_uabiotech', 'Accounts & Finance', 'ACCTS'],
    ['dept_admin', 'comp_uabiotech', 'Administration', 'ADMIN'],
    ['dept_rd', 'comp_uabiotech', 'R&D', 'RD'],
    ['dept_warehouse', 'comp_uabiotech', 'Warehouse & Logistics', 'WH'],
  ];
  const insertDept = database.prepare('INSERT INTO departments (id, company_id, name, code) VALUES (?, ?, ?, ?)');
  depts.forEach(d => insertDept.run(...d));

  // Seed Salary Components
  const components = [
    ['sc_basic', 'Basic Salary', 'BASIC', 'EARNING', 0, 1, null, null, 'Base salary component', 1],
    ['sc_hra', 'House Rent Allowance', 'HRA', 'EARNING', 0, 0, 'BASIC', 40, 'HRA - 40% of Basic (non-metro), 50% (metro)', 2],
    ['sc_conv', 'Conveyance Allowance', 'CONV', 'EARNING', 0, 1, null, null, 'Transport allowance', 3],
    ['sc_med', 'Medical Allowance', 'MED', 'EARNING', 0, 1, null, null, 'Medical reimbursement', 4],
    ['sc_spl', 'Special Allowance', 'SPL', 'EARNING', 0, 1, null, null, 'Balancing component', 5],
    ['sc_bonus', 'Bonus / Incentive', 'BONUS', 'EARNING', 0, 1, null, null, 'Performance bonus', 6],
    ['sc_ot', 'Overtime', 'OT', 'EARNING', 0, 1, null, null, 'Overtime pay', 7],
    ['sc_pf', 'Provident Fund (Employee)', 'PF', 'DEDUCTION', 1, 0, 'BASIC', 12, 'EPF - 12% of Basic (max ₹15,000 base)', 10],
    ['sc_esic', 'ESIC (Employee)', 'ESIC', 'DEDUCTION', 1, 0, 'GROSS', 0.75, 'ESIC - 0.75% of Gross (if ≤ ₹21,000)', 11],
    ['sc_pt', 'Professional Tax', 'PT', 'DEDUCTION', 1, 1, null, null, 'State professional tax', 12],
    ['sc_tds', 'TDS (Income Tax)', 'TDS', 'DEDUCTION', 1, 1, null, null, 'Monthly TDS deduction', 13],
    ['sc_loan', 'Loan Deduction', 'LOAN', 'DEDUCTION', 0, 1, null, null, 'Loan EMI deduction', 14],
    ['sc_advance', 'Advance Deduction', 'ADV', 'DEDUCTION', 0, 1, null, null, 'Salary advance recovery', 15],
    ['sc_other', 'Other Deductions', 'OTHER', 'DEDUCTION', 0, 1, null, null, 'Miscellaneous deductions', 16],
  ];
  const insertComp = database.prepare(
    'INSERT INTO salary_components (id, name, code, type, is_statutory, is_fixed, percent_of, default_percent, description, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  components.forEach(c => insertComp.run(...c));

  // Seed sample employees
  const sampleEmployees = [
    {
      id: 'emp_001', company_id: 'comp_uabiotech', employee_code: 'UABIO-001',
      full_name: 'Rajesh Kumar Sharma', father_spouse_name: 'Ramesh Sharma',
      date_of_birth: '1990-05-15', gender: 'Male', mobile_number: '9876543210',
      email_id: 'rajesh@uabiotech.com', joining_date: '2022-01-10',
      department_id: 'dept_sales', designation: 'Area Sales Manager',
      employment_type: 'Permanent', work_location: 'Jabalpur',
      pan_number: 'ABCPS1234A', aadhaar_number: '123456789012',
      skill_category: 'Skilled', tax_regime: 'NEW',
      bank_name: 'State Bank of India', account_number: '12345678901234',
      ifsc_code: 'SBIN0001234', branch_name: 'Jabalpur Main',
      current_address: 'Vijay Nagar, Jabalpur, MP', permanent_address: 'Vijay Nagar, Jabalpur, MP'
    },
    {
      id: 'emp_002', company_id: 'comp_uabiotech', employee_code: 'UABIO-002',
      full_name: 'Priya Singh', father_spouse_name: 'Anil Singh',
      date_of_birth: '1993-08-22', gender: 'Female', mobile_number: '9876543211',
      email_id: 'priya@uabiotech.com', joining_date: '2023-04-01',
      department_id: 'dept_hr', designation: 'HR Executive',
      employment_type: 'Permanent', work_location: 'Jabalpur',
      pan_number: 'DEFPS5678B', aadhaar_number: '234567890123',
      skill_category: 'Skilled', tax_regime: 'NEW',
      bank_name: 'HDFC Bank', account_number: '23456789012345',
      ifsc_code: 'HDFC0001234', branch_name: 'Jabalpur Civil Lines',
      current_address: 'Napier Town, Jabalpur, MP', permanent_address: 'Napier Town, Jabalpur, MP'
    },
    {
      id: 'emp_003', company_id: 'comp_uabiotech', employee_code: 'UABIO-003',
      full_name: 'Amit Verma', father_spouse_name: 'Suresh Verma',
      date_of_birth: '1988-12-03', gender: 'Male', mobile_number: '9876543212',
      email_id: 'amit@uabiotech.com', joining_date: '2020-07-15',
      department_id: 'dept_prod', designation: 'Production Supervisor',
      employment_type: 'Permanent', work_location: 'Jabalpur',
      pan_number: 'GHIPS9012C', aadhaar_number: '345678901234',
      skill_category: 'Highly Skilled', tax_regime: 'OLD',
      bank_name: 'ICICI Bank', account_number: '34567890123456',
      ifsc_code: 'ICIC0001234', branch_name: 'Jabalpur Madan Mahal',
      current_address: 'Madan Mahal, Jabalpur, MP', permanent_address: 'Madan Mahal, Jabalpur, MP'
    },
    {
      id: 'emp_004', company_id: 'comp_uabiotech', employee_code: 'UABIO-004',
      full_name: 'Sneha Patel', father_spouse_name: 'Mahesh Patel',
      date_of_birth: '1995-03-18', gender: 'Female', mobile_number: '9876543213',
      email_id: 'sneha@uabiotech.com', joining_date: '2024-01-15',
      department_id: 'dept_qa', designation: 'QA Analyst',
      employment_type: 'Trainee', work_location: 'Jabalpur',
      pan_number: 'JKLPS3456D', aadhaar_number: '456789012345',
      skill_category: 'Semi-skilled', tax_regime: 'NEW',
      bank_name: 'Axis Bank', account_number: '45678901234567',
      ifsc_code: 'UTIB0001234', branch_name: 'Jabalpur Wright Town',
      current_address: 'Wright Town, Jabalpur, MP', permanent_address: 'Sagar, MP',
      probation_end_date: '2024-07-15'
    },
    {
      id: 'emp_005', company_id: 'comp_uabiotech', employee_code: 'UABIO-005',
      full_name: 'Vikram Yadav', father_spouse_name: 'Dinesh Yadav',
      date_of_birth: '1991-11-25', gender: 'Male', mobile_number: '9876543214',
      email_id: 'vikram@uabiotech.com', joining_date: '2021-09-01',
      department_id: 'dept_sales', designation: 'Sales Executive',
      employment_type: 'Permanent', work_location: 'Bhopal',
      pan_number: 'MNOPS7890E', aadhaar_number: '567890123456',
      skill_category: 'Skilled', tax_regime: 'NEW',
      bank_name: 'State Bank of India', account_number: '56789012345678',
      ifsc_code: 'SBIN0005678', branch_name: 'Bhopal MP Nagar',
      current_address: 'MP Nagar, Bhopal, MP', permanent_address: 'MP Nagar, Bhopal, MP'
    },
    {
      id: 'emp_006', company_id: 'comp_uabiotech', employee_code: 'UABIO-006',
      full_name: 'Neha Gupta', father_spouse_name: 'Rakesh Gupta',
      date_of_birth: '1994-07-10', gender: 'Female', mobile_number: '9876543215',
      email_id: 'neha@uabiotech.com', joining_date: '2023-06-15',
      department_id: 'dept_accounts', designation: 'Accounts Executive',
      employment_type: 'Permanent', work_location: 'Jabalpur',
      skill_category: 'Skilled', tax_regime: 'NEW',
      bank_name: 'Punjab National Bank', account_number: '67890123456789',
      ifsc_code: 'PUNB0001234', branch_name: 'Jabalpur Sadar',
      current_address: 'Sadar Bazar, Jabalpur, MP', permanent_address: 'Sadar Bazar, Jabalpur, MP'
    },
    {
      id: 'emp_007', company_id: 'comp_uabiotech', employee_code: 'UABIO-007',
      full_name: 'Rahul Tiwari', father_spouse_name: 'Sunil Tiwari',
      date_of_birth: '1989-02-28', gender: 'Male', mobile_number: '9876543216',
      email_id: 'rahul@uabiotech.com', joining_date: '2019-03-01',
      department_id: 'dept_warehouse', designation: 'Warehouse Manager',
      employment_type: 'Permanent', work_location: 'Jabalpur',
      skill_category: 'Highly Skilled', tax_regime: 'OLD',
      bank_name: 'Bank of Baroda', account_number: '78901234567890',
      ifsc_code: 'BARB0001234', branch_name: 'Jabalpur Gorakhpur',
      current_address: 'Gorakhpur, Jabalpur, MP', permanent_address: 'Gorakhpur, Jabalpur, MP'
    },
    {
      id: 'emp_008', company_id: 'comp_uabiotech', employee_code: 'UABIO-008',
      full_name: 'Anita Jain', father_spouse_name: 'Sanjay Jain',
      date_of_birth: '1996-09-12', gender: 'Female', mobile_number: '9876543217',
      email_id: 'anita@uabiotech.com', joining_date: '2024-11-01',
      department_id: 'dept_rd', designation: 'Research Associate',
      employment_type: 'Trainee', work_location: 'Jabalpur',
      skill_category: 'Skilled', tax_regime: 'NEW',
      bank_name: 'Kotak Mahindra', account_number: '89012345678901',
      ifsc_code: 'KKBK0001234', branch_name: 'Jabalpur South',
      current_address: 'South Civil Lines, Jabalpur, MP', permanent_address: 'Katni, MP',
      probation_end_date: '2025-05-01'
    },
    {
      id: 'emp_009', company_id: 'comp_uabiotech', employee_code: 'UABIO-009',
      full_name: 'Deepak Mishra', father_spouse_name: 'Kamlesh Mishra',
      date_of_birth: '1987-06-20', gender: 'Male', mobile_number: '9876543218',
      email_id: 'deepak@uabiotech.com', joining_date: '2018-01-10',
      department_id: 'dept_admin', designation: 'Admin Manager',
      employment_type: 'Permanent', work_location: 'Jabalpur',
      skill_category: 'Highly Skilled', tax_regime: 'OLD',
      bank_name: 'Union Bank', account_number: '90123456789012',
      ifsc_code: 'UBIN0001234', branch_name: 'Jabalpur Cantonment',
      current_address: 'Cantonment, Jabalpur, MP', permanent_address: 'Cantonment, Jabalpur, MP',
      is_active: 0, exit_date: '2026-03-31', exit_reason: 'Resignation'
    },
    {
      id: 'emp_010', company_id: 'comp_uabiotech', employee_code: 'UABIO-010',
      full_name: 'Moksh Jain', father_spouse_name: 'Pankaj Jain',
      date_of_birth: '1992-04-24', gender: 'Male', mobile_number: '9876543219',
      email_id: 'moksh@uabiotech.com', joining_date: '2022-08-01',
      department_id: 'dept_sales', designation: 'Regional Sales Manager',
      employment_type: 'Permanent', work_location: 'Jabalpur',
      skill_category: 'Highly Skilled', tax_regime: 'NEW',
      bank_name: 'HDFC Bank', account_number: '01234567890123',
      ifsc_code: 'HDFC0005678', branch_name: 'Jabalpur Napier Town',
      current_address: 'Napier Town, Jabalpur, MP', permanent_address: 'Napier Town, Jabalpur, MP'
    },
  ];

  const empFields = Object.keys(sampleEmployees[0]);
  const empPlaceholders = empFields.map(() => '?').join(', ');
  const insertEmp = database.prepare(
    `INSERT INTO employees (${empFields.join(', ')}) VALUES (${empPlaceholders})`
  );

  sampleEmployees.forEach(emp => {
    const values = empFields.map(f => emp[f] !== undefined ? emp[f] : null);
    insertEmp.run(...values);
  });

  // Seed salary structures for active employees
  const salaryData = [
    { emp: 'emp_001', ctc: 480000 },
    { emp: 'emp_002', ctc: 360000 },
    { emp: 'emp_003', ctc: 540000 },
    { emp: 'emp_004', ctc: 240000 },
    { emp: 'emp_005', ctc: 420000 },
    { emp: 'emp_006', ctc: 300000 },
    { emp: 'emp_007', ctc: 600000 },
    { emp: 'emp_008', ctc: 216000 },
    { emp: 'emp_009', ctc: 480000 },
    { emp: 'emp_010', ctc: 720000 },
  ];

  const insertStructure = database.prepare(
    'INSERT INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from) VALUES (?, ?, ?, ?, ?)'
  );
  const insertDetail = database.prepare(
    'INSERT INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES (?, ?, ?, ?, ?)'
  );

  salaryData.forEach(({ emp, ctc }) => {
    const monthly = Math.round(ctc / 12);
    const structId = 'sal_' + emp;
    insertStructure.run(structId, emp, ctc, monthly, '2024-04-01');

    // Standard CTC breakdown
    const basic = Math.round(ctc * 0.40 / 12);
    const hra = Math.round(basic * 0.40);
    const conv = 1600;
    const med = 1250;
    const pfEmp = Math.round(Math.min(basic, 15000) * 0.12);
    const special = monthly - basic - hra - conv - med;

    const details = [
      ['sc_basic', basic, basic * 12],
      ['sc_hra', hra, hra * 12],
      ['sc_conv', conv, conv * 12],
      ['sc_med', med, med * 12],
      ['sc_spl', Math.max(special, 0), Math.max(special, 0) * 12],
    ];

    details.forEach(([compId, monthAmt, annualAmt]) => {
      insertDetail.run(generateId(), structId, compId, monthAmt, annualAmt);
    });
  });

  // Seed attendance for current month (April 2026)
  const insertAttendance = database.prepare(`
    INSERT INTO attendance (id, employee_id, month, year, total_working_days, present_days, absent_days, paid_leaves, unpaid_leaves, cl_balance, sl_balance, el_balance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const activeEmps = ['emp_001','emp_002','emp_003','emp_004','emp_005','emp_006','emp_007','emp_008','emp_010'];
  activeEmps.forEach((empId, i) => {
    const present = 18 - (i % 3); // vary slightly
    const absent = i === 1 ? 1 : 0;
    const leaves = i === 3 ? 1 : 0;
    insertAttendance.run(
      generateId(), empId, 4, 2026, 22, present, absent, leaves, 0,
      6 - (i % 2), 4, 12 + (i % 3)
    );
  });
}

export { getDb, generateId };
