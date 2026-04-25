import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';

    const departments = db.prepare(
      'SELECT * FROM departments WHERE company_id = ? ORDER BY name ASC'
    ).all(companyId);

    return NextResponse.json({ departments });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — create a new department
// Body: { name, code, company_id? }
export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();
    const companyId = body.company_id || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';

    const name = (body.name || '').trim();
    const code = (body.code || '').trim().toUpperCase();

    if (!name) return NextResponse.json({ error: 'Department name is required' }, { status: 400 });
    if (!code) return NextResponse.json({ error: 'Department code is required' }, { status: 400 });
    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) {
      return NextResponse.json({ error: 'Code must be 2–20 chars, A–Z, 0–9, _ or -' }, { status: 400 });
    }

    const clash = db.prepare('SELECT id FROM departments WHERE company_id = ? AND code = ?').get(companyId, code);
    if (clash) return NextResponse.json({ error: `Department code ${code} already exists` }, { status: 409 });

    const id = generateId();
    db.prepare('INSERT INTO departments (id, company_id, name, code) VALUES (?, ?, ?, ?)')
      .run(id, companyId, name, code);

    try {
      db.prepare(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(generateId(), companyId, 'DEPARTMENT_CREATED', 'department', id, JSON.stringify({ name, code }), 'admin');
    } catch (e) { console.error('audit:', e.message); }

    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
    return NextResponse.json({ department: dept }, { status: 201 });
  } catch (error) {
    console.error('POST /api/departments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — rename a department
// Body: { id, name?, code? }
export async function PUT(request) {
  try {
    const db = getDb();
    const { id, name, code } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

    const updates = [];
    const values = [];
    if (name) { updates.push('name = ?'); values.push(name.trim()); }
    if (code) {
      const up = code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,20}$/.test(up)) return NextResponse.json({ error: 'Code must be 2–20 chars, A–Z, 0–9, _ or -' }, { status: 400 });
      if (up !== dept.code) {
        const clash = db.prepare('SELECT id FROM departments WHERE company_id = ? AND code = ? AND id != ?').get(dept.company_id, up, id);
        if (clash) return NextResponse.json({ error: `Code ${up} already exists` }, { status: 409 });
      }
      updates.push('code = ?'); values.push(up);
    }
    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    values.push(id);
    db.prepare(`UPDATE departments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
    return NextResponse.json({ department: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a department (only if no employees reference it)
export async function DELETE(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const inUse = db.prepare('SELECT COUNT(*) as c FROM employees WHERE department_id = ?').get(id).c;
    if (inUse > 0) {
      return NextResponse.json({ error: `Cannot delete — ${inUse} employee${inUse === 1 ? '' : 's'} still assigned to this department. Reassign them first.` }, { status: 409 });
    }

    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
    if (!dept) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.prepare('DELETE FROM departments WHERE id = ?').run(id);

    try {
      db.prepare(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(generateId(), dept.company_id, 'DEPARTMENT_DELETED', 'department', id, JSON.stringify({ name: dept.name, code: dept.code }), 'admin');
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
