import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';
import { calculatePF } from '@/lib/compliance/pf';
import { calculateESIC } from '@/lib/compliance/esic';
import { calculatePT } from '@/lib/compliance/pt-mp';
import { calculateLWF } from '@/lib/compliance/lwf-mp';
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

    // Investment declarations for the FY containing this month (April-cutoff, India FY).
    // Used by the old-regime TDS calculation; new regime ignores them.
    const fyStart = month >= 4 ? year : year - 1;
    const fyLabel = `${fyStart}-${fyStart + 1}`;
    const investmentsBySection = {};
    const [invRows] = await pool.execute(
      'SELECT employee_id, section, verified_amount, declared_amount FROM investments WHERE financial_year = ?',
      [fyLabel]
    );
    for (const r of invRows) {
      const emp = (investmentsBySection[r.employee_id] ||= {});
      const sec = String(r.section || '').toUpperCase();
      const amt = Number(r.verified_amount) || Number(r.declared_amount) || 0;
      emp[sec] = (emp[sec] || 0) + amt;
    }
    const declMap = {};
    const [declRows] = await pool.execute(
      'SELECT * FROM investment_declarations WHERE financial_year = ?',
      [fyLabel]
    );
    for (const d of declRows) declMap[d.employee_id] = d;

    // Existing payroll rows for this period — used to skip APPROVED/PAID rows
    // so re-running payroll doesn't silently roll back a payment.
    const existingMap = {};
    const [existing] = await pool.execute(
      'SELECT employee_id, status FROM payroll WHERE month = ? AND year = ?',
      [month, year]
    );
    for (const r of existing) existingMap[r.employee_id] = r.status;

    let skippedLocked = 0;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const emp of employees) {
        if (existingMap[emp.id] && existingMap[emp.id] !== 'DRAFT') {
          // Already approved/paid for this period — never recompute or downgrade.
          skippedLocked++;
          continue;
        }
        const att = attendanceMap[emp.id];
        const daysInMonth = new Date(year, month, 0).getDate();

        // Per-employee calendar window. If the employee joined mid-month, only the
        // days from their joining_date onwards count. Sundays inside that window are
        // paid. The window is also the fallback when no attendance row exists yet.
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);
        let windowStart = monthStart;
        if (emp.joining_date) {
          const j = new Date(emp.joining_date);
          if (!isNaN(j.getTime()) && j > monthStart) windowStart = j;
        }
        let windowDays = 0;
        let windowSundays = 0;
        if (windowStart <= monthEnd) {
          for (let d = new Date(windowStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
            windowDays++;
            if (d.getDay() === 0) windowSundays++;
          }
        }
        const windowWorkingDays = Math.max(windowDays - windowSundays, 0);

        const totalWorkingDays = att?.total_working_days ?? windowWorkingDays;
        const sundays = Number(att?.sundays ?? windowSundays) || 0;
        const holidays = Number(att?.holidays) || 0;
        const paidLeaves = Number(att?.paid_leaves) || 0;
        const halfDays = Number(att?.half_days) || 0;
        const presentDays = att && att.present_days !== undefined && att.present_days !== null
          ? Number(att.present_days)
          : totalWorkingDays;

        // Paid days = days the employer pays for. Sundays + declared holidays + approved
        // paid leaves are paid even though no work was done. Half days lose half pay.
        // Unpaid leaves / absences are already excluded because they reduce present_days.
        const paidDays = Math.max(presentDays + sundays + holidays + paidLeaves - (halfDays * 0.5), 0);

        // Calendar-day proration: full month → ratio 1; partial month (LOP or late joiner)
        // → paid_days / calendar_days_in_month. Capped at 1 to guard against bad data.
        const payRatio = daysInMonth > 0 ? Math.min(paidDays / daysInMonth, 1) : 1;

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
        
        const fullGross = (compMap['BASIC'] || 0) + (compMap['HRA'] || 0) + (compMap['CONV'] || 0) + (compMap['PETROL'] || 0) + (compMap['MED'] || 0) + (compMap['SPL'] || 0);

        // Extra Days (ED) pay was removed — Sundays inside the working window are paid
        // via the proration ratio above instead of being treated as overtime/extra-day pay.
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
          const overrideVal = Number(emp.pf_override);
          pfDeduction = Math.round(basic * (overrideVal / 100));
          if (overrideVal === 0) {
            employerPf = 0;
          }
        } else {
          pfDeduction = pfResult.employeeContribution;
        }

        // Calculate full month gross for ESI applicability
        const fullEsicBase = Math.max(fullGross - (compMap['CONV'] || 0) - (compMap['PETROL'] || 0), 0);
        const isEsicApplicable = fullEsicBase <= 21000;

        let esicDeduction = 0;
        let employerEsic = 0;
        if (emp.esic_override !== null && emp.esic_override !== undefined) {
          const overrideVal = Number(emp.esic_override);
          esicDeduction = Math.round(esicBase * (overrideVal / 100));
          if (overrideVal > 0) {
            employerEsic = Math.round(esicBase * 0.0325);
          } else {
            employerEsic = 0;
          }
        } else if (isEsicApplicable) {
          const esicResult = calculateESIC(esicBase, false, fullEsicBase);
          esicDeduction = esicResult.employeeContribution;
          employerEsic = esicResult.employerContribution;
        }

        // PT — slab tables are state-specific. Only MP is implemented today, so route MP
        // (and unset / unknown states) through calculatePT and skip others with PT = 0 so we
        // never silently mis-deduct PT for a non-MP employee.
        const ptState = (emp.pt_state || 'MP').toUpperCase();
        const ptResult = ptState === 'MP' ? calculatePT(emp.ctc_annual || 0, month) : null;
        const ptDeduction = ptResult ? (ptResult.monthlyAmount || 0) : 0;

        // LWF (MP) — half-yearly deduction in June & December. Other states' LWF rules differ;
        // fold into other_deductions so the schema doesn't need a new column.
        let lwfEmployee = 0;
        let lwfEmployer = 0;
        if (emp.lwf_applicable && ptState === 'MP') {
          const designation = String(emp.designation || '').toLowerCase();
          const isManagerial = designation.includes('manager') || designation.includes('supervisor') || designation.includes('director') || designation.includes('head');
          const lwfRes = calculateLWF(emp.ctc_monthly || 0, isManagerial, month);
          if (lwfRes.applicable) {
            lwfEmployee = lwfRes.employeeContribution || 0;
            lwfEmployer = lwfRes.employerContribution || 0;
          }
        }

        // TDS
        let tdsDeduction = 0;
        if (emp.tds_applicable) {
          const regime = emp.tax_regime || 'NEW';
          const sec = investmentsBySection[emp.id] || {};
          const decl = declMap[emp.id] || {};

          // HRA exemption (old regime only): min(actual HRA, rent - 10% basic, 50%/40% of basic)
          let hraExemption = 0;
          if (regime === 'OLD') {
            const annualBasic = (compMap['BASIC'] || 0) * 12;
            const annualHra = (compMap['HRA'] || 0) * 12;
            const annualRent = (Number(decl.rent_paid) || 0) * 12;
            const metroPct = decl.is_metro_city ? 0.5 : 0.4;
            if (annualRent > 0 && annualBasic > 0) {
              hraExemption = Math.max(0, Math.min(
                annualHra,
                annualRent - 0.1 * annualBasic,
                metroPct * annualBasic
              ));
            }
          }

          const tdsResult = calculateTDS({
            grossAnnualSalary: emp.ctc_annual || 0,
            regime,
            section80c: (sec['80C'] || 0) + (Number(decl.section_80c) || 0),
            section80d: (sec['80D'] || 0) + (Number(decl.section_80d) || 0),
            hraExemption,
            otherDeductions: Number(decl.other_deductions) || 0,
            otherIncome: Number(decl.other_income) || 0,
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

        // LWF rolls into other_deductions for storage (no schema change).
        const otherDeductions = lwfEmployee;

        const totalDeductions = pfDeduction + esicDeduction + ptDeduction + tdsDeduction + loanDeduction + otherDeductions;
        // CTC-inclusive: employer PF/ESIC are baked into gross, so subtract them from net.
        const netSalary = Math.max(grossEarnings - totalDeductions - employerPf - employerEsic, 0);

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
          pfDeduction, esicDeduction, ptDeduction, tdsDeduction, loanDeduction, 0, otherDeductions, totalDeductions,
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
    } catch(e) { console.error('audit error:', e.message); }

    return NextResponse.json({
      success: true,
      processedCount: employees.length - skippedLocked,
      skippedLockedCount: skippedLocked,
    });
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
      } catch(e) { console.error('audit error:', e.message); }
    } else if (action === 'mark_paid') {
      await pool.execute(`
        UPDATE payroll SET status = 'PAID', paid_at = NOW(), updated_at = NOW()
        WHERE month = ? AND year = ? AND status = 'APPROVED'
        AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)
      `, [month, year, companyId]);

      try {
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), companyId, 'PAYROLL_PAID', 'payroll', `${month}-${year}`, JSON.stringify({ month, year }), 'system']);
      } catch(e) { console.error('audit error:', e.message); }
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
