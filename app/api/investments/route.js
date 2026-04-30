import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const fy = searchParams.get('financial_year') || '2024-2025';

    if (!employeeId) return NextResponse.json({ error: 'Employee ID required' }, { status: 400 });

    const [decls] = await pool.execute(`SELECT * FROM investments WHERE employee_id = ? AND financial_year = ?`, [employeeId, fy]);
    return NextResponse.json({ declarations: decls });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();
    const { employee_id, financial_year, declarations } = body;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Clear old declarations
      await conn.execute(`DELETE FROM investments WHERE employee_id = ? AND financial_year = ?`, [employee_id, financial_year || '2024-2025']);

      for (const d of declarations) {
        if (parseFloat(d.amount) > 0) {
          await conn.execute(`
            INSERT INTO investments (id, employee_id, financial_year, section, type, declared_amount, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [generateId(), employee_id, financial_year || '2024-2025', d.section, d.type, parseFloat(d.amount), 'APPROVED']);
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
