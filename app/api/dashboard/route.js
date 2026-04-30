import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';

    // Active employees count
    const [[activeRow]] = await pool.execute(
      'SELECT COUNT(*) as count FROM employees WHERE company_id = ? AND is_active = 1',
      [companyId]
    );
    const totalActive = activeRow.count;

    const [[inactiveRow]] = await pool.execute(
      'SELECT COUNT(*) as count FROM employees WHERE company_id = ? AND is_active = 0',
      [companyId]
    );
    const totalInactive = inactiveRow.count;

    // Current month attendance summary
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const [[attendanceSummary]] = await pool.execute(`
      SELECT
        SUM(present_days) as total_present,
        SUM(absent_days) as total_absent,
        SUM(paid_leaves) as total_leaves,
        COUNT(*) as employees_with_attendance
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE e.company_id = ? AND a.month = ? AND a.year = ?
    `, [companyId, currentMonth, currentYear]);

    // Salary summary
    const [[salarySummary]] = await pool.execute(`
      SELECT
        SUM(ss.ctc_monthly) as total_monthly_ctc,
        COUNT(*) as employees_with_salary
      FROM salary_structures ss
      JOIN employees e ON ss.employee_id = e.id
      WHERE e.company_id = ? AND e.is_active = 1
    `, [companyId]);

    // Payroll summary for current month
    const [[payrollSummary]] = await pool.execute(`
      SELECT
        SUM(CASE WHEN status = 'APPROVED' OR status = 'PAID' THEN net_salary ELSE 0 END) as total_paid,
        SUM(CASE WHEN status = 'DRAFT' THEN net_salary ELSE 0 END) as total_pending,
        COUNT(CASE WHEN status = 'APPROVED' OR status = 'PAID' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as pending_count
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE e.company_id = ? AND p.month = ? AND p.year = ?
    `, [companyId, currentMonth, currentYear]);

    // Probation employees
    const [onProbation] = await pool.execute(`
      SELECT id, employee_code, full_name, designation, probation_end_date, joining_date
      FROM employees
      WHERE company_id = ? AND is_active = 1 AND probation_end_date IS NOT NULL
      AND probation_end_date >= CURDATE()
      ORDER BY probation_end_date ASC
    `, [companyId]);

    // Today's birthdays
    const [todayBirthdays] = await pool.execute(`
      SELECT id, employee_code, full_name, designation, work_location, date_of_birth
      FROM employees
      WHERE company_id = ? AND is_active = 1
      AND DATE_FORMAT(date_of_birth, '%m-%d') = DATE_FORMAT(CURDATE(), '%m-%d')
    `, [companyId]);

    // Upcoming birthdays (next 7 days)
    const [upcomingBirthdays] = await pool.execute(`
      SELECT id, employee_code, full_name, designation, work_location, date_of_birth
      FROM employees
      WHERE company_id = ? AND is_active = 1
      AND (
        (DATE_FORMAT(date_of_birth, '%m-%d') > DATE_FORMAT(CURDATE(), '%m-%d')
         AND DATE_FORMAT(date_of_birth, '%m-%d') <= DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%m-%d'))
        OR
        (DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%m-%d') < DATE_FORMAT(CURDATE(), '%m-%d')
         AND (DATE_FORMAT(date_of_birth, '%m-%d') > DATE_FORMAT(CURDATE(), '%m-%d')
              OR DATE_FORMAT(date_of_birth, '%m-%d') <= DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%m-%d')))
      )
      ORDER BY DATE_FORMAT(date_of_birth, '%m-%d') ASC
      LIMIT 5
    `, [companyId]);

    // Work anniversaries this month
    const [anniversaries] = await pool.execute(`
      SELECT id, employee_code, full_name, designation, joining_date,
        (YEAR(CURDATE()) - YEAR(joining_date)) as years
      FROM employees
      WHERE company_id = ? AND is_active = 1
      AND MONTH(joining_date) = MONTH(CURDATE())
      AND YEAR(joining_date) != YEAR(CURDATE())
      ORDER BY DAY(joining_date) ASC
    `, [companyId]);

    // Department-wise count
    const [departmentWise] = await pool.execute(`
      SELECT d.name, d.code, COUNT(e.id) as count
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id AND e.is_active = 1
      WHERE d.company_id = ?
      GROUP BY d.id, d.name, d.code
      ORDER BY count DESC
    `, [companyId]);

    // Employment type breakdown
    const [employmentTypes] = await pool.execute(`
      SELECT employment_type, COUNT(*) as count
      FROM employees WHERE company_id = ? AND is_active = 1
      GROUP BY employment_type
    `, [companyId]);

    return NextResponse.json({
      totalActive,
      totalInactive,
      totalEmployees: totalActive + totalInactive,
      attendance: {
        present: attendanceSummary?.total_present || 0,
        absent: attendanceSummary?.total_absent || 0,
        onLeave: attendanceSummary?.total_leaves || 0,
      },
      salary: {
        totalMonthlyCTC: salarySummary?.total_monthly_ctc || 0,
        employeesWithSalary: salarySummary?.employees_with_salary || 0,
      },
      payroll: {
        totalPaid: payrollSummary?.total_paid || 0,
        totalPending: payrollSummary?.total_pending || 0,
        paidCount: payrollSummary?.paid_count || 0,
        pendingCount: payrollSummary?.pending_count || 0,
      },
      onProbation,
      todayBirthdays,
      upcomingBirthdays,
      anniversaries,
      departmentWise,
      employmentTypes,
      currentMonth,
      currentYear,
    });
  } catch (error) {
    console.error('GET /api/dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
