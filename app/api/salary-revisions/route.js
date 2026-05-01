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
