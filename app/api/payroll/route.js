import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';
import { calculatePF } from '@/lib/compliance/pf';
import { calculateESIC } from '@/lib/compliance/esic';
import { calculatePT } from '@/lib/compliance/pt-mp';
import { calculateTDS } from '@/lib/compliance/tds';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';
    const month = parseInt(searchParams.get('month')) || new Date().getMonth() + 1;
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear();

    const records = db.prepare(`
      SELECT p.*, e.full_name, e.employee_code, e.designation,
             d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND p.month = ? AND p.year = ?
      ORDER BY e.employee_code ASC
    `).all(companyId, month, year);

    const summary = {
      totalGross: records.reduce((s, r) => s + (r.gross_earnings || 0), 0),
      totalDeductions: records.reduce((s, r) => s + (r.total_deductions || 0), 0),
      totalNet: records.reduce((s, r) => s + (r.net_salary || 0), 0),
      totalPF: records.reduce((s, r) => s + (r.pf_deduction || 0), 0),
      totalESIC: records.reduce((s, r) => s + (r.esic_deduction || 0), 0),
      totalPT: records.reduce((s, r) => s + (r.pt_deduction || 0), 0),
      totalTDS: records.reduce((s, r) => s + (r.tds_deduction || 0), 0),
      employerPF: records.reduce((s, r) => s + (r.employer_pf || 0), 0),
      employerESIC: records.reduce((s, r) => s + (r.employer_esic || 0), 0),
      draftCount: records.filter(r => r.status === 'DRAFT').length,
      approvedCount: records.filter(r => r.status === 'APPROVED').length,
      paidCount: records.filter(r => r.status === 'PAID').length,
    };

    return NextResponse.json({ records, summary, month, year });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { company_id, month, year } = body;
    const companyId = company_id || 'comp_uabiotech';

    // Get all active employees with salary structures
    const employees = db.prepare(`
      SELECT e.*, ss.ctc_annual, ss.ctc_monthly,
             d.name as department_name
      FROM employees e
      JOIN salary_structures ss ON ss.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND e.is_active = 1
    `).all(companyId);

    // Get attendance for the month
    const attendanceMap = {};
    const attendance = db.prepare(
      'SELECT * FROM attendance WHERE month = ? AND year = ?'
    ).all(month, year);
    attendance.forEach(a => { attendanceMap[a.employee_id] = a; });

    // Get active loans
    const loansMap = {};
    const loans = db.prepare(
      "SELECT * FROM loans WHERE status = 'ACTIVE'"
    ).all();
    loans.forEach(l => {
      if (!loansMap[l.employee_id]) loansMap[l.employee_id] = [];
      loansMap[l.employee_id].push(l);
    });

    const upsert = db.prepare(`
      INSERT INTO payroll (id, employee_id, month, year, total_working_days, paid_days,
        basic_salary, hra, conveyance, medical, special_allowance, bonus, overtime, arrears, reimbursements, gross_earnings,
        pf_deduction, esic_deduction, pt_deduction, tds_deduction, loan_deduction, advance_deduction, other_deductions, total_deductions,
        net_salary, employer_pf, employer_esic, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, month, year) DO UPDATE SET
        total_working_days = excluded.total_working_days, paid_days = excluded.paid_days,
        basic_salary = excluded.basic_salary, hra = excluded.hra, conveyance = excluded.conveyance,
        medical = excluded.medical, special_allowance = excluded.special_allowance,
        bonus = excluded.bonus, overtime = excluded.overtime, arrears = excluded.arrears,
        reimbursements = excluded.reimbursements, gross_earnings = excluded.gross_earnings,
        pf_deduction = excluded.pf_deduction, esic_deduction = excluded.esic_deduction,
        pt_deduction = excluded.pt_deduction, tds_deduction = excluded.tds_deduction,
        loan_deduction = excluded.loan_deduction, advance_deduction = excluded.advance_deduction,
        other_deductions = excluded.other_deductions, total_deductions = excluded.total_deductions,
        net_salary = excluded.net_salary, employer_pf = excluded.employer_pf,
        employer_esic = excluded.employer_esic, status = excluded.status,
        updated_at = datetime('now')
    `);

    const transaction = db.transaction(() => {
      for (const emp of employees) {
        const att = attendanceMap[emp.id];
        const totalWorkingDays = att?.total_working_days || 26;
        const paidDays = att ? (att.present_days + att.paid_leaves + (att.half_days * 0.5)) : totalWorkingDays;
        const payRatio = totalWorkingDays > 0 ? paidDays / totalWorkingDays : 1;

        // Get salary components
        const components = db.prepare(`
          SELECT ssd.*, sc.code as component_code
          FROM salary_structure_details ssd
          JOIN salary_components sc ON sc.id = ssd.component_id
          JOIN salary_structures ss ON ss.id = ssd.salary_structure_id
          WHERE ss.employee_id = ?
        `).all(emp.id);

        const compMap = {};
        components.forEach(c => { compMap[c.component_code] = c.monthly_amount; });

        // Pro-rate earnings
        const basic = Math.round((compMap['BASIC'] || 0) * payRatio);
        const hra = Math.round((compMap['HRA'] || 0) * payRatio);
        const conv = Math.round((compMap['CONV'] || 0) * payRatio);
        const med = Math.round((compMap['MED'] || 0) * payRatio);
        const spl = Math.round((compMap['SPL'] || 0) * payRatio);
        const bonus = 0;
        const overtime = 0;
        const arrears = 0;
        const reimbursements = 0;
        const grossEarnings = basic + hra + conv + med + spl + bonus + overtime + arrears + reimbursements;

        // Statutory deductions
        const pfResult = calculatePF(compMap['BASIC'] || 0);
        const pfDeduction = Math.round(pfResult.employeeContribution * payRatio);
        const employerPf = Math.round(pfResult.employerContribution * payRatio);

        const esicResult = calculateESIC(grossEarnings);
        const esicDeduction = esicResult.applicable ? esicResult.employeeContribution : 0;
        const employerEsic = esicResult.applicable ? esicResult.employerContribution : 0;

        const ptResult = calculatePT(emp.ctc_annual || 0, month);
        const ptDeduction = ptResult.monthlyAmount || 0;

        // TDS
        let tdsDeduction = 0;
        if (emp.tds_applicable) {
          const tdsResult = calculateTDS({
            grossAnnualSalary: emp.ctc_annual || 0,
            regime: emp.tax_regime || 'NEW',
            previousEmployerIncome: emp.previous_employer_income || 0,
            previousEmployerTds: emp.previous_employer_tds || 0,
          });
          tdsDeduction = tdsResult.monthlyTds || 0;
        }

        // Loan deductions
        let loanDeduction = 0;
        const empLoans = loansMap[emp.id] || [];
        for (const loan of empLoans) {
          if (loan.balance_outstanding > 0) {
            const deduct = Math.min(loan.emi_amount, loan.balance_outstanding);
            loanDeduction += deduct;
          }
        }

        const totalDeductions = pfDeduction + esicDeduction + ptDeduction + tdsDeduction + loanDeduction;
        const netSalary = Math.max(grossEarnings - totalDeductions, 0);

        upsert.run(
          generateId(), emp.id, month, year, totalWorkingDays, paidDays,
          basic, hra, conv, med, spl, bonus, overtime, arrears, reimbursements, grossEarnings,
          pfDeduction, esicDeduction, ptDeduction, tdsDeduction, loanDeduction, 0, 0, totalDeductions,
          netSalary, employerPf, employerEsic, 'DRAFT'
        );
      }
    });

    transaction();

    // Audit log
    try {
      db.prepare(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(generateId(), companyId, 'PAYROLL_PROCESSED', 'payroll', `${month}-${year}`, JSON.stringify({ month, year, count: employees.length }), 'system');
    } catch(e) { /* non-critical */ }

    return NextResponse.json({ success: true, processedCount: employees.length });
  } catch (error) {
    console.error('Payroll processing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { action, month, year, company_id } = body;
    const companyId = company_id || 'comp_uabiotech';

    if (action === 'approve') {
      db.prepare(`
        UPDATE payroll SET status = 'APPROVED', approved_at = datetime('now'), updated_at = datetime('now')
        WHERE month = ? AND year = ? AND status = 'DRAFT'
        AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)
      `).run(month, year, companyId);

      try {
        db.prepare(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(generateId(), companyId, 'PAYROLL_APPROVED', 'payroll', `${month}-${year}`, JSON.stringify({ month, year }), 'system');
      } catch(e) { /* non-critical */ }
    } else if (action === 'mark_paid') {
      db.prepare(`
        UPDATE payroll SET status = 'PAID', paid_at = datetime('now'), updated_at = datetime('now')
        WHERE month = ? AND year = ? AND status = 'APPROVED'
        AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)
      `).run(month, year, companyId);

      try {
        db.prepare(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(generateId(), companyId, 'PAYROLL_PAID', 'payroll', `${month}-${year}`, JSON.stringify({ month, year }), 'system');
      } catch(e) { /* non-critical */ }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
