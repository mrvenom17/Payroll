-- ============================================================
-- Payroll Management System — MySQL 8.0+ Schema
-- ============================================================
-- Run this file on the DB server to set up everything:
--   mysql -u root -p < database/schema.sql
--
-- This script is IDEMPOTENT — safe to re-run. Tables use
-- IF NOT EXISTS and seed data uses INSERT IGNORE.
-- ============================================================

-- 1. Create database
CREATE DATABASE IF NOT EXISTS payroll_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE payroll_db;

-- 2. Create application user (allow connections from any host on LAN)
--    Change the password below before running in production!
CREATE USER IF NOT EXISTS 'payroll_app'@'%'
  IDENTIFIED BY 'Payroll@SecurePass123';

GRANT ALL PRIVILEGES ON payroll_db.* TO 'payroll_app'@'%';
FLUSH PRIVILEGES;

-- ============================================================
-- TABLES
-- ============================================================

-- ---- Users (Authentication) --------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(36) PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,          -- bcrypt hash
  full_name   VARCHAR(255) NOT NULL,
  role        ENUM('super_admin','admin','hr','viewer') NOT NULL DEFAULT 'admin',
  company_id  VARCHAR(36),                    -- NULL = access all companies
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  last_login  DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---- Companies ---------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id                  VARCHAR(36) PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  code                VARCHAR(50)  NOT NULL UNIQUE,
  address             TEXT,
  gstin               VARCHAR(20),
  pan                 VARCHAR(15),
  tan                 VARCHAR(15),
  pf_registration     VARCHAR(50),
  esic_registration   VARCHAR(50),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---- Departments -------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id          VARCHAR(36) PRIMARY KEY,
  company_id  VARCHAR(36) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(50)  NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_dept_company_code (company_id, code)
) ENGINE=InnoDB;

-- ---- Employees ---------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id                      VARCHAR(36) PRIMARY KEY,
  company_id              VARCHAR(36) NOT NULL,
  employee_code           VARCHAR(50) NOT NULL UNIQUE,

  -- Personal
  full_name               VARCHAR(255) NOT NULL,
  father_spouse_name      VARCHAR(255),
  date_of_birth           DATE,
  gender                  ENUM('Male','Female','Other'),
  mobile_number           VARCHAR(20),
  email_id                VARCHAR(255),
  current_address         TEXT,
  permanent_address       TEXT,
  photo_url               VARCHAR(512),

  -- Employment
  joining_date            DATE NOT NULL,
  department_id           VARCHAR(36),
  designation             VARCHAR(255),
  reporting_manager_id    VARCHAR(36),
  employment_type         ENUM('Permanent','Contract','Trainee') DEFAULT 'Permanent',
  work_location           VARCHAR(255),
  probation_end_date      DATE,

  -- Statutory
  pan_number              VARCHAR(15),
  aadhaar_number          VARCHAR(15),
  uan                     VARCHAR(30),
  pf_number               VARCHAR(50),
  esic_number             VARCHAR(30),
  pt_state                VARCHAR(10) DEFAULT 'MP',
  lwf_applicable          TINYINT(1) DEFAULT 1,
  tds_applicable          TINYINT(1) DEFAULT 1,
  previous_employer_income DECIMAL(14,2) DEFAULT 0.00,
  previous_employer_tds    DECIMAL(14,2) DEFAULT 0.00,

  -- Bank
  bank_name               VARCHAR(255),
  account_number          VARCHAR(30),
  ifsc_code               VARCHAR(15),
  branch_name             VARCHAR(255),
  payment_mode            VARCHAR(30) DEFAULT 'Bank Transfer',

  -- Tax
  tax_regime              ENUM('OLD','NEW') DEFAULT 'NEW',
  skill_category          ENUM('Unskilled','Semi-skilled','Skilled','Highly Skilled') DEFAULT 'Unskilled',

  -- Status
  is_active               TINYINT(1) DEFAULT 1,
  exit_date               DATE,
  exit_reason             VARCHAR(255),

  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (company_id)          REFERENCES companies(id),
  FOREIGN KEY (department_id)       REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (reporting_manager_id) REFERENCES employees(id) ON DELETE SET NULL,

  INDEX idx_emp_company     (company_id),
  INDEX idx_emp_department  (department_id),
  INDEX idx_emp_active      (company_id, is_active)
) ENGINE=InnoDB;

-- ---- Salary Components Master ------------------------------
CREATE TABLE IF NOT EXISTS salary_components (
  id              VARCHAR(36) PRIMARY KEY,
  name            VARCHAR(255) NOT NULL UNIQUE,
  code            VARCHAR(20)  NOT NULL UNIQUE,
  type            ENUM('EARNING','DEDUCTION') NOT NULL,
  is_statutory    TINYINT(1) DEFAULT 0,
  is_fixed        TINYINT(1) DEFAULT 1,
  is_taxable      TINYINT(1) DEFAULT 1,
  contributes_to_pf   TINYINT(1) DEFAULT 0,
  contributes_to_esic TINYINT(1) DEFAULT 0,
  tax_deductible  TINYINT(1) DEFAULT 0,
  percent_of      VARCHAR(20),
  default_percent DECIMAL(6,2),
  default_amount  DECIMAL(14,2),
  description     TEXT,
  is_active       TINYINT(1) DEFAULT 1,
  display_order   INT DEFAULT 0
) ENGINE=InnoDB;

-- ---- Salary Structures (per employee) ----------------------
CREATE TABLE IF NOT EXISTS salary_structures (
  id            VARCHAR(36) PRIMARY KEY,
  employee_id   VARCHAR(36) NOT NULL UNIQUE,
  ctc_annual    DECIMAL(14,2) NOT NULL,
  ctc_monthly   DECIMAL(14,2) NOT NULL,
  effective_from DATE NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---- Salary Structure Details (component breakdown) --------
CREATE TABLE IF NOT EXISTS salary_structure_details (
  id                   VARCHAR(36) PRIMARY KEY,
  salary_structure_id  VARCHAR(36) NOT NULL,
  component_id         VARCHAR(36) NOT NULL,
  monthly_amount       DECIMAL(14,2) NOT NULL,
  annual_amount        DECIMAL(14,2) NOT NULL,
  FOREIGN KEY (salary_structure_id) REFERENCES salary_structures(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id)        REFERENCES salary_components(id),
  UNIQUE KEY uq_struct_component (salary_structure_id, component_id)
) ENGINE=InnoDB;

-- ---- Investments (80C, 80D, HRA) ---------------------------
CREATE TABLE IF NOT EXISTS investments (
  id              VARCHAR(36) PRIMARY KEY,
  employee_id     VARCHAR(36) NOT NULL,
  financial_year  VARCHAR(10) NOT NULL,
  section         VARCHAR(20) NOT NULL,
  type            VARCHAR(100) NOT NULL,
  declared_amount DECIMAL(14,2) DEFAULT 0.00,
  verified_amount DECIMAL(14,2) DEFAULT 0.00,
  status          ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
  documents       TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_inv_employee (employee_id)
) ENGINE=InnoDB;

-- ---- Attendance (monthly summary) --------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id                  VARCHAR(36) PRIMARY KEY,
  employee_id         VARCHAR(36) NOT NULL,
  month               TINYINT UNSIGNED NOT NULL,
  year                SMALLINT UNSIGNED NOT NULL,
  total_working_days  TINYINT UNSIGNED DEFAULT 0,
  present_days        DECIMAL(5,1) DEFAULT 0.0,
  absent_days         DECIMAL(5,1) DEFAULT 0.0,
  paid_leaves         DECIMAL(5,1) DEFAULT 0.0,
  unpaid_leaves       DECIMAL(5,1) DEFAULT 0.0,
  overtime_hours      DECIMAL(6,1) DEFAULT 0.0,
  late_marks          TINYINT UNSIGNED DEFAULT 0,
  half_days           DECIMAL(5,1) DEFAULT 0.0,
  holidays            DECIMAL(5,1) DEFAULT 0.0,
  sundays             TINYINT UNSIGNED DEFAULT 0,
  cl_balance          DECIMAL(5,1) DEFAULT 0.0,
  sl_balance          DECIMAL(5,1) DEFAULT 0.0,
  el_balance          DECIMAL(5,1) DEFAULT 0.0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY uq_attendance (employee_id, month, year),
  INDEX idx_att_period (month, year)
) ENGINE=InnoDB;

-- ---- Payroll (monthly run per employee) --------------------
CREATE TABLE IF NOT EXISTS payroll (
  id                  VARCHAR(36) PRIMARY KEY,
  employee_id         VARCHAR(36) NOT NULL,
  month               TINYINT UNSIGNED NOT NULL,
  year                SMALLINT UNSIGNED NOT NULL,
  total_working_days  TINYINT UNSIGNED DEFAULT 0,
  paid_days           DECIMAL(5,1) DEFAULT 0.0,

  basic_salary        DECIMAL(14,2) DEFAULT 0.00,
  hra                 DECIMAL(14,2) DEFAULT 0.00,
  conveyance          DECIMAL(14,2) DEFAULT 0.00,
  medical             DECIMAL(14,2) DEFAULT 0.00,
  special_allowance   DECIMAL(14,2) DEFAULT 0.00,
  bonus               DECIMAL(14,2) DEFAULT 0.00,
  overtime            DECIMAL(14,2) DEFAULT 0.00,
  arrears             DECIMAL(14,2) DEFAULT 0.00,
  reimbursements      DECIMAL(14,2) DEFAULT 0.00,
  gross_earnings      DECIMAL(14,2) DEFAULT 0.00,

  pf_deduction        DECIMAL(14,2) DEFAULT 0.00,
  esic_deduction      DECIMAL(14,2) DEFAULT 0.00,
  pt_deduction        DECIMAL(14,2) DEFAULT 0.00,
  tds_deduction       DECIMAL(14,2) DEFAULT 0.00,
  loan_deduction      DECIMAL(14,2) DEFAULT 0.00,
  advance_deduction   DECIMAL(14,2) DEFAULT 0.00,
  other_deductions    DECIMAL(14,2) DEFAULT 0.00,
  total_deductions    DECIMAL(14,2) DEFAULT 0.00,

  net_salary          DECIMAL(14,2) DEFAULT 0.00,

  employer_pf         DECIMAL(14,2) DEFAULT 0.00,
  employer_esic       DECIMAL(14,2) DEFAULT 0.00,

  payment_mode        VARCHAR(20),
  payment_reference   VARCHAR(100),

  status              ENUM('DRAFT','APPROVED','PAID') DEFAULT 'DRAFT',
  approved_by         VARCHAR(36),
  approved_at         DATETIME,
  paid_at             DATETIME,

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY uq_payroll (employee_id, month, year),
  INDEX idx_payroll_period (month, year),
  INDEX idx_payroll_status (status)
) ENGINE=InnoDB;

-- ---- Loans -------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
  id                   VARCHAR(36) PRIMARY KEY,
  employee_id          VARCHAR(36) NOT NULL,
  loan_type            VARCHAR(50) NOT NULL,
  loan_amount          DECIMAL(14,2) NOT NULL,
  emi_amount           DECIMAL(14,2) NOT NULL,
  total_emis           INT NOT NULL,
  paid_emis            INT DEFAULT 0,
  balance_outstanding  DECIMAL(14,2) NOT NULL,
  start_date           DATE NOT NULL,
  end_date             DATE,
  status               ENUM('ACTIVE','CLOSED','WRITTEN_OFF') DEFAULT 'ACTIVE',
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_loan_employee (employee_id),
  INDEX idx_loan_status (status)
) ENGINE=InnoDB;

-- ---- FNF Settlements ---------------------------------------
CREATE TABLE IF NOT EXISTS fnf_settlements (
  id                      VARCHAR(36) PRIMARY KEY,
  employee_id             VARCHAR(36) NOT NULL UNIQUE,
  last_working_date       DATE NOT NULL,
  notice_period_days      INT DEFAULT 30,
  notice_period_recovery  DECIMAL(14,2) DEFAULT 0.00,
  leave_encashment        DECIMAL(14,2) DEFAULT 0.00,
  gratuity                DECIMAL(14,2) DEFAULT 0.00,
  bonus_payable           DECIMAL(14,2) DEFAULT 0.00,
  pending_deductions      DECIMAL(14,2) DEFAULT 0.00,
  asset_recovery          TINYINT(1) DEFAULT 0,
  asset_recovery_amount   DECIMAL(14,2) DEFAULT 0.00,
  noc_status              VARCHAR(20) DEFAULT 'PENDING',
  final_amount            DECIMAL(14,2) DEFAULT 0.00,
  status                  ENUM('DRAFT','APPROVED','PAID') DEFAULT 'DRAFT',

  payment_mode            VARCHAR(20) DEFAULT 'NEFT',
  payment_reference       VARCHAR(100),
  payment_bank            VARCHAR(255),
  payment_date            DATE,
  payment_notes           TEXT,
  paid_at                 DATETIME,

  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---- Payments (individual payment records) -----------------
CREATE TABLE IF NOT EXISTS payments (
  id                VARCHAR(36) PRIMARY KEY,
  payment_kind      ENUM('PAYROLL','FNF','LOAN_DISBURSEMENT','ADVANCE') NOT NULL,
  reference_id      VARCHAR(36) NOT NULL,
  employee_id       VARCHAR(36) NOT NULL,
  company_id        VARCHAR(36),
  amount            DECIMAL(14,2) NOT NULL,
  payment_mode      ENUM('NEFT','CHEQUE','CASH','UPI','RAZORPAY','IMPS','RTGS') NOT NULL,
  payment_date      DATE NOT NULL,
  utr_number        VARCHAR(50),
  from_bank_account VARCHAR(30),
  cheque_number     VARCHAR(20),
  cheque_bank       VARCHAR(255),
  cheque_date       DATE,
  notes             TEXT,
  status            ENUM('PENDING','COMPLETED','BOUNCED','CANCELLED') NOT NULL DEFAULT 'COMPLETED',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  INDEX idx_pay_ref      (payment_kind, reference_id),
  INDEX idx_pay_employee (employee_id),
  INDEX idx_pay_date     (payment_date)
) ENGINE=InnoDB;

-- ---- Investment Declarations --------------------------------
CREATE TABLE IF NOT EXISTS investment_declarations (
  id                VARCHAR(36) PRIMARY KEY,
  employee_id       VARCHAR(36) NOT NULL,
  financial_year    VARCHAR(10) NOT NULL,
  section_80c       DECIMAL(14,2) DEFAULT 0.00,
  section_80d       DECIMAL(14,2) DEFAULT 0.00,
  rent_paid         DECIMAL(14,2) DEFAULT 0.00,
  landlord_pan      VARCHAR(15),
  is_metro_city     TINYINT(1) DEFAULT 0,
  other_income      DECIMAL(14,2) DEFAULT 0.00,
  other_deductions  DECIMAL(14,2) DEFAULT 0.00,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE KEY uq_inv_decl (employee_id, financial_year)
) ENGINE=InnoDB;

-- ---- Salary Revisions --------------------------------------
CREATE TABLE IF NOT EXISTS salary_revisions (
  id              VARCHAR(36) PRIMARY KEY,
  employee_id     VARCHAR(36) NOT NULL,
  old_ctc         DECIMAL(14,2) NOT NULL,
  new_ctc         DECIMAL(14,2) NOT NULL,
  effective_from  DATE NOT NULL,
  reason          TEXT,
  approved_by     VARCHAR(36),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_rev_employee (employee_id)
) ENGINE=InnoDB;

-- ---- Notifications -----------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          VARCHAR(36) PRIMARY KEY,
  company_id  VARCHAR(36),
  message     TEXT NOT NULL,
  type        ENUM('info','success','warning','error') DEFAULT 'info',
  is_read     TINYINT(1) DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_read (is_read, created_at DESC)
) ENGINE=InnoDB;

-- ---- Documents ---------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id          VARCHAR(36) PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id   VARCHAR(36) NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(512) NOT NULL,
  tag         VARCHAR(100) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_doc_entity (entity_type, entity_id)
) ENGINE=InnoDB;

-- ---- System Settings (Key-Value) ---------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---- Audit Log ---------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            VARCHAR(36) PRIMARY KEY,
  company_id    VARCHAR(36),
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(50),
  entity_id     VARCHAR(36),
  details       TEXT,
  performed_by  VARCHAR(100),
  ip_address    VARCHAR(45),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_company_created (company_id, created_at DESC),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB;


-- ============================================================
-- SEED DATA (structural only — NO mock employees/attendance)
-- ============================================================

-- Default Salary Components
INSERT IGNORE INTO salary_components (id, name, code, type, is_statutory, is_fixed, percent_of, default_percent, description, display_order) VALUES
  ('sc_basic',   'Basic Salary',              'BASIC', 'EARNING',   0, 1, NULL,    NULL,  'Base salary component',                       1),
  ('sc_hra',     'House Rent Allowance',       'HRA',   'EARNING',   0, 0, 'BASIC', 40.00, 'HRA - 40% of Basic (non-metro), 50% (metro)', 2),
  ('sc_conv',    'Conveyance Allowance',       'CONV',  'EARNING',   0, 1, NULL,    NULL,  'Transport allowance',                         3),
  ('sc_med',     'Medical Allowance',          'MED',   'EARNING',   0, 1, NULL,    NULL,  'Medical reimbursement',                       4),
  ('sc_spl',     'Special Allowance',          'SPL',   'EARNING',   0, 1, NULL,    NULL,  'Balancing component',                         5),
  ('sc_bonus',   'Bonus / Incentive',          'BONUS', 'EARNING',   0, 1, NULL,    NULL,  'Performance bonus',                           6),
  ('sc_ot',      'Overtime',                   'OT',    'EARNING',   0, 1, NULL,    NULL,  'Overtime pay',                                7),
  ('sc_pf',      'Provident Fund (Employee)',  'PF',    'DEDUCTION', 1, 0, 'BASIC', 12.00, 'EPF - 12% of Basic (max 15000 base)',          10),
  ('sc_esic',    'ESIC (Employee)',            'ESIC',  'DEDUCTION', 1, 0, 'GROSS', 0.75,  'ESIC - 0.75% of Gross (if ≤ 21000)',          11),
  ('sc_pt',      'Professional Tax',           'PT',    'DEDUCTION', 1, 1, NULL,    NULL,  'State professional tax',                      12),
  ('sc_tds',     'TDS (Income Tax)',           'TDS',   'DEDUCTION', 1, 1, NULL,    NULL,  'Monthly TDS deduction',                       13),
  ('sc_loan',    'Loan Deduction',             'LOAN',  'DEDUCTION', 0, 1, NULL,    NULL,  'Loan EMI deduction',                          14),
  ('sc_advance', 'Advance Deduction',          'ADV',   'DEDUCTION', 0, 1, NULL,    NULL,  'Salary advance recovery',                     15),
  ('sc_other',   'Other Deductions',           'OTHER', 'DEDUCTION', 0, 1, NULL,    NULL,  'Miscellaneous deductions',                    16);

-- Default System Settings
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
  ('default_payment_mode',  'NEFT'),
  ('payer_bank_name',       'State Bank of India'),
  ('payer_account_number',  ''),
  ('payer_ifsc',            ''),
  ('next_cheque_number',    '000001'),
  ('template_basic_pct',    '50'),
  ('template_hra_pct',      '40'),
  ('template_conv_amount',  '1600'),
  ('template_med_amount',   '1250');

-- Default Admin User
-- Password: Admin@123 (bcrypt hash below)
-- Generate your own hash:  node -e "require('bcryptjs').hash('YourPassword', 12).then(h => console.log(h))"
INSERT IGNORE INTO users (id, email, password, full_name, role) VALUES
  ('usr_admin_001',
   'admin@payroll.local',
   '$2a$12$LJ3m5RM2x2loHq7e1N3PNOGBxBnV9Hzf5uwxXkF1fQZC8vRdq3Rqm',
   'System Administrator',
   'super_admin');

-- ============================================================
-- END OF SCHEMA
-- ============================================================
