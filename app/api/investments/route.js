import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const fy = searchParams.get('financial_year') || '2024-2025';

    if (!employeeId) return NextResponse.json({ error: 'Employee ID required' }, { status: 400 });

    const decls = db.prepare(`SELECT * FROM investments WHERE employee_id = ? AND financial_year = ?`).all(employeeId, fy);
    return NextResponse.json({ declarations: decls });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { employee_id, financial_year, declarations } = body;

    const transaction = db.transaction(() => {
      // Clear old declarations
      db.prepare(`DELETE FROM investments WHERE employee_id = ? AND financial_year = ?`).run(employee_id, financial_year || '2024-2025');

      const insert = db.prepare(`
        INSERT INTO investments (id, employee_id, financial_year, section, type, declared_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const d of declarations) {
        if (parseFloat(d.amount) > 0) {
          insert.run(generateId(), employee_id, financial_year || '2024-2025', d.section, d.type, parseFloat(d.amount), 'APPROVED');
        }
      }
    });

    transaction();
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
