import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request, { params }) {
  try {
    const db = getDb();
    const { id } = await params;

    const employee = db.prepare(`
      SELECT e.*, d.name as department_name, d.code as department_code,
             rm.full_name as reporting_manager_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees rm ON e.reporting_manager_id = rm.id
      WHERE e.id = ?
    `).get(id);

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Get salary structure
    const salaryStructure = db.prepare(`
      SELECT ss.*, ssd.*, sc.name as component_name, sc.code as component_code, sc.type as component_type
      FROM salary_structures ss
      LEFT JOIN salary_structure_details ssd ON ssd.salary_structure_id = ss.id
      LEFT JOIN salary_components sc ON sc.id = ssd.component_id
      WHERE ss.employee_id = ?
      ORDER BY sc.display_order ASC
    `).all(id);

    // Get loans
    const loans = db.prepare('SELECT * FROM loans WHERE employee_id = ? AND status = ?').all(id, 'ACTIVE');

    // Get attendance (last 6 months)
    const attendance = db.prepare(`
      SELECT * FROM attendance WHERE employee_id = ?
      ORDER BY year DESC, month DESC LIMIT 6
    `).all(id);

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
    const db = getDb();
    const { id } = await params;
    const body = await request.json();

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
        updateValues.push(body[field]);
      }
    });

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateFields.push("updated_at = datetime('now')");
    updateValues.push(id);

    db.prepare(
      `UPDATE employees SET ${updateFields.join(', ')} WHERE id = ?`
    ).run(...updateValues);

    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);

    // AUTO FNF GENERATION HOOK
    if (updated.is_active === 0 && updated.exit_date) {
      // Check if FNF already exists
      const existingFnf = db.prepare('SELECT id FROM fnf_settlements WHERE employee_id = ?').get(id);
      
      if (!existingFnf) {
        import('@/lib/db').then(({ generateId }) => {
          try {
            const ss = db.prepare('SELECT ctc_monthly FROM salary_structures WHERE employee_id = ?').get(id);
            const basic = db.prepare(`
              SELECT ssd.monthly_amount
              FROM salary_structure_details ssd
              JOIN salary_components sc ON sc.id = ssd.component_id
              JOIN salary_structures ss ON ss.id = ssd.salary_structure_id
              WHERE ss.employee_id = ? AND sc.code = 'BASIC'
            `).get(id)?.monthly_amount || 0;

            let gratuity = 0;
            if (updated.joining_date) {
              const years = (new Date(updated.exit_date) - new Date(updated.joining_date)) / (1000 * 60 * 60 * 24 * 365.25);
              if (years >= 5) {
                gratuity = Math.round((basic * 15 * Math.round(years)) / 26);
              }
            }

            const elBalance = db.prepare('SELECT el_balance FROM attendance WHERE employee_id = ? ORDER BY year DESC, month DESC LIMIT 1').get(id)?.el_balance || 0;
            const leaveEncashment = Math.round(elBalance * Math.round((ss?.ctc_monthly || 0) / 26));
            
            const pendingLoans = db.prepare("SELECT SUM(balance_outstanding) as total FROM loans WHERE employee_id = ? AND status = 'ACTIVE'").get(id)?.total || 0;
            const finalAmount = leaveEncashment + gratuity - pendingLoans;

            db.prepare(`
              INSERT INTO fnf_settlements (id, employee_id, last_working_date, notice_period_days, notice_period_recovery,
                leave_encashment, gratuity, bonus_payable, pending_deductions, asset_recovery, asset_recovery_amount,
                noc_status, final_amount, status)
              VALUES (?, ?, ?, 30, 0, ?, ?, 0, ?, 0, 0, 'PENDING', ?, 'DRAFT')
            `).run(generateId(), id, updated.exit_date, leaveEncashment, gratuity, pendingLoans, finalAmount);
          } catch(err) {
            console.error('Auto FNF failed:', err);
          }
        });
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
    const db = getDb();
    const { id } = await params;
    
    // Soft delete
    db.prepare("UPDATE employees SET is_active = 0, exit_date = date('now'), updated_at = datetime('now') WHERE id = ?").run(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/employees/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
