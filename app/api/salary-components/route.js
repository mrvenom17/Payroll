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
