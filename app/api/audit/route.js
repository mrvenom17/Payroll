import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';
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

    const logs = db.prepare(query).all(...params);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('GET /api/audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();

    const id = generateId();
    db.prepare(`
      INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.company_id || request?.cookies?.get('active_company')?.value || 'comp_uabiotech',
      body.action,
      body.entity_type,
      body.entity_id || null,
      body.details ? JSON.stringify(body.details) : null,
      body.performed_by || 'system',
      body.ip_address || null,
    );

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
