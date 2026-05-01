import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';
    const month = parseInt(searchParams.get('month')) || new Date().getMonth() + 1;
    const year = parseInt(searchParams.get('year')) || new Date().getFullYear();

    const [records] = await pool.execute(`
      SELECT a.*, e.full_name, e.employee_code, e.designation, e.department_id,
             d.name as department_name
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND a.month = ? AND a.year = ? AND e.is_active = 1
      ORDER BY e.employee_code ASC
    `, [companyId, month, year]);

    // Get employees without attendance for this month
    const [allActive] = await pool.execute(`
      SELECT e.id, e.full_name, e.employee_code, e.designation, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND e.is_active = 1
      ORDER BY e.employee_code ASC
    `, [companyId]);

    const withAttendance = new Set(records.map(r => r.employee_id));
    const withoutAttendance = allActive.filter(e => !withAttendance.has(e.id));

    return NextResponse.json({ records, withoutAttendance, month, year });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();

    if (body.bulk) {
      // Bulk save attendance — use INSERT ... ON DUPLICATE KEY UPDATE (MySQL equivalent of ON CONFLICT)
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        for (const entry of body.entries) {
          await conn.execute(`
            INSERT INTO attendance (id, employee_id, month, year, total_working_days, present_days, absent_days, paid_leaves, unpaid_leaves, overtime_hours, late_marks, half_days, cl_balance, sl_balance, el_balance)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              total_working_days = VALUES(total_working_days),
              present_days = VALUES(present_days),
              absent_days = VALUES(absent_days),
              paid_leaves = VALUES(paid_leaves),
              unpaid_leaves = VALUES(unpaid_leaves),
              overtime_hours = VALUES(overtime_hours),
              late_marks = VALUES(late_marks),
              half_days = VALUES(half_days),
              cl_balance = VALUES(cl_balance),
              sl_balance = VALUES(sl_balance),
              el_balance = VALUES(el_balance),
              updated_at = NOW()
          `, [
            generateId(), entry.employee_id, entry.month, entry.year,
            entry.total_working_days || 0, entry.present_days || 0,
            entry.absent_days || 0, entry.paid_leaves || 0,
            entry.unpaid_leaves || 0, entry.overtime_hours || 0,
            entry.late_marks || 0, entry.half_days || 0,
            entry.cl_balance || 0, entry.sl_balance || 0, entry.el_balance || 0
          ]);
        }

        await conn.commit();
        return NextResponse.json({ success: true, count: body.entries.length });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }

    return NextResponse.json({ error: 'Use bulk: true with entries array' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — clear attendance records for a month/year
// Use ?month=X&year=Y&company=Z to clear all attendance for that period
// Or ?id=X to delete a single record
export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const month = parseInt(searchParams.get('month'));
    const year = parseInt(searchParams.get('year'));
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';

    if (id) {
      // Delete single record
      const [[record]] = await pool.execute('SELECT * FROM attendance WHERE id = ?', [id]);
      if (!record) return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
      await pool.execute('DELETE FROM attendance WHERE id = ?', [id]);
      return NextResponse.json({ success: true, deleted: 1 });
    }

    if (!month || !year) {
      return NextResponse.json({ error: 'Provide id=<record_id> or month=X&year=Y&company=Z' }, { status: 400 });
    }

    const [result] = await pool.execute(`
      DELETE a FROM attendance a
      JOIN employees e ON e.id = a.employee_id
      WHERE a.month = ? AND a.year = ? AND e.company_id = ?
    `, [month, year, companyId]);

    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), companyId, 'ATTENDANCE_CLEARED', 'attendance', `${month}-${year}`, JSON.stringify({ month, year, deleted: result.affectedRows }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true, deleted: result.affectedRows });
  } catch (error) {
    console.error('DELETE /api/attendance:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
