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

    if (!body.employee_id) return NextResponse.json({ error: 'employee_id is required' }, { status: 400 });
    if (!body.loan_amount || body.loan_amount <= 0) return NextResponse.json({ error: 'loan_amount must be positive' }, { status: 400 });
    if (!body.emi_amount || body.emi_amount <= 0) return NextResponse.json({ error: 'emi_amount must be positive' }, { status: 400 });

    const id = generateId();
    const totalEmis = Math.ceil(body.loan_amount / body.emi_amount);

    await pool.execute(`
      INSERT INTO loans (id, employee_id, loan_type, loan_amount, emi_amount, total_emis, balance_outstanding, start_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `, [id, body.employee_id, body.loan_type || 'Advance', body.loan_amount, body.emi_amount, totalEmis, body.loan_amount, body.start_date || new Date().toISOString().split('T')[0]]);

    // Audit log
    try {
      const [[emp]] = await pool.execute('SELECT company_id FROM employees WHERE id = ?', [body.employee_id]);
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), emp?.company_id, 'LOAN_CREATED', 'loan', id, JSON.stringify({ employee_id: body.employee_id, amount: body.loan_amount, type: body.loan_type }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    const [[loan]] = await pool.execute('SELECT * FROM loans WHERE id = ?', [id]);
    return NextResponse.json({ success: true, id, loan }, { status: 201 });
  } catch (error) {
    console.error('POST /api/loans:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — edit loan fields, or perform actions: 'close', 'write_off', 'reactivate'
export async function PUT(request) {
  try {
    const pool = getPool();
    const body = await request.json();
    const { id, action } = body;

    if (!id) return NextResponse.json({ error: 'Loan id is required' }, { status: 400 });

    const [[loan]] = await pool.execute('SELECT * FROM loans WHERE id = ?', [id]);
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // Action-based updates
    if (action === 'close') {
      if (loan.status !== 'ACTIVE') {
        return NextResponse.json({ error: `Cannot close a loan in ${loan.status} state` }, { status: 400 });
      }
      await pool.execute(
        `UPDATE loans SET status = 'CLOSED', balance_outstanding = 0, paid_emis = total_emis, end_date = CURDATE() WHERE id = ?`,
        [id]
      );
      try {
        const [[emp]] = await pool.execute('SELECT company_id FROM employees WHERE id = ?', [loan.employee_id]);
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), emp?.company_id, 'LOAN_CLOSED', 'loan', id, JSON.stringify({ amount: loan.loan_amount }), 'admin']);
      } catch (e) { console.error('audit:', e.message); }
      return NextResponse.json({ success: true });
    }

    if (action === 'write_off') {
      if (loan.status !== 'ACTIVE') {
        return NextResponse.json({ error: `Cannot write off a loan in ${loan.status} state` }, { status: 400 });
      }
      await pool.execute(
        `UPDATE loans SET status = 'WRITTEN_OFF', end_date = CURDATE() WHERE id = ?`,
        [id]
      );
      try {
        const [[emp]] = await pool.execute('SELECT company_id FROM employees WHERE id = ?', [loan.employee_id]);
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), emp?.company_id, 'LOAN_WRITTEN_OFF', 'loan', id, JSON.stringify({ outstanding: loan.balance_outstanding }), 'admin']);
      } catch (e) { console.error('audit:', e.message); }
      return NextResponse.json({ success: true });
    }

    if (action === 'reactivate') {
      if (loan.status === 'ACTIVE') {
        return NextResponse.json({ error: 'Loan is already active' }, { status: 400 });
      }
      await pool.execute(`UPDATE loans SET status = 'ACTIVE', end_date = NULL WHERE id = ?`, [id]);
      return NextResponse.json({ success: true });
    }

    // Generic field updates (edit loan details — only allowed for ACTIVE loans)
    if (loan.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Can only edit active loans' }, { status: 400 });
    }

    const updates = [];
    const values = [];

    if (body.loan_type !== undefined) { updates.push('loan_type = ?'); values.push(body.loan_type); }
    if (body.emi_amount !== undefined && body.emi_amount > 0) {
      const newEmi = parseFloat(body.emi_amount);
      const newTotal = Math.ceil(loan.balance_outstanding / newEmi);
      updates.push('emi_amount = ?', 'total_emis = ?');
      values.push(newEmi, loan.paid_emis + newTotal);
    }
    if (body.balance_outstanding !== undefined) {
      updates.push('balance_outstanding = ?');
      values.push(parseFloat(body.balance_outstanding));
    }
    if (body.paid_emis !== undefined) {
      updates.push('paid_emis = ?');
      values.push(parseInt(body.paid_emis));
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    values.push(id);
    await pool.execute(`UPDATE loans SET ${updates.join(', ')} WHERE id = ?`, values);

    const [[updated]] = await pool.execute('SELECT * FROM loans WHERE id = ?', [id]);
    return NextResponse.json({ success: true, loan: updated });
  } catch (error) {
    console.error('PUT /api/loans:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a loan (only if CLOSED or WRITTEN_OFF, or force=true for ACTIVE)
export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const force = searchParams.get('force') === 'true';

    if (!id) return NextResponse.json({ error: 'Loan id is required' }, { status: 400 });

    const [[loan]] = await pool.execute('SELECT * FROM loans WHERE id = ?', [id]);
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    if (loan.status === 'ACTIVE' && !force) {
      return NextResponse.json({
        error: 'Cannot delete an active loan. Close or write-off first, or use force=true.',
      }, { status: 409 });
    }

    await pool.execute('DELETE FROM loans WHERE id = ?', [id]);

    try {
      const [[emp]] = await pool.execute('SELECT company_id FROM employees WHERE id = ?', [loan.employee_id]);
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), emp?.company_id, 'LOAN_DELETED', 'loan', id, JSON.stringify({ type: loan.loan_type, amount: loan.loan_amount }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/loans:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
