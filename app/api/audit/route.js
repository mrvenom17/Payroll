import { NextResponse } from 'next/server';
import { getSecureCompanyId } from '@/lib/authHelper';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = await getSecureCompanyId(request);
    const limit = parseInt(searchParams.get('limit') || '50');
    const action = searchParams.get('action') || '';

    let query = `
      SELECT al.*, u.full_name as performed_by_name
      FROM audit_logs al
      LEFT JOIN users u ON al.performed_by = u.id
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
    
    // Opportunistic purge
    try {
      const [[setting]] = await pool.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'audit_log_retention_days'");
      const days = parseInt(setting?.setting_value || '7');
      if (days > 0) {
        await pool.execute(`DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, [days]);
      }
    } catch (e) {
      console.error('Audit purge error:', e);
    }
    await pool.execute(`
      INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      await getSecureCompanyId(request),
      body.action,
      body.entity_type,
      body.entity_id || null,
      body.details ? JSON.stringify({ ...body.details, is_auto_log: body.is_auto_log }) : (body.is_auto_log ? JSON.stringify({ is_auto_log: true }) : null),
      body.performed_by || 'system',
      body.ip_address || null,
    ]);

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/audit error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
