import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
    const employeeId = searchParams.get('employee_id');

    let query = `
      SELECT sr.*, e.full_name, e.employee_code, e.designation, d.name as department_name
      FROM salary_revisions sr
      JOIN employees e ON sr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ?
    `;
    const params = [companyId];

    if (employeeId) {
      query += ` AND sr.employee_id = ?`;
      params.push(employeeId);
    }

    query += ` ORDER BY sr.created_at DESC`;

    const [revisions] = await pool.execute(query, params);

    // Compute increment %
    const enriched = revisions.map(r => ({
      ...r,
      increment_pct: r.old_ctc > 0 ? (((r.new_ctc - r.old_ctc) / r.old_ctc) * 100).toFixed(1) : '—',
    }));

    return NextResponse.json({ revisions: enriched });
  } catch (error) {
    console.error('GET /api/salary-revisions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();
    const { employee_id, old_ctc, new_ctc, effective_from, reason, approved_by } = body;

    if (!employee_id || new_ctc === undefined || !effective_from) {
      return NextResponse.json({ error: 'employee_id, new_ctc, and effective_from are required' }, { status: 400 });
    }

    const id = generateId();
    await pool.execute(`
      INSERT INTO salary_revisions (id, employee_id, old_ctc, new_ctc, effective_from, reason, approved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, employee_id, old_ctc || 0, new_ctc, effective_from, reason || null, approved_by || 'admin']);

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/salary-revisions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a salary revision record
export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const [[rev]] = await pool.execute('SELECT * FROM salary_revisions WHERE id = ?', [id]);
    if (!rev) return NextResponse.json({ error: 'Revision not found' }, { status: 404 });

    await pool.execute('DELETE FROM salary_revisions WHERE id = ?', [id]);

    try {
      const [[emp]] = await pool.execute('SELECT company_id FROM employees WHERE id = ?', [rev.employee_id]);
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), emp?.company_id, 'SALARY_REVISION_DELETED', 'salary_revision', id, JSON.stringify({ employee_id: rev.employee_id, old_ctc: rev.old_ctc, new_ctc: rev.new_ctc }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/salary-revisions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
