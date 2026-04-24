import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Payslip API — generate payslip data for a specific employee and month
export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';
    const employeeId = searchParams.get('employee');
    const month = parseInt(searchParams.get('month') || new Date().getMonth() + 1);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear());

    if (!employeeId) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    // Get employee details
    const employee = db.prepare(`
      SELECT e.*, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `).get(employeeId);

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Get company
    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);

    // Get payroll record
    const payrollRecord = db.prepare(`
      SELECT * FROM payroll
      WHERE employee_id = ? AND month = ? AND year = ?
    `).get(employeeId, month, year);

    if (!payrollRecord) {
      return NextResponse.json({ error: 'No payroll processed for this month' }, { status: 404 });
    }

    // Get salary structure details
    const salaryDetails = db.prepare(`
      SELECT ssd.*, sc.name as component_name, sc.code as component_code, sc.type as component_type
      FROM salary_structures ss
      JOIN salary_structure_details ssd ON ssd.salary_structure_id = ss.id
      JOIN salary_components sc ON sc.id = ssd.component_id
      WHERE ss.employee_id = ?
      ORDER BY sc.display_order ASC
    `).all(employeeId);

    // Get attendance
    const attendance = db.prepare(
      'SELECT * FROM attendance WHERE employee_id = ? AND month = ? AND year = ?'
    ).get(employeeId, month, year);

    // Build payslip
    const workingDays = attendance?.total_working_days || 22;
    const presentDays = attendance?.days_present || workingDays;
    const ratio = presentDays / workingDays;

    const earnings = salaryDetails.filter(s => s.component_type === 'EARNING').map(s => ({
      name: s.component_name,
      code: s.component_code,
      monthly: s.monthly_amount,
      actual: Math.round(s.monthly_amount * ratio),
    }));

    const totalEarnings = earnings.reduce((sum, e) => sum + e.actual, 0);
    const basicActual = earnings.find(e => e.code === 'BASIC')?.actual || 0;

    const deductions = [];
    // PF
    const pfBase = Math.min(basicActual, 15000);
    const pfEmployee = Math.round(pfBase * 0.12);
    if (pfEmployee > 0) deductions.push({ name: 'Provident Fund (12%)', amount: pfEmployee });

    // ESIC
    if (totalEarnings <= 21000) {
      const esicEmp = Math.round(totalEarnings * 0.0075);
      if (esicEmp > 0) deductions.push({ name: 'ESIC (0.75%)', amount: esicEmp });
    }

    // PT
    const ptData = payrollRecord.pt_deduction || 0;
    if (ptData > 0) deductions.push({ name: 'Professional Tax', amount: ptData });

    // TDS
    const tds = payrollRecord.tds_deduction || 0;
    if (tds > 0) deductions.push({ name: 'TDS', amount: tds });

    // Loan
    const loanDeduction = payrollRecord.loan_deduction || 0;
    if (loanDeduction > 0) deductions.push({ name: 'Loan Deduction', amount: loanDeduction });

    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
    const netPayable = totalEarnings - totalDeductions;

    // Employer contributions
    const pfEmployer = Math.round(pfBase * 0.12);
    const esicEmployer = totalEarnings <= 21000 ? Math.round(totalEarnings * 0.0325) : 0;

    return NextResponse.json({
      payslip: {
        company: {
          name: company?.name || 'UA BIOTECH',
          address: company?.address || 'Jabalpur, Madhya Pradesh',
          pan: company?.pan_number || '',
          tan: company?.tan_number || '',
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
          lop: workingDays - presentDays,
          lwp: attendance?.unpaid_leaves || (workingDays - presentDays), // Explicit LWP mapping for UI
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
