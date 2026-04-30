import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
    const limit = parseInt(searchParams.get('limit') || '50');
    const action = searchParams.get('action') || '';

    let query = `
      SELECT al.*, e.full_name as performed_by_name
      FROM audit_logs al
      LEFT JOIN employees e ON al.performed_by = e.id
      WHERE al.company_id = ?
    `;
    const params = [companyId];

    if (action) {
      query += ` AND al.action = ?`;
      params.push(action);
    }

    query += ` ORDER BY al.created_at DESC LIMIT ?`;
    params.push(limit);

    const [logs] = await pool.execute(query, params);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('GET /api/audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();

    const id = generateId();
    await pool.execute(`
      INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      body.company_id || request?.cookies?.get('active_company')?.value || '',
      body.action,
      body.entity_type,
      body.entity_id || null,
      body.details ? JSON.stringify(body.details) : null,
      body.performed_by || 'system',
      body.ip_address || null,
    ]);

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
