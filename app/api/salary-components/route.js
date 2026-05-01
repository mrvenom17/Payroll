import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET() {
  try {
    const pool = getPool();
    const [components] = await pool.execute(
      'SELECT * FROM salary_components WHERE is_active = 1 ORDER BY display_order ASC'
    );
    return NextResponse.json({ components });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — create a new custom salary component
// Body: { name, code, type, percent_of?, default_percent?, default_amount?, is_taxable?, contributes_to_pf?, contributes_to_esic?, tax_deductible?, description?, display_order? }
export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();

    const name = (body.name || '').trim();
    const code = (body.code || '').trim().toUpperCase();
    const type = (body.type || '').toUpperCase();

    if (!name) return NextResponse.json({ error: 'Component name is required' }, { status: 400 });
    if (!code) return NextResponse.json({ error: 'Component code is required' }, { status: 400 });
    if (!/^[A-Z0-9_]{2,20}$/.test(code)) {
      return NextResponse.json({ error: 'Code must be 2–20 chars: A–Z, 0–9, _' }, { status: 400 });
    }
    if (!['EARNING', 'DEDUCTION'].includes(type)) {
      return NextResponse.json({ error: 'Type must be EARNING or DEDUCTION' }, { status: 400 });
    }

    // Check uniqueness
    const [[clashName]] = await pool.execute('SELECT id FROM salary_components WHERE name = ?', [name]);
    if (clashName) return NextResponse.json({ error: `Component "${name}" already exists` }, { status: 409 });

    const [[clashCode]] = await pool.execute('SELECT id FROM salary_components WHERE code = ?', [code]);
    if (clashCode) return NextResponse.json({ error: `Code "${code}" already exists` }, { status: 409 });

    const id = generateId();
    await pool.execute(`
      INSERT INTO salary_components (id, name, code, type, is_statutory, is_fixed, is_taxable, contributes_to_pf, contributes_to_esic, tax_deductible, percent_of, default_percent, default_amount, description, is_active, display_order)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [
      id, name, code, type,
      body.is_fixed ? 1 : (body.percent_of ? 0 : 1),
      body.is_taxable ? 1 : 0,
      body.contributes_to_pf ? 1 : 0,
      body.contributes_to_esic ? 1 : 0,
      body.tax_deductible ? 1 : 0,
      body.percent_of || null,
      body.default_percent !== undefined && body.default_percent !== '' ? Number(body.default_percent) : null,
      body.default_amount !== undefined && body.default_amount !== '' ? Number(body.default_amount) : null,
      body.description || null,
      body.display_order !== undefined ? Number(body.display_order) : 99,
    ]);

    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), null, 'SALARY_COMPONENT_CREATED', 'salary_component', id, JSON.stringify({ name, code, type }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    const [[component]] = await pool.execute('SELECT * FROM salary_components WHERE id = ?', [id]);
    return NextResponse.json({ component }, { status: 201 });
  } catch (error) {
    console.error('POST /api/salary-components:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — update one component
// Body: { id, name?, percent_of?, default_percent?, default_amount?, is_taxable?, contributes_to_pf?, contributes_to_esic?, tax_deductible?, display_order? }
export async function PUT(request) {
  try {
    const pool = getPool();
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const [[existing]] = await pool.execute('SELECT * FROM salary_components WHERE id = ?', [id]);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const allowed = [
      'name', 'percent_of', 'default_percent', 'default_amount',
      'is_taxable', 'is_fixed', 'contributes_to_pf', 'contributes_to_esic',
      'tax_deductible', 'display_order', 'description', 'is_active',
    ];

    const updates = [];
    const values = [];
    for (const f of allowed) {
      if (body[f] !== undefined) {
        updates.push(`${f} = ?`);
        let v = body[f];
        if (['is_taxable','is_fixed','contributes_to_pf','contributes_to_esic','tax_deductible','is_active'].includes(f)) {
          v = v ? 1 : 0;
        }
        if (['default_percent','default_amount','display_order'].includes(f) && v !== null && v !== '') {
          v = Number(v);
        }
        if (['percent_of'].includes(f) && (v === '' || v === null)) v = null;
        values.push(v);
      }
    }
    if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    values.push(id);
    await pool.execute(`UPDATE salary_components SET ${updates.join(', ')} WHERE id = ?`, values);

    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), null, 'SALARY_COMPONENT_UPDATED', 'salary_component', id, JSON.stringify(body), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    const [[updated]] = await pool.execute('SELECT * FROM salary_components WHERE id = ?', [id]);
    return NextResponse.json({ component: updated });
  } catch (error) {
    console.error('PUT /api/salary-components:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — soft-delete a component (set is_active = 0)
// Statutory components cannot be deleted
export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const [[comp]] = await pool.execute('SELECT * FROM salary_components WHERE id = ?', [id]);
    if (!comp) return NextResponse.json({ error: 'Component not found' }, { status: 404 });

    if (comp.is_statutory) {
      return NextResponse.json({ error: 'Cannot delete statutory components (PF, ESIC, PT, TDS)' }, { status: 403 });
    }

    // Check if component is used in any salary structure
    const [[usage]] = await pool.execute(
      'SELECT COUNT(*) as c FROM salary_structure_details WHERE component_id = ?',
      [id]
    );
    if (usage.c > 0) {
      // Soft-delete instead of hard-delete
      await pool.execute('UPDATE salary_components SET is_active = 0 WHERE id = ?', [id]);
      return NextResponse.json({ success: true, soft_deleted: true, message: `Deactivated — ${usage.c} salary structure(s) reference this component` });
    }

    // Hard delete if unused
    await pool.execute('DELETE FROM salary_components WHERE id = ?', [id]);

    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), null, 'SALARY_COMPONENT_DELETED', 'salary_component', id, JSON.stringify({ name: comp.name, code: comp.code }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/salary-components:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
