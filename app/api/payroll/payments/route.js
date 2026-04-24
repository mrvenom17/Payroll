import { NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/db';

// GET — list payments for a payroll period
export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';
    const month = parseInt(searchParams.get('month'));
    const year = parseInt(searchParams.get('year'));

    const payRows = db.prepare(
      `SELECT id FROM payroll WHERE month = ? AND year = ? AND employee_id IN (SELECT id FROM employees WHERE company_id = ?)`
    ).all(month, year, companyId);
    if (payRows.length === 0) return NextResponse.json({ payments: [] });

    const ids = payRows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const payments = db.prepare(
      `SELECT p.*, e.full_name, e.employee_code FROM payments p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.payment_kind = 'PAYROLL' AND p.reference_id IN (${placeholders})
       ORDER BY p.payment_date DESC`
    ).all(...ids);

    return NextResponse.json({ payments });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — record payments for a list of approved payroll rows
// Body: { month, year, company_id, payments: [{ payroll_id, payment_mode, payment_date, utr_number, cheque_number, cheque_bank, cheque_date, from_bank_account, notes }, ...] }
export async function POST(request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { month, year, company_id, payments } = body;
    const companyId = company_id || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';

    if (!Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: 'payments array required' }, { status: 400 });
    }

    const txn = db.transaction(() => {
      let recorded = 0;
      let bumpCheque = null;

      for (const p of payments) {
        const { payroll_id } = p;
        const mode = String(p.payment_mode || 'NEFT').toUpperCase();
        if (!['NEFT','CHEQUE','CASH','UPI','RAZORPAY','IMPS','RTGS'].includes(mode)) continue;

        const row = db.prepare(`SELECT * FROM payroll WHERE id = ?`).get(payroll_id);
        if (!row || row.status !== 'APPROVED') continue;

        if (mode === 'CHEQUE' && !p.cheque_number) {
          throw new Error(`Cheque number required for payroll ${payroll_id}`);
        }
        if (['NEFT','IMPS','RTGS'].includes(mode) && !(p.utr_number || p.payment_reference)) {
          throw new Error(`UTR required for ${mode} payroll ${payroll_id}`);
        }

        db.prepare(`
          INSERT INTO payments (id, payment_kind, reference_id, employee_id, company_id, amount, payment_mode,
            payment_date, utr_number, from_bank_account, cheque_number, cheque_bank, cheque_date, notes, status)
          VALUES (?, 'PAYROLL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
        `).run(
          generateId(), payroll_id, row.employee_id, companyId,
          row.net_salary, mode, p.payment_date || new Date().toISOString().split('T')[0],
          p.utr_number || null, p.from_bank_account || null,
          p.cheque_number || null, p.cheque_bank || null, p.cheque_date || null,
          p.notes || null,
        );

        db.prepare(`
          UPDATE payroll
          SET status = 'PAID',
              payment_mode = ?,
              payment_reference = ?,
              paid_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `).run(mode, p.utr_number || p.cheque_number || null, payroll_id);

        if (mode === 'CHEQUE' && p.cheque_number) {
          const n = parseInt(p.cheque_number, 10);
          if (!isNaN(n)) bumpCheque = String(n + 1).padStart(p.cheque_number.length, '0');
        }
        recorded++;
      }

      if (bumpCheque) {
        db.prepare(`INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('next_cheque_number', ?, datetime('now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = datetime('now')`).run(bumpCheque);
      }

      return recorded;
    });

    const recorded = txn();

    try {
      db.prepare(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(generateId(), companyId, 'PAYROLL_PAYMENTS_RECORDED', 'payroll', `${month}-${year}`,
          JSON.stringify({ count: recorded, modes: [...new Set(payments.map(p => p.payment_mode))] }), 'admin');
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true, recorded });
  } catch (error) {
    console.error('Payroll payments error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
