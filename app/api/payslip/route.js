import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

// Payslip API — generate payslip data for a specific employee and month
export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
    const employeeId = searchParams.get('employee');
    const month = parseInt(searchParams.get('month') || new Date().getMonth() + 1);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear());

    if (!employeeId) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    // Get employee details
    const [[employee]] = await pool.execute(`
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `, [employeeId]);

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Get company
    const [[company]] = await pool.execute('SELECT * FROM companies WHERE id = ?', [companyId]);

    // Get payroll record
    const [[payrollRecord]] = await pool.execute(`
      SELECT * FROM payroll
      WHERE employee_id = ? AND month = ? AND year = ?
    `, [employeeId, month, year]);

    if (!payrollRecord) {
      return NextResponse.json({ error: 'No payroll processed for this month' }, { status: 404 });
    }

    // Get salary structure details
    const [salaryDetails] = await pool.execute(`
      SELECT ssd.*, sc.name as component_name, sc.code as component_code, sc.type as component_type
      FROM salary_structures ss
      JOIN salary_structure_details ssd ON ssd.salary_structure_id = ss.id
      JOIN salary_components sc ON sc.id = ssd.component_id
      WHERE ss.employee_id = ?
      ORDER BY sc.display_order ASC
    `, [employeeId]);

    // Get attendance
    const [[attendance]] = await pool.execute(
      'SELECT * FROM attendance WHERE employee_id = ? AND month = ? AND year = ?',
      [employeeId, month, year]
    );

    // Build payslip using payroll record values (already correctly calculated)
    const workingDays = payrollRecord.total_working_days !== undefined && payrollRecord.total_working_days !== null 
      ? payrollRecord.total_working_days 
      : (attendance?.total_working_days || 22);

    // Compute paid days using the same safe formula as payroll processing
    const unpaidLeaves = attendance?.unpaid_leaves || 0;
    const absentDays = attendance?.absent_days || 0;
    const halfDays = attendance?.half_days || 0;
    let lossOfPay = unpaidLeaves + absentDays + (halfDays * 0.5);
    
    let presentDays = 0;
    if (payrollRecord.paid_days !== undefined && payrollRecord.paid_days !== null) {
      presentDays = payrollRecord.paid_days;
      // Recalculate loss of pay based on the payroll record explicitly
      lossOfPay = Math.max(workingDays - presentDays, 0);
    } else {
      presentDays = Math.max(workingDays - lossOfPay, 0);
    }

    // Snapshot-only: build earnings strictly from stored payroll-record columns.
    // If the column is null, the component was not part of payroll when it was processed
    // and is omitted from the payslip — no fallback to the current salary structure.
    const codeToColumn = {
      BASIC: 'basic_salary',
      HRA: 'hra',
      CONV: 'conveyance',
      PETROL: 'petrol_allowance',
      MED: 'medical',
      SPL: 'special_allowance',
    };

    // allEarnings: every earning from the structure (used by the edit form, including
    // columns currently null). earnings: only those with a stored value (used for display).
    const allEarnings = salaryDetails
      .filter(s => s.component_type === 'EARNING')
      .map(s => {
        const col = codeToColumn[s.component_code];
        if (!col) return null;
        const stored = payrollRecord[col];
        return {
          name: s.component_name,
          code: s.component_code,
          column: col,
          actual: stored === null || stored === undefined ? null : Number(stored),
        };
      })
      .filter(Boolean);

    const earnings = allEarnings.filter(e => e.actual !== null);
    const totalEarnings = earnings.reduce((sum, e) => sum + e.actual, 0);

    // Build deductions from the payroll record (authoritative source)
    const deductions = [];
    const pfDeduction = payrollRecord.pf_deduction !== undefined && payrollRecord.pf_deduction !== null ? payrollRecord.pf_deduction : 0;
    if (pfDeduction > 0) deductions.push({ name: 'Provident Fund @ 12% (Employee)', amount: pfDeduction });

    const esicDeduction = payrollRecord.esic_deduction !== undefined && payrollRecord.esic_deduction !== null ? payrollRecord.esic_deduction : 0;
    if (esicDeduction > 0) deductions.push({ name: 'ESI @ 0.75% (Employee)', amount: esicDeduction });

    const ptData = payrollRecord.pt_deduction !== undefined && payrollRecord.pt_deduction !== null ? payrollRecord.pt_deduction : 0;
    if (ptData > 0) deductions.push({ name: 'Professional Tax', amount: ptData });

    const tds = payrollRecord.tds_deduction !== undefined && payrollRecord.tds_deduction !== null ? payrollRecord.tds_deduction : 0;
    if (tds > 0) deductions.push({ name: 'TDS', amount: tds });

    const loanDeduction = payrollRecord.loan_deduction !== undefined && payrollRecord.loan_deduction !== null ? payrollRecord.loan_deduction : 0;
    if (loanDeduction > 0) deductions.push({ name: 'Loan Deduction', amount: loanDeduction });

    const advanceDeduction = payrollRecord.advance_deduction !== undefined && payrollRecord.advance_deduction !== null ? payrollRecord.advance_deduction : 0;
    if (advanceDeduction > 0) deductions.push({ name: 'Advance Deduction', amount: advanceDeduction });

    const otherDeductions = payrollRecord.other_deductions !== undefined && payrollRecord.other_deductions !== null ? payrollRecord.other_deductions : 0;
    if (otherDeductions > 0) deductions.push({ name: 'Other Deductions', amount: otherDeductions });

    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

    // Employer contributions from payroll record
    const pfEmployer = payrollRecord.employer_pf !== undefined && payrollRecord.employer_pf !== null ? Number(payrollRecord.employer_pf) : 0;
    const esicEmployer = payrollRecord.employer_esic !== undefined && payrollRecord.employer_esic !== null ? Number(payrollRecord.employer_esic) : 0;

    // CTC-inclusive net: employer PF/ESIC are already baked into gross, so subtract them too.
    const netPayable = Math.max(totalEarnings - totalDeductions - pfEmployer - esicEmployer, 0);

    // Raw values exposed for the manual edit form. Keeps employer-contribution
    // fields editable even though they are not displayed on the payslip.
    const editable = {
      basic_salary: payrollRecord.basic_salary ?? null,
      hra: payrollRecord.hra ?? null,
      conveyance: payrollRecord.conveyance ?? null,
      petrol_allowance: payrollRecord.petrol_allowance ?? null,
      medical: payrollRecord.medical ?? null,
      special_allowance: payrollRecord.special_allowance ?? null,
      pf_deduction: pfDeduction,
      esic_deduction: esicDeduction,
      pt_deduction: ptData,
      tds_deduction: tds,
      loan_deduction: loanDeduction,
      advance_deduction: advanceDeduction,
      other_deductions: otherDeductions,
      employer_pf: pfEmployer,
      employer_esic: esicEmployer,
      total_working_days: payrollRecord.total_working_days ?? null,
      paid_days: payrollRecord.paid_days ?? null,
    };

    return NextResponse.json({
      payslip: {
        payrollId: payrollRecord.id,
        editable,
        company: {
          name: company?.name || '',
          address: company?.address || '',
          pan: company?.pan || '',
          tan: company?.tan || '',
        },
        employee: {
          name: employee.full_name,
          code: employee.employee_code,
          department: employee.department_name,
          designation: employee.designation,
          doj: employee.joining_date,
          pan: employee.pan_number,
          uan: employee.uan,
          pfNumber: employee.pf_number,
          esicNumber: employee.esic_number,
          bankName: employee.bank_name,
          accountNumber: employee.account_number,
        },
        period: {
          month,
          year,
          monthName: new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' }),
        },
        attendance: {
          workingDays,
          presentDays,
          lop: lossOfPay,
          lwp: lossOfPay, // Making this consistent with actual loss of pay
          halfDays: attendance?.half_days || 0,
          holidays: attendance?.holidays || 0,
          sundays: attendance?.sundays || 0,
          overtime: attendance?.overtime_hours || 0,
        },
        earnings,
        allEarnings,
        deductions,
        totalEarnings,
        totalDeductions,
        netPayable,
        employerContributions: {
          pf: pfEmployer,
          esic: esicEmployer,
          total: pfEmployer + esicEmployer,
        },
        status: payrollRecord.status,
      },
    });
  } catch (error) {
    console.error('GET /api/payslip error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
