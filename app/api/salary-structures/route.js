import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';

// GET — fetch structure for an employee
// Query: ?employee=emp_id
export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee');
    if (!employeeId) return NextResponse.json({ error: 'employee required' }, { status: 400 });

    const structure = db.prepare('SELECT * FROM salary_structures WHERE employee_id = ?').get(employeeId);
    if (!structure) return NextResponse.json({ structure: null, components: [] });

    const components = db.prepare(`
      SELECT ssd.id, ssd.component_id, ssd.monthly_amount, ssd.annual_amount,
             sc.code, sc.name, sc.type, sc.display_order
      FROM salary_structure_details ssd
      JOIN salary_components sc ON sc.id = ssd.component_id
      WHERE ssd.salary_structure_id = ?
      ORDER BY sc.display_order ASC
    `).all(structure.id);

    return NextResponse.json({ structure, components });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT — upsert structure + component amounts for an employee
// Body: {
//   employee_id,
//   ctc_annual,  (optional; if omitted, recomputed from components*12)
//   effective_from,
//   components: [{ code | component_id, monthly_amount }, ...]
// }
export async function PUT(request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { employee_id } = body;
    if (!employee_id) return NextResponse.json({ error: 'employee_id required' }, { status: 400 });
    if (!Array.isArray(body.components) || body.components.length === 0) {
      return NextResponse.json({ error: 'components array required' }, { status: 400 });
    }

    // Resolve components by code or id
    const allComponents = db.prepare(`SELECT id, code, type FROM salary_components WHERE type = 'EARNING'`).all();
    const byCode = Object.fromEntries(allComponents.map(c => [c.code, c]));
    const byId = Object.fromEntries(allComponents.map(c => [c.id, c]));

    const resolved = [];
    for (const c of body.components) {
      const amt = Math.max(0, Math.round(Number(c.monthly_amount) || 0));
      const comp = c.component_id ? byId[c.component_id] : byCode[c.code];
      if (!comp) continue;
      resolved.push({ component_id: comp.id, monthly_amount: amt });
    }
    if (resolved.length === 0) {
      return NextResponse.json({ error: 'No valid components resolved' }, { status: 400 });
    }

    const monthlyTotal = resolved.reduce((s, c) => s + c.monthly_amount, 0);
    const annualTotal = body.ctc_annual ? Number(body.ctc_annual) : monthlyTotal * 12;
    const monthly = Math.round(annualTotal / 12);
    const effectiveFrom = body.effective_from || new Date().toISOString().split('T')[0];

    const existing = db.prepare('SELECT id FROM salary_structures WHERE employee_id = ?').get(employee_id);

    const txn = db.transaction(() => {
      let structId = existing?.id;
      if (structId) {
        db.prepare(`UPDATE salary_structures SET ctc_annual = ?, ctc_monthly = ?, effective_from = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(annualTotal, monthly, effectiveFrom, structId);
        db.prepare('DELETE FROM salary_structure_details WHERE salary_structure_id = ?').run(structId);
      } else {
        structId = generateId();
        db.prepare('INSERT INTO salary_structures (id, employee_id, ctc_annual, ctc_monthly, effective_from) VALUES (?, ?, ?, ?, ?)')
          .run(structId, employee_id, annualTotal, monthly, effectiveFrom);
      }
      const insertDetail = db.prepare(
        'INSERT INTO salary_structure_details (id, salary_structure_id, component_id, monthly_amount, annual_amount) VALUES (?, ?, ?, ?, ?)'
      );
      for (const c of resolved) {
        insertDetail.run(generateId(), structId, c.component_id, c.monthly_amount, c.monthly_amount * 12);
      }
      return structId;
    });

    const structId = txn();

    // Revision log
    try {
      const prevCTC = existing ? db.prepare('SELECT ctc_annual FROM salary_structures WHERE id = ?').get(existing.id)?.ctc_annual : 0;
      if (existing && prevCTC !== annualTotal) {
        db.prepare(`INSERT INTO salary_revisions (id, employee_id, old_ctc, new_ctc, effective_from, reason) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(generateId(), employee_id, prevCTC || 0, annualTotal, effectiveFrom, 'Structure edit');
      }
      const emp = db.prepare('SELECT company_id FROM employees WHERE id = ?').get(employee_id);
      db.prepare(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(generateId(), emp?.company_id, existing ? 'SALARY_STRUCTURE_UPDATED' : 'SALARY_STRUCTURE_CREATED', 'salary_structure', structId,
          JSON.stringify({ employee_id, ctc_annual: annualTotal, components: resolved.length }), 'admin');
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true, structure_id: structId, ctc_annual: annualTotal, ctc_monthly: monthly });
  } catch (e) {
    console.error('PUT /api/salary-structures:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
