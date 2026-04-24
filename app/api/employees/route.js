import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const department = searchParams.get('department') || '';

    let query = `
      SELECT e.*, d.name as department_name, d.code as department_code,
             rm.full_name as reporting_manager_name,
             ss.ctc_annual, ss.ctc_monthly
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees rm ON e.reporting_manager_id = rm.id
      LEFT JOIN salary_structures ss ON ss.employee_id = e.id
      WHERE e.company_id = ?
    `;
    const params = [companyId];

    if (search) {
      query += ` AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email_id LIKE ? OR e.mobile_number LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status === 'active') {
      query += ` AND e.is_active = 1`;
    } else if (status === 'inactive') {
      query += ` AND e.is_active = 0`;
    }

    if (department) {
      query += ` AND e.department_id = ?`;
      params.push(department);
    }

    query += ` ORDER BY e.employee_code ASC`;

    const employees = db.prepare(query).all(...params);

    return NextResponse.json({ employees });
  } catch (error) {
    console.error('GET /api/employees error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();

    // Generate employee code
    const companyId = body.company_id || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';
    const company = db.prepare('SELECT code FROM companies WHERE id = ?').get(companyId);
    const lastEmp = db.prepare(
      "SELECT employee_code FROM employees WHERE company_id = ? ORDER BY employee_code DESC LIMIT 1"
    ).get(companyId);

    let nextNum = 1;
    if (lastEmp) {
      const parts = lastEmp.employee_code.split('-');
      nextNum = parseInt(parts[1]) + 1;
    }
    const employeeCode = `${company.code}-${String(nextNum).padStart(3, '0')}`;

    const id = generateId();
    const fields = [
      'company_id', 'employee_code', 'full_name', 'father_spouse_name',
      'date_of_birth', 'gender', 'mobile_number', 'email_id',
      'current_address', 'permanent_address', 'joining_date',
      'department_id', 'designation', 'reporting_manager_id',
      'employment_type', 'work_location', 'probation_end_date',
      'pan_number', 'aadhaar_number', 'uan', 'pf_number',
      'esic_number', 'pt_state', 'lwf_applicable', 'tds_applicable',
      'previous_employer_income', 'previous_employer_tds',
      'bank_name', 'account_number', 'ifsc_code', 'branch_name',
      'payment_mode', 'tax_regime', 'skill_category'
    ];

    const values = [id, companyId, employeeCode];
    const placeholders = ['?', '?', '?'];

    fields.slice(2).forEach(field => {
      values.push(body[field] !== undefined ? body[field] : null);
      placeholders.push('?');
    });

    const insertFields = ['id', ...fields];
    db.prepare(
      `INSERT INTO employees (${insertFields.join(', ')}) VALUES (${placeholders.join(', ')})`
    ).run(...values);

    // If CTC provided, create salary structure
    if (body.ctc_annual && body.ctc_annual > 0) {
      const ctcAnnual = parseFloat(body.ctc_annual);
      const ctcMonthly = Math.round(ctcAnnual / 12);
      const structId = generateId();

      db.prepare(
        'INSERT INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from) VALUES (?, ?, ?, ?, ?)'
      ).run(structId, id, ctcAnnual, ctcMonthly, body.joining_date || new Date().toISOString().split('T')[0]);

      // Auto-calculate breakdown
      const basic = Math.round(ctcAnnual * 0.40 / 12);
      const hra = Math.round(basic * 0.40);
      const conv = 1600;
      const med = 1250;
      const special = Math.max(ctcMonthly - basic - hra - conv - med, 0);

      const components = [
        ['sc_basic', basic],
        ['sc_hra', hra],
        ['sc_conv', conv],
        ['sc_med', med],
        ['sc_spl', special],
      ];

      const insertDetail = db.prepare(
        'INSERT INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES (?, ?, ?, ?, ?)'
      );

      components.forEach(([compId, monthly]) => {
        insertDetail.run(generateId(), structId, compId, monthly, monthly * 12);
      });
    }

    const newEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
    return NextResponse.json({ employee: newEmployee, employeeCode }, { status: 201 });
  } catch (error) {
    console.error('POST /api/employees error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
