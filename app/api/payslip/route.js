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

    // Build earnings from salary components, but use payroll-record pro-rated amounts
    const payRatio = workingDays > 0 ? presentDays / workingDays : 1;
    const earnings = salaryDetails.filter(s => s.component_type === 'EARNING').map(s => {
      // Map known component codes to payroll record columns
      let actual = Math.round(s.monthly_amount * payRatio);
      if (s.component_code === 'BASIC' && payrollRecord.basic_salary !== undefined && payrollRecord.basic_salary !== null) actual = payrollRecord.basic_salary;
      else if (s.component_code === 'HRA' && payrollRecord.hra !== undefined && payrollRecord.hra !== null) actual = payrollRecord.hra;
      else if (s.component_code === 'CONV' && payrollRecord.conveyance !== undefined && payrollRecord.conveyance !== null) actual = payrollRecord.conveyance;
      else if (s.component_code === 'PETROL' && payrollRecord.petrol_allowance !== undefined && payrollRecord.petrol_allowance !== null) actual = payrollRecord.petrol_allowance;
      else if (s.component_code === 'MED' && payrollRecord.medical !== undefined && payrollRecord.medical !== null) actual = payrollRecord.medical;
      else if (s.component_code === 'SPL' && payrollRecord.special_allowance !== undefined && payrollRecord.special_allowance !== null) actual = payrollRecord.special_allowance;
      return {
        name: s.component_name,
        code: s.component_code,
        monthly: s.monthly_amount,
        actual,
      };
    });

    const totalEarnings = payrollRecord.gross_earnings !== undefined && payrollRecord.gross_earnings !== null 
      ? payrollRecord.gross_earnings 
      : earnings.reduce((sum, e) => sum + e.actual, 0);

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

    const totalDeductions = payrollRecord.total_deductions !== undefined && payrollRecord.total_deductions !== null 
      ? payrollRecord.total_deductions 
      : deductions.reduce((sum, d) => sum + d.amount, 0);
      
    const netPayable = payrollRecord.net_salary !== undefined && payrollRecord.net_salary !== null 
      ? payrollRecord.net_salary 
      : Math.max(totalEarnings - totalDeductions, 0);

    // Employer contributions from payroll record
    const pfEmployer = payrollRecord.employer_pf !== undefined && payrollRecord.employer_pf !== null ? payrollRecord.employer_pf : 0;
    const esicEmployer = payrollRecord.employer_esic !== undefined && payrollRecord.employer_esic !== null ? payrollRecord.employer_esic : 0;

    return NextResponse.json({
      payslip: {
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
