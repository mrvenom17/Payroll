import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';
import { getSession, getSecureCompanyId } from '@/lib/authHelper';
import {
  getBreakdownTemplate,
  computeBreakdown,
  breakdownsEqual,
  EARNING_ORDER,
} from '@/lib/salaryBreakdown';

const ALLOWED_ROLES = ['admin', 'super_admin'];

// Only admins / super admins may preview or apply bulk breakdowns.
async function authorize(request) {
  const session = await getSession(request);
  if (!session) return { error: 'Unauthorized', status: 401 };
  if (!ALLOWED_ROLES.includes(session.role)) {
    return { error: 'Forbidden — admin or super admin only', status: 403 };
  }
  return { session };
}

// Load current EARNING breakdown for all active employees of a company that
// already have a salary structure (i.e. a CTC on record). Grouped in JS.
async function loadEmployees(pool, companyId) {
  const [rows] = await pool.execute(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name,
            ss.id AS structure_id, ss.ctc_annual, ss.ctc_monthly,
            sc.code, sc.name, ssd.monthly_amount
     FROM employees e
     JOIN salary_structures ss ON ss.employee_id = e.id
     LEFT JOIN salary_structure_details ssd ON ssd.salary_structure_id = ss.id
     LEFT JOIN salary_components sc
            ON sc.id = ssd.component_id AND sc.type = 'EARNING'
     WHERE e.company_id = ? AND e.is_active = 1
     ORDER BY e.employee_code ASC`,
    [companyId]
  );

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.employee_id)) {
      map.set(r.employee_id, {
        employee_id: r.employee_id,
        employee_code: r.employee_code,
        full_name: r.full_name,
        structure_id: r.structure_id,
        ctc_annual: Number(r.ctc_annual),
        ctc_monthly: Number(r.ctc_monthly),
        current: [],
      });
    }
    if (r.code) {
      map.get(r.employee_id).current.push({
        code: r.code,
        name: r.name,
        monthly: Math.round(Number(r.monthly_amount) || 0),
      });
    }
  }
  return [...map.values()];
}

const COMPONENT_NAMES = {
  BASIC: 'Basic Salary',
  HRA: 'House Rent Allowance',
  CONV: 'Conveyance Allowance',
  PETROL: 'Petrol Allowance',
  MED: 'Medical Allowance',
  SPL: 'Special Allowance',
};

function sortByOrder(list) {
  return [...list].sort(
    (a, b) => EARNING_ORDER.indexOf(a.code) - EARNING_ORDER.indexOf(b.code)
  );
}

// GET — preview. Returns every active employee whose current breakdown differs
// from what the template would produce, with current vs proposed side by side.
// Writes nothing.
export async function GET(request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const pool = getPool();
    const companyId = await getSecureCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: 'No active company selected' }, { status: 400 });
    }

    const template = await getBreakdownTemplate(pool);
    const employees = await loadEmployees(pool, companyId);

    const candidates = [];
    let okCount = 0;

    for (const emp of employees) {
      const proposed = computeBreakdown(emp.ctc_annual, template).map((c) => ({
        code: c.code,
        name: COMPONENT_NAMES[c.code] || c.code,
        monthly: c.monthly,
      }));

      if (breakdownsEqual(emp.current, proposed)) {
        okCount++;
        continue;
      }

      candidates.push({
        employee_id: emp.employee_id,
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        ctc_annual: emp.ctc_annual,
        ctc_monthly: emp.ctc_monthly,
        status: emp.current.length === 0 ? 'MISSING' : 'MISMATCH',
        current: sortByOrder(emp.current),
        proposed: sortByOrder(proposed),
      });
    }

    return NextResponse.json({
      template,
      candidates,
      summary: {
        total_active_with_ctc: employees.length,
        needs_fix: candidates.length,
        already_ok: okCount,
      },
    });
  } catch (e) {
    console.error('GET /api/salary-structures/auto-breakdown:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — apply. Body: { employee_ids: [...] }
// Recomputes and permanently rewrites the EARNING component breakdown for each
// approved employee. CTC is preserved; only the split changes. Transactional.
export async function POST(request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const pool = getPool();
    const companyId = await getSecureCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: 'No active company selected' }, { status: 400 });
    }

    const body = await request.json();
    const requestedIds = Array.isArray(body.employee_ids) ? body.employee_ids : [];
    if (requestedIds.length === 0) {
      return NextResponse.json({ error: 'employee_ids array required' }, { status: 400 });
    }

    const template = await getBreakdownTemplate(pool);

    // Resolve component codes -> ids once.
    const [allComps] = await pool.execute(
      `SELECT id, code FROM salary_components WHERE type = 'EARNING'`
    );
    const codeToId = Object.fromEntries(allComps.map((c) => [c.code, c.id]));

    const results = [];
    const performedBy = auth.session.email || auth.session.uid || 'admin';

    for (const employeeId of requestedIds) {
      // Re-scope to the active company so a caller can only touch their own tenant.
      const [[struct]] = await pool.execute(
        `SELECT ss.id AS structure_id, ss.ctc_annual
         FROM salary_structures ss
         JOIN employees e ON e.id = ss.employee_id
         WHERE ss.employee_id = ? AND e.company_id = ?`,
        [employeeId, companyId]
      );

      if (!struct) {
        results.push({ employee_id: employeeId, status: 'SKIPPED', reason: 'No salary structure for this company' });
        continue;
      }

      const proposed = computeBreakdown(struct.ctc_annual, template)
        .map((c) => ({ component_id: codeToId[c.code], code: c.code, monthly: c.monthly }))
        .filter((c) => c.component_id);

      if (proposed.length === 0) {
        results.push({ employee_id: employeeId, status: 'SKIPPED', reason: 'No matching components' });
        continue;
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(
          'DELETE FROM salary_structure_details WHERE salary_structure_id = ?',
          [struct.structure_id]
        );
        for (const c of proposed) {
          await conn.execute(
            `INSERT INTO salary_structure_details
               (id, salary_structure_id, component_id, monthly_amount, annual_amount)
             VALUES (?, ?, ?, ?, ?)`,
            [generateId(), struct.structure_id, c.component_id, c.monthly, c.monthly * 12]
          );
        }
        await conn.execute(
          'UPDATE salary_structures SET updated_at = NOW() WHERE id = ?',
          [struct.structure_id]
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        results.push({ employee_id: employeeId, status: 'ERROR', reason: err.message });
        conn.release();
        continue;
      }
      conn.release();

      // Audit trail (best-effort).
      try {
        await pool.execute(
          `INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            generateId(), companyId, 'SALARY_BREAKDOWN_APPLIED', 'salary_structure', struct.structure_id,
            JSON.stringify({
              employee_id: employeeId,
              ctc_annual: Number(struct.ctc_annual),
              components: proposed.map((c) => ({ code: c.code, monthly: c.monthly })),
            }),
            performedBy,
          ]
        );
      } catch (e) {
        console.error('audit (auto-breakdown):', e.message);
      }

      results.push({ employee_id: employeeId, status: 'APPLIED' });
    }

    const applied = results.filter((r) => r.status === 'APPLIED').length;
    return NextResponse.json({ success: true, applied, results });
  } catch (e) {
    console.error('POST /api/salary-structures/auto-breakdown:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
