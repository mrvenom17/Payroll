-- ============================================================
-- Edge-case fixtures for manual testing
-- ============================================================
-- Safe to re-run: every INSERT uses IGNORE or DUPLICATE-KEY UPDATE.
-- Drops nothing; all rows are scoped to a dedicated "EDGE" company so
-- you can clean up with:
--   DELETE FROM companies WHERE code = 'EDGE';   -- cascades to employees, etc.
--
-- Run:
--   mysql -u payroll_app -p payroll_db < database/fixtures-edge-cases.sql
-- ============================================================

USE payroll_db;

-- ============================================================
-- Fix admin login if you've never set the password manually.
-- The hash below was generated for "Admin@123" against bcryptjs v2.4.3.
-- ============================================================
UPDATE users
   SET password = '$2a$12$BrKo3/7wGXE6eI8fOjJFje7gapKAxTbZTZbQeVe7YvN0yN86K3qOa',
       is_active = 1
 WHERE id = 'usr_admin_001';

-- ============================================================
-- EDGE test company + department
-- ============================================================
INSERT IGNORE INTO companies (id, name, code, address, gstin, pan, tan, pf_registration, esic_registration)
VALUES ('cmp_edge_001', 'Edge Cases Pvt Ltd', 'EDGE', 'Bhopal, MP', '23EDGEC1234F1Z5', 'EDGEC1234F', 'BHP12345A', 'MP/BHP/EDGE01', '32000123456');

INSERT IGNORE INTO departments (id, company_id, name, code)
VALUES ('dpt_edge_ops', 'cmp_edge_001', 'Operations', 'OPS');

-- ============================================================
-- 1. MID-MONTH JOINER (May 15)
--    Tests: per-employee calendar window, Sundays-as-paid, late-joiner proration.
--    Expected May 2026 payroll: gross ≈ ₹30,000 × 17/31 ≈ ₹16,452.
-- ============================================================
INSERT IGNORE INTO employees
  (id, company_id, employee_code, full_name, date_of_birth, gender, mobile_number,
   joining_date, department_id, designation, employment_type, work_location,
   pan_number, pt_state, lwf_applicable, tds_applicable,
   bank_name, account_number, ifsc_code, payment_mode, tax_regime, skill_category, is_active)
VALUES
  ('emp_edge_01', 'cmp_edge_001', 'EDGE-001', 'Priya Joshi (mid-month joiner)', '1995-03-12', 'Female', '9000010001',
   '2026-05-15', 'dpt_edge_ops', 'Operations Executive', 'Permanent', 'Bhopal',
   'AAAPJ1234B', 'MP', 1, 1, 'SBI', '50100200300', 'SBIN0001234', 'Bank Transfer', 'NEW', 'Skilled', 1);

INSERT IGNORE INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from)
VALUES ('sst_edge_01', 'emp_edge_01', 360000, 30000, '2026-05-15');

INSERT IGNORE INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES
  ('ssd_edge_01_b', 'sst_edge_01', 'sc_basic', 15000, 180000),
  ('ssd_edge_01_h', 'sst_edge_01', 'sc_hra',    6000,  72000),
  ('ssd_edge_01_c', 'sst_edge_01', 'sc_conv',   1600,  19200),
  ('ssd_edge_01_m', 'sst_edge_01', 'sc_med',    1250,  15000),
  ('ssd_edge_01_s', 'sst_edge_01', 'sc_spl',    6150,  73800);

-- Attendance for May 2026 (joiner window: May 15-31 = 17 days, 3 Sundays, 14 working)
INSERT INTO attendance
  (id, employee_id, month, year, total_working_days, present_days, absent_days,
   paid_leaves, unpaid_leaves, overtime_hours, late_marks, half_days, sundays, holidays,
   cl_balance, sl_balance, el_balance)
VALUES
  ('att_edge_01_may', 'emp_edge_01', 5, 2026, 14, 14, 0, 0, 0, 0, 0, 0, 3, 0, 3, 2, 6)
ON DUPLICATE KEY UPDATE
  total_working_days = VALUES(total_working_days), present_days = VALUES(present_days),
  sundays = VALUES(sundays), updated_at = NOW();

-- ============================================================
-- 2. PF OPT-OUT (override = 0)
--    Tests: pf_override path — neither employee nor employer PF should be deducted.
--    Expected: pf_deduction = 0, employer_pf = 0, no PF row on payslip.
-- ============================================================
INSERT IGNORE INTO employees
  (id, company_id, employee_code, full_name, joining_date, department_id, designation,
   employment_type, pt_state, lwf_applicable, tds_applicable, tax_regime, skill_category,
   pf_override, esic_override, is_active)
VALUES
  ('emp_edge_02', 'cmp_edge_001', 'EDGE-002', 'Rohit Khanna (PF opt-out)',
   '2025-01-01', 'dpt_edge_ops', 'Consultant', 'Contract', 'MP', 1, 1, 'NEW', 'Highly Skilled',
   0.00, NULL, 1);

INSERT IGNORE INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from)
VALUES ('sst_edge_02', 'emp_edge_02', 1200000, 100000, '2025-01-01');

INSERT IGNORE INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES
  ('ssd_edge_02_b', 'sst_edge_02', 'sc_basic', 50000, 600000),
  ('ssd_edge_02_h', 'sst_edge_02', 'sc_hra',   20000, 240000),
  ('ssd_edge_02_c', 'sst_edge_02', 'sc_conv',   1600,  19200),
  ('ssd_edge_02_m', 'sst_edge_02', 'sc_med',    1250,  15000),
  ('ssd_edge_02_s', 'sst_edge_02', 'sc_spl',   27150, 325800);

INSERT INTO attendance
  (id, employee_id, month, year, total_working_days, present_days, absent_days,
   paid_leaves, unpaid_leaves, overtime_hours, late_marks, half_days, sundays, holidays,
   cl_balance, sl_balance, el_balance)
VALUES
  ('att_edge_02_may', 'emp_edge_02', 5, 2026, 26, 26, 0, 0, 0, 0, 0, 0, 5, 0, 6, 4, 12)
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- ============================================================
-- 3. ESIC-ELIGIBLE LOW EARNER (gross ≤ ₹21,000)
--    Tests: ESIC applicability ceiling, employee + employer ESIC deduction.
--    Expected: ESIC employee = 0.75% × gross, employer = 3.25% × gross.
-- ============================================================
INSERT IGNORE INTO employees
  (id, company_id, employee_code, full_name, joining_date, department_id, designation,
   employment_type, pt_state, lwf_applicable, tds_applicable, tax_regime, skill_category, is_active)
VALUES
  ('emp_edge_03', 'cmp_edge_001', 'EDGE-003', 'Sunita Devi (ESIC eligible)',
   '2024-09-01', 'dpt_edge_ops', 'Helper', 'Permanent', 'MP', 1, 0, 'NEW', 'Unskilled', 1);

INSERT IGNORE INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from)
VALUES ('sst_edge_03', 'emp_edge_03', 216000, 18000, '2024-09-01');

INSERT IGNORE INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES
  ('ssd_edge_03_b', 'sst_edge_03', 'sc_basic',  9000, 108000),
  ('ssd_edge_03_h', 'sst_edge_03', 'sc_hra',    3600,  43200),
  ('ssd_edge_03_c', 'sst_edge_03', 'sc_conv',   1600,  19200),
  ('ssd_edge_03_m', 'sst_edge_03', 'sc_med',    1250,  15000),
  ('ssd_edge_03_s', 'sst_edge_03', 'sc_spl',    2550,  30600);

INSERT INTO attendance
  (id, employee_id, month, year, total_working_days, present_days, absent_days,
   paid_leaves, unpaid_leaves, overtime_hours, late_marks, half_days, sundays, holidays,
   cl_balance, sl_balance, el_balance)
VALUES
  ('att_edge_03_may', 'emp_edge_03', 5, 2026, 26, 26, 0, 0, 0, 0, 0, 0, 5, 0, 6, 4, 12)
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- ============================================================
-- 4. LONG-TENURE WITH ACTIVE LOAN (joined 2019 → gratuity-eligible)
--    Tests: loan amortization on PAID, gratuity calculation (≥5 years), FNF flow.
--    Try: run May payroll → approve → pay; loan balance should drop by ₹2,000.
--    Then mark inactive with exit_date → auto-FNF should compute gratuity > 0.
-- ============================================================
INSERT IGNORE INTO employees
  (id, company_id, employee_code, full_name, joining_date, department_id, designation,
   employment_type, pt_state, lwf_applicable, tds_applicable, tax_regime, skill_category, is_active)
VALUES
  ('emp_edge_04', 'cmp_edge_001', 'EDGE-004', 'Mahesh Tiwari (long-tenure + loan)',
   '2019-04-01', 'dpt_edge_ops', 'Senior Manager', 'Permanent', 'MP', 1, 1, 'OLD', 'Highly Skilled', 1);

INSERT IGNORE INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from)
VALUES ('sst_edge_04', 'emp_edge_04', 960000, 80000, '2024-04-01');

INSERT IGNORE INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES
  ('ssd_edge_04_b', 'sst_edge_04', 'sc_basic', 40000, 480000),
  ('ssd_edge_04_h', 'sst_edge_04', 'sc_hra',   16000, 192000),
  ('ssd_edge_04_c', 'sst_edge_04', 'sc_conv',   1600,  19200),
  ('ssd_edge_04_m', 'sst_edge_04', 'sc_med',    1250,  15000),
  ('ssd_edge_04_s', 'sst_edge_04', 'sc_spl',   21150, 253800);

INSERT IGNORE INTO loans
  (id, employee_id, loan_type, loan_amount, emi_amount, total_emis, paid_emis,
   balance_outstanding, start_date, status)
VALUES
  ('ln_edge_04', 'emp_edge_04', 'Personal', 20000, 2000, 10, 0, 20000, '2026-04-01', 'ACTIVE');

-- HRA + 80C declarations so the OLD-regime TDS branch has data to consume
INSERT IGNORE INTO investment_declarations
  (id, employee_id, financial_year, section_80c, section_80d, rent_paid, is_metro_city)
VALUES
  ('dcl_edge_04', 'emp_edge_04', '2026-2027', 150000, 25000, 18000, 0);

INSERT INTO attendance
  (id, employee_id, month, year, total_working_days, present_days, absent_days,
   paid_leaves, unpaid_leaves, overtime_hours, late_marks, half_days, sundays, holidays,
   cl_balance, sl_balance, el_balance)
VALUES
  ('att_edge_04_may', 'emp_edge_04', 5, 2026, 26, 26, 0, 0, 0, 0, 0, 0, 5, 0, 6, 4, 30)
ON DUPLICATE KEY UPDATE el_balance = 30, updated_at = NOW();

-- ============================================================
-- 5. HIGH EARNER (₹50L CTC) — triggers TDS surcharge, PF cap, PT max
--    Tests: PF capped at ₹1,800/m (12% of ₹15k), PT capped at ₹208/m,
--           ESIC = 0 (above ceiling), TDS surcharge ≥10% (taxable > ₹50L).
-- ============================================================
INSERT IGNORE INTO employees
  (id, company_id, employee_code, full_name, joining_date, department_id, designation,
   employment_type, pt_state, lwf_applicable, tds_applicable, tax_regime, skill_category, is_active)
VALUES
  ('emp_edge_05', 'cmp_edge_001', 'EDGE-005', 'Aakash Mehta (high earner)',
   '2022-07-01', 'dpt_edge_ops', 'Director', 'Permanent', 'MP', 0, 1, 'NEW', 'Highly Skilled', 1);

INSERT IGNORE INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from)
VALUES ('sst_edge_05', 'emp_edge_05', 5000000, 416667, '2024-04-01');

INSERT IGNORE INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES
  ('ssd_edge_05_b', 'sst_edge_05', 'sc_basic', 200000, 2400000),
  ('ssd_edge_05_h', 'sst_edge_05', 'sc_hra',    80000,  960000),
  ('ssd_edge_05_c', 'sst_edge_05', 'sc_conv',    1600,   19200),
  ('ssd_edge_05_m', 'sst_edge_05', 'sc_med',     1250,   15000),
  ('ssd_edge_05_s', 'sst_edge_05', 'sc_spl',   133817, 1605804);

INSERT INTO attendance
  (id, employee_id, month, year, total_working_days, present_days, absent_days,
   paid_leaves, unpaid_leaves, overtime_hours, late_marks, half_days, sundays, holidays,
   cl_balance, sl_balance, el_balance)
VALUES
  ('att_edge_05_may', 'emp_edge_05', 5, 2026, 26, 26, 0, 0, 0, 0, 0, 0, 5, 0, 6, 4, 15)
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- ============================================================
-- Optional: same May 2026 attendance for the existing admin user's company
-- has nothing to do with these fixtures — these 5 employees are all under
-- the EDGE company. Switch to it from the Companies sidebar.
-- ============================================================

SELECT
  e.employee_code AS code,
  e.full_name      AS name,
  ss.ctc_monthly   AS monthly_ctc,
  e.tax_regime     AS regime,
  e.pf_override    AS pf_override,
  IFNULL(l.balance_outstanding, 0) AS active_loan_balance
FROM employees e
LEFT JOIN salary_structures ss ON ss.employee_id = e.id
LEFT JOIN loans l ON l.employee_id = e.id AND l.status='ACTIVE'
WHERE e.company_id = 'cmp_edge_001'
ORDER BY e.employee_code;
