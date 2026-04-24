import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';
    const month = parseInt(searchParams.get('month')) || new Date().getMonth() + 1;
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear();

    const records = db.prepare(`
      SELECT a.*, e.full_name, e.employee_code, e.designation, e.department_id,
             d.name as department_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND a.month = ? AND a.year = ? AND e.is_active = 1
      ORDER BY e.employee_code ASC
    `).all(companyId, month, year);

    // Get employees without attendance for this month
    const allActive = db.prepare(`
      SELECT e.id, e.full_name, e.employee_code, e.designation, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND e.is_active = 1
      ORDER BY e.employee_code ASC
    `).all(companyId);

    const withAttendance = new Set(records.map(r => r.employee_id));
    const withoutAttendance = allActive.filter(e => !withAttendance.has(e.id));

    return NextResponse.json({ records, withoutAttendance, month, year });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();

    if (body.bulk) {
      // Bulk save attendance
      const upsert = db.prepare(`
        INSERT INTO attendance (id, employee_id, month, year, total_working_days, present_days, absent_days, paid_leaves, unpaid_leaves, overtime_hours, late_marks, half_days, cl_balance, sl_balance, el_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id, month, year) DO UPDATE SET
          total_working_days = excluded.total_working_days,
          present_days = excluded.present_days,
          absent_days = excluded.absent_days,
          paid_leaves = excluded.paid_leaves,
          unpaid_leaves = excluded.unpaid_leaves,
          overtime_hours = excluded.overtime_hours,
          late_marks = excluded.late_marks,
          half_days = excluded.half_days,
          cl_balance = excluded.cl_balance,
          sl_balance = excluded.sl_balance,
          el_balance = excluded.el_balance,
          updated_at = datetime('now')
      `);

      const transaction = db.transaction((entries) => {
        for (const entry of entries) {
          upsert.run(
            generateId(), entry.employee_id, entry.month, entry.year,
            entry.total_working_days || 0, entry.present_days || 0,
            entry.absent_days || 0, entry.paid_leaves || 0,
            entry.unpaid_leaves || 0, entry.overtime_hours || 0,
            entry.late_marks || 0, entry.half_days || 0,
            entry.cl_balance || 0, entry.sl_balance || 0, entry.el_balance || 0
          );
        }
      });

      transaction(body.entries);
      return NextResponse.json({ success: true, count: body.entries.length });
    }

    return NextResponse.json({ error: 'Use bulk: true with entries array' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
