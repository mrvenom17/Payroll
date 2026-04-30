import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
    const status = searchParams.get('status') || '';

    let query = `
      SELECT l.*, e.full_name, e.employee_code, e.designation
      FROM loans l
      JOIN employees e ON l.employee_id = e.id
      WHERE e.company_id = ?
    `;
    const params = [companyId];

    if (status) {
      query += ' AND l.status = ?';
      params.push(status);
    }

    query += ' ORDER BY l.created_at DESC';
    const [loans] = await pool.execute(query, params);

    const summary = {
      totalActive: loans.filter(l => l.status === 'ACTIVE').length,
      totalOutstanding: loans.filter(l => l.status === 'ACTIVE').reduce((s, l) => s + l.balance_outstanding, 0),
      totalDisbursed: loans.reduce((s, l) => s + l.loan_amount, 0),
    };

    return NextResponse.json({ loans, summary });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();

    const id = generateId();
    const totalEmis = Math.ceil(body.loan_amount / body.emi_amount);

    await pool.execute(`
      INSERT INTO loans (id, employee_id, loan_type, loan_amount, emi_amount, total_emis, balance_outstanding, start_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `, [id, body.employee_id, body.loan_type, body.loan_amount, body.emi_amount, totalEmis, body.loan_amount, body.start_date || new Date().toISOString().split('T')[0]]);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
