import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
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

    const [employees] = await pool.execute(query, params);

    return NextResponse.json({ employees });
  } catch (error) {
    console.error('GET /api/employees error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();

    // Generate employee code
    const companyId = body.company_id || request?.cookies?.get('active_company')?.value || '';
    const [[company]] = await pool.execute('SELECT code FROM companies WHERE id = ?', [companyId]);
    const [[lastEmp]] = await pool.execute(
      "SELECT employee_code FROM employees WHERE company_id = ? ORDER BY employee_code DESC LIMIT 1",
      [companyId]
    );

    let nextNum = 1;
    if (lastEmp) {
      const parts = lastEmp.employee_code.split('-');
      nextNum = parseInt(parts[1]) + 1;
    }
    const employeeCode = `${company.code}-${String(nextNum).padStart(3, '0')}`;

    // Validate FK fields: if provided id doesn't exist, null it out so FK doesn't fail
    if (body.reporting_manager_id) {
      const [[mgr]] = await pool.execute('SELECT id FROM employees WHERE id = ?', [body.reporting_manager_id]);
      if (!mgr) body.reporting_manager_id = null;
    }
    if (body.department_id) {
      const [[dept]] = await pool.execute('SELECT id FROM departments WHERE id = ?', [body.department_id]);
      if (!dept) body.department_id = null;
    }

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
      const v = body[field];
      values.push(v === undefined || v === '' ? null : v);
      placeholders.push('?');
    });

    const insertFields = ['id', ...fields];
    await pool.execute(
      `INSERT INTO employees (${insertFields.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    );

    // Salary structure: prefer explicit components from client (manual entry).
    // Fall back to auto-breakdown using template settings if only ctc_annual is given.
    const hasExplicitComponents = Array.isArray(body.salary_components) && body.salary_components.length > 0;

    if (hasExplicitComponents || (body.ctc_annual && body.ctc_annual > 0)) {
      const setting = async (key, fallback) => {
        const [[row]] = await pool.execute('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key]);
        return row ? Number(row.setting_value) : fallback;
      };
      const tBasicPct = await setting('template_basic_pct', 50);
      const tHraPct = await setting('template_hra_pct', 40);
      const tConv = await setting('template_conv_amount', 1600);
      const tMed = await setting('template_med_amount', 1250);

      // Resolve the components by code
      const [allComps] = await pool.execute(`SELECT id, code FROM salary_components WHERE type='EARNING'`);
      const codeToId = Object.fromEntries(allComps.map(c => [c.code, c.id]));

      let comps;
      if (hasExplicitComponents) {
        comps = body.salary_components
          .map(c => ({ component_id: codeToId[c.code], monthly: Math.max(0, Math.round(Number(c.monthly_amount) || 0)) }))
          .filter(c => c.component_id);
      } else {
        const ctcAnnual = parseFloat(body.ctc_annual);
        const monthly = Math.round(ctcAnnual / 12);
        const basic = Math.round(monthly * (tBasicPct / 100));
        const hra = Math.round(basic * (tHraPct / 100));
        const conv = tConv;
        const med = tMed;
        const special = Math.max(monthly - basic - hra - conv - med, 0);
        comps = [
          { component_id: codeToId.BASIC, monthly: basic },
          { component_id: codeToId.HRA, monthly: hra },
          { component_id: codeToId.CONV, monthly: conv },
          { component_id: codeToId.MED, monthly: med },
          { component_id: codeToId.SPL, monthly: special },
        ].filter(c => c.component_id);
      }

      const monthlyTotal = comps.reduce((s, c) => s + c.monthly, 0);
      const ctcAnnual = body.ctc_annual ? Math.round(parseFloat(body.ctc_annual)) : monthlyTotal * 12;
      const ctcMonthly = Math.round(ctcAnnual / 12);

      const structId = generateId();
      await pool.execute(
        'INSERT INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from) VALUES (?, ?, ?, ?, ?)',
        [structId, id, ctcAnnual, ctcMonthly, body.joining_date || new Date().toISOString().split('T')[0]]
      );

      for (const c of comps) {
        await pool.execute(
          'INSERT INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES (?, ?, ?, ?, ?)',
          [generateId(), structId, c.component_id, c.monthly, c.monthly * 12]
        );
      }
    }

    const [[newEmployee]] = await pool.execute('SELECT * FROM employees WHERE id = ?', [id]);
    return NextResponse.json({ employee: newEmployee, employeeCode }, { status: 201 });
  } catch (error) {
    console.error('POST /api/employees error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
