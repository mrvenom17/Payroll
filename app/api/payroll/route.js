import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';
import { calculatePF } from '@/lib/compliance/pf';
import { calculateESIC } from '@/lib/compliance/esic';
import { calculatePT } from '@/lib/compliance/pt-mp';
import { calculateTDS } from '@/lib/compliance/tds';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
    const month = parseInt(searchParams.get('month')) || new Date().getMonth() + 1;
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear();

    const [records] = await pool.execute(`
      SELECT p.*, e.full_name, e.employee_code, e.designation,
             e.uan, e.pf_number, e.esic_number, e.pan_number,
             d.name as department_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND p.month = ? AND p.year = ?
      ORDER BY e.employee_code ASC
    `, [companyId, month, year]);

    if (records.length > 0) {
      const empIds = records.map(r => r.employee_id);
      const placeholders = empIds.map(() => '?').join(',');
      const [salaryDetails] = await pool.execute(`
        SELECT ss.employee_id, sc.code as component_code, ssd.monthly_amount
        FROM salary_structure_details ssd
        JOIN salary_components sc ON sc.id = ssd.component_id
        JOIN salary_structures ss ON ss.id = ssd.salary_structure_id
        WHERE ss.employee_id IN (${placeholders})
      `, empIds);
      
      const salaryMap = {};
      salaryDetails.forEach(s => {
        if (!salaryMap[s.employee_id]) salaryMap[s.employee_id] = {};
        salaryMap[s.employee_id][s.component_code] = s.monthly_amount;
      });
      
      records.forEach(r => {
        r.full_components = salaryMap[r.employee_id] || {};
      });
    }

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
    const pool = getPool();
    const body = await request.json();
    const { company_id, month, year } = body;
    const companyId = company_id || '';

    // Get all active employees with salary structures
    const [employees] = await pool.execute(`
      SELECT e.*, ss.ctc_annual, ss.ctc_monthly,
             d.name as department_name
      FROM employees e
      JOIN salary_structures ss ON ss.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND e.is_active = 1
    `, [companyId]);

    // Get attendance for the month
    const attendanceMap = {};
    const [attendance] = await pool.execute(
      'SELECT * FROM attendance WHERE month = ? AND year = ?',
      [month, year]
    );
    attendance.forEach(a => { attendanceMap[a.employee_id] = a; });

    // Get active loans
    const loansMap = {};
    const [loans] = await pool.execute("SELECT * FROM loans WHERE status = 'ACTIVE'");
    loans.forEach(l => {
      if (!loansMap[l.employee_id]) loansMap[l.employee_id] = [];
      loansMap[l.employee_id].push(l);
    });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const emp of employees) {
        const att = attendanceMap[emp.id];
        const totalWorkingDays = att?.total_working_days || 26;
        let paidDays = totalWorkingDays;
        
        if (att) {
          if (att.present_days !== undefined && att.present_days !== null && att.present_days > 0) {
            paidDays = att.present_days;
          } else {
            const unpaidLeaves = att.unpaid_leaves || 0;
            const absentDays = att.absent_days || 0;
            const halfDays = att.half_days || 0;
            const lossOfPay = unpaidLeaves + absentDays + (halfDays * 0.5);
            paidDays = Math.max(totalWorkingDays - lossOfPay, 0);
          }
        }
        
        const payRatio = totalWorkingDays > 0 ? paidDays / totalWorkingDays : 1;

        // Get salary components
        const [components] = await conn.execute(`
          SELECT ssd.*, sc.code as component_code
          FROM salary_structure_details ssd
          JOIN salary_components sc ON sc.id = ssd.component_id
          JOIN salary_structures ss ON ss.id = ssd.salary_structure_id
          WHERE ss.employee_id = ?
        `, [emp.id]);

        const compMap = {};
        components.forEach(c => { compMap[c.component_code] = c.monthly_amount; });

        // Pro-rate earnings
        const basic = Math.round((compMap['BASIC'] || 0) * payRatio);
        const hra = Math.round((compMap['HRA'] || 0) * payRatio);
        const conv = Math.round((compMap['CONV'] || 0) * payRatio);
        const petrol = Math.round((compMap['PETROL'] || 0) * payRatio);
        const med = Math.round((compMap['MED'] || 0) * payRatio);
        const spl = Math.round((compMap['SPL'] || 0) * payRatio);
        const bonus = 0;
        const overtime = 0;
        const arrears = 0;
        const reimbursements = 0;
        const grossEarnings = basic + hra + conv + petrol + med + spl + bonus + overtime + arrears + reimbursements;

        // ESI base excludes Conveyance and Petrol Allowance (per statutory practice)
        const esicBase = Math.max(grossEarnings - conv - petrol, 0);

        // Statutory deductions
        // PF calculated on pro-rated basic (already adjusted for attendance)
        const pfResult = calculatePF(basic);
        let pfDeduction = 0;
        let employerPf = pfResult.employerContribution;
        if (emp.pf_override !== null && emp.pf_override !== undefined) {
          pfDeduction = Math.round(basic * (Number(emp.pf_override) / 100));
        } else {
          pfDeduction = pfResult.employeeContribution;
        }

        let esicDeduction = 0;
        const esicResult = calculateESIC(esicBase);
        let employerEsic = esicResult.applicable ? esicResult.employerContribution : 0;
        if (emp.esic_override !== null && emp.esic_override !== undefined) {
          esicDeduction = Math.round(esicBase * (Number(emp.esic_override) / 100));
        } else {
          esicDeduction = esicResult.applicable ? esicResult.employeeContribution : 0;
        }

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

        const payrollId = generateId();
        await conn.execute(`
          INSERT INTO payroll (id, employee_id, month, year, total_working_days, paid_days,
            basic_salary, hra, conveyance, petrol_allowance, medical, special_allowance, bonus, overtime, arrears, reimbursements, gross_earnings,
            pf_deduction, esic_deduction, pt_deduction, tds_deduction, loan_deduction, advance_deduction, other_deductions, total_deductions,
            net_salary, employer_pf, employer_esic, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            total_working_days = VALUES(total_working_days), paid_days = VALUES(paid_days),
            basic_salary = VALUES(basic_salary), hra = VALUES(hra), conveyance = VALUES(conveyance),
            petrol_allowance = VALUES(petrol_allowance),
            medical = VALUES(medical), special_allowance = VALUES(special_allowance),
            bonus = VALUES(bonus), overtime = VALUES(overtime), arrears = VALUES(arrears),
            reimbursements = VALUES(reimbursements), gross_earnings = VALUES(gross_earnings),
            pf_deduction = VALUES(pf_deduction), esic_deduction = VALUES(esic_deduction),
            pt_deduction = VALUES(pt_deduction), tds_deduction = VALUES(tds_deduction),
            loan_deduction = VALUES(loan_deduction), advance_deduction = VALUES(advance_deduction),
            other_deductions = VALUES(other_deductions), total_deductions = VALUES(total_deductions),
            net_salary = VALUES(net_salary), employer_pf = VALUES(employer_pf),
            employer_esic = VALUES(employer_esic), status = VALUES(status),
            updated_at = NOW()
        `, [
          payrollId, emp.id, month, year, totalWorkingDays, paidDays,
          basic, hra, conv, petrol, med, spl, bonus, overtime, arrears, reimbursements, grossEarnings,
          pfDeduction, esicDeduction, ptDeduction, tdsDeduction, loanDeduction, 0, 0, totalDeductions,
          netSalary, employerPf, employerEsic, 'DRAFT'
        ]);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    // Audit log
    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), companyId, 'PAYROLL_PROCESSED', 'payroll', `${month}-${year}`, JSON.stringify({ month, year, count: employees.length }), 'system']);
    } catch(e) { /* non-critical */ }

    return NextResponse.json({ success: true, processedCount: employees.length });
  } catch (error) {
    console.error('Payroll processing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const pool = getPool();
    const body = await request.json();
    const { action, month, year, company_id } = body;
    const companyId = company_id || '';

    if (action === 'approve') {
      await pool.execute(`
        UPDATE payroll SET status = 'APPROVED', approved_at = NOW(), updated_at = NOW()
        WHERE month = ? AND year = ? AND status = 'DRAFT'
        AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)
      `, [month, year, companyId]);

      try {
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), companyId, 'PAYROLL_APPROVED', 'payroll', `${month}-${year}`, JSON.stringify({ month, year }), 'system']);
      } catch(e) { /* non-critical */ }
    } else if (action === 'mark_paid') {
      await pool.execute(`
        UPDATE payroll SET status = 'PAID', paid_at = NOW(), updated_at = NOW()
        WHERE month = ? AND year = ? AND status = 'APPROVED'
        AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)
      `, [month, year, companyId]);

      try {
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), companyId, 'PAYROLL_PAID', 'payroll', `${month}-${year}`, JSON.stringify({ month, year }), 'system']);
      } catch(e) { /* non-critical */ }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — clear payroll records for a given month/year
// Only DRAFT records can be deleted. Use ?month=X&year=Y&company=Z
// Pass scope=all to delete ALL statuses (admin override)
export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get('month'));
    const year = parseInt(searchParams.get('year'));
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
    const scope = searchParams.get('scope') || 'draft';

    if (!month || !year) {
      return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
    }

    let statusClause = `AND p.status = 'DRAFT'`;
    if (scope === 'all') {
      statusClause = ''; // Delete all statuses
    }

    const [result] = await pool.execute(`
      DELETE p FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.month = ? AND p.year = ? AND e.company_id = ? ${statusClause}
    `, [month, year, companyId]);

    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), companyId, 'PAYROLL_DELETED', 'payroll', `${month}-${year}`, JSON.stringify({ month, year, scope, deleted: result.affectedRows }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true, deleted: result.affectedRows });
  } catch (error) {
    console.error('DELETE /api/payroll:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
