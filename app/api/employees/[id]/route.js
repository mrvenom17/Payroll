import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request, { params }) {
  try {
    const pool = getPool();
    const { id } = await params;

    const [[employee]] = await pool.execute(`
      SELECT e.*, d.name as department_name, d.code as department_code,
             rm.full_name as reporting_manager_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees rm ON e.reporting_manager_id = rm.id
      WHERE e.id = ?
    `, [id]);

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Get salary structure
    const [salaryStructure] = await pool.execute(`
      SELECT ss.*, ssd.*, sc.name as component_name, sc.code as component_code, sc.type as component_type
      FROM salary_structures ss
      LEFT JOIN salary_structure_details ssd ON ssd.salary_structure_id = ss.id
      LEFT JOIN salary_components sc ON sc.id = ssd.component_id
      WHERE ss.employee_id = ?
      ORDER BY sc.display_order ASC
    `, [id]);

    // Get loans
    const [loans] = await pool.execute('SELECT * FROM loans WHERE employee_id = ? AND status = ?', [id, 'ACTIVE']);

    // Get attendance (last 6 months)
    const [attendance] = await pool.execute(`
      SELECT * FROM attendance WHERE employee_id = ?
      ORDER BY year DESC, month DESC LIMIT 6
    `, [id]);

    return NextResponse.json({
      employee,
      salaryStructure: salaryStructure.length > 0 ? {
        ctc_annual: salaryStructure[0].ctc_annual,
        ctc_monthly: salaryStructure[0].ctc_monthly,
        effective_from: salaryStructure[0].effective_from,
        components: salaryStructure.filter(s => s.component_name).map(s => ({
          name: s.component_name,
          code: s.component_code,
          type: s.component_type,
          monthly: s.monthly_amount,
          annual: s.annual_amount,
        }))
      } : null,
      loans,
      attendance,
    });
  } catch (error) {
    console.error('GET /api/employees/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const pool = getPool();
    const { id } = await params;
    const body = await request.json();

    // Validate FK fields: if provided id doesn't exist (or self-reference), null it out
    if (body.reporting_manager_id) {
      if (body.reporting_manager_id === id) {
        body.reporting_manager_id = null;
      } else {
        const [[mgr]] = await pool.execute('SELECT id FROM employees WHERE id = ?', [body.reporting_manager_id]);
        if (!mgr) body.reporting_manager_id = null;
      }
    }
    if (body.department_id) {
      const [[dept]] = await pool.execute('SELECT id FROM departments WHERE id = ?', [body.department_id]);
      if (!dept) body.department_id = null;
    }

    const updateFields = [];
    const updateValues = [];

    const allowed = [
      'full_name', 'father_spouse_name', 'date_of_birth', 'gender',
      'mobile_number', 'email_id', 'current_address', 'permanent_address',
      'department_id', 'designation', 'reporting_manager_id',
      'employment_type', 'work_location', 'probation_end_date',
      'pan_number', 'aadhaar_number', 'uan', 'pf_number',
      'esic_number', 'pt_state', 'lwf_applicable', 'tds_applicable',
      'previous_employer_income', 'previous_employer_tds',
      'bank_name', 'account_number', 'ifsc_code', 'branch_name',
      'payment_mode', 'tax_regime', 'skill_category',
      'is_active', 'exit_date', 'exit_reason'
    ];

    allowed.forEach(field => {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(body[field] === '' ? null : body[field]);
      }
    });

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await pool.execute(
      `UPDATE employees SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const [[updated]] = await pool.execute('SELECT * FROM employees WHERE id = ?', [id]);

    // AUTO FNF GENERATION HOOK
    if (updated.is_active === 0 && updated.exit_date) {
      const [[existingFnf]] = await pool.execute('SELECT id FROM fnf_settlements WHERE employee_id = ?', [id]);

      if (!existingFnf) {
        try {
          const [[ss]] = await pool.execute('SELECT ctc_monthly FROM salary_structures WHERE employee_id = ?', [id]);
          const [[basicRow]] = await pool.execute(`
            SELECT ssd.monthly_amount
            FROM salary_structure_details ssd
            JOIN salary_components sc ON sc.id = ssd.component_id
            JOIN salary_structures ss ON ss.id = ssd.salary_structure_id
            WHERE ss.employee_id = ? AND sc.code = 'BASIC'
          `, [id]);
          const basic = basicRow?.monthly_amount || 0;

          let gratuity = 0;
          if (updated.joining_date) {
            const years = (new Date(updated.exit_date) - new Date(updated.joining_date)) / (1000 * 60 * 60 * 24 * 365.25);
            if (years >= 5) {
              gratuity = Math.round((basic * 15 * Math.round(years)) / 26);
            }
          }

          const [[elRow]] = await pool.execute('SELECT el_balance FROM attendance WHERE employee_id = ? ORDER BY year DESC, month DESC LIMIT 1', [id]);
          const elBalance = elRow?.el_balance || 0;
          const leaveEncashment = Math.round(elBalance * Math.round((ss?.ctc_monthly || 0) / 26));

          const [[loanRow]] = await pool.execute("SELECT SUM(balance_outstanding) as total FROM loans WHERE employee_id = ? AND status = 'ACTIVE'", [id]);
          const pendingLoans = loanRow?.total || 0;
          const finalAmount = leaveEncashment + gratuity - pendingLoans;

          await pool.execute(`
            INSERT INTO fnf_settlements (id, employee_id, last_working_date, notice_period_days, notice_period_recovery,
              leave_encashment, gratuity, bonus_payable, pending_deductions, asset_recovery, asset_recovery_amount,
              noc_status, final_amount, status)
            VALUES (?, ?, ?, 30, 0, ?, ?, 0, ?, 0, 0, 'PENDING', ?, 'DRAFT')
          `, [generateId(), id, updated.exit_date, leaveEncashment, gratuity, pendingLoans, finalAmount]);
        } catch(err) {
          console.error('Auto FNF failed:', err);
        }
      }
    }

    return NextResponse.json({ employee: updated });
  } catch (error) {
    console.error('PUT /api/employees/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const pool = getPool();
    const { id } = await params;

    // Soft delete
    await pool.execute("UPDATE employees SET is_active = 0, exit_date = CURDATE(), updated_at = NOW() WHERE id = ?", [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/employees/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
