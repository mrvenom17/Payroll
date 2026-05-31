import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const { month, year, company = '' } = await request.json();
    const pool = getPool();

    // Verify keys
    const getSetting = async (key) => {
      const [[row]] = await pool.execute(`SELECT setting_value FROM system_settings WHERE setting_key = ?`, [key]);
      return row ? row.setting_value : null;
    };

    const rzp_key = await getSetting('razorpay_key_id');
    const rzp_secret = await getSetting('razorpay_key_secret');

    if (!rzp_key || !rzp_secret) {
      return NextResponse.json({ error: 'Razorpay API keys are missing. Please configure them in Settings > Integrations.' }, { status: 400 });
    }

    // In a real production system, this is where we would call RazorpayX API:
    // const rzp = new Razorpay({ key_id: '...', key_secret: '...' });
    // await rzp.payouts.create({ account_number, amount, purpose: 'SALARY' });

    // Validate state — scope to the active company so cross-tenant rows aren't disbursed.
    const [drafts] = await pool.execute(
      `SELECT p.* FROM payroll p
         JOIN employees e ON e.id = p.employee_id
        WHERE p.month = ? AND p.year = ? AND p.status = 'APPROVED' AND e.company_id = ?`,
      [month, year, company]
    );
    if(drafts.length === 0) {
      return NextResponse.json({ error: 'No approved payroll records found for payout' }, { status: 400 });
    }

    // Simulate Network Delay & Processing
    await new Promise(resolve => setTimeout(resolve, 800));

    const today = new Date().toISOString().split('T')[0];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of drafts) {
        await conn.execute(
          `UPDATE payroll SET status = 'PAID', payment_mode = 'RAZORPAY', paid_at = NOW(), updated_at = NOW() WHERE id = ?`,
          [row.id]
        );
        await conn.execute(
          `INSERT INTO payments (id, payment_kind, reference_id, employee_id, company_id, amount, payment_mode, payment_date, status)
           VALUES (?, 'PAYROLL', ?, ?, ?, ?, 'RAZORPAY', ?, 'COMPLETED')`,
          [generateId(), row.id, row.employee_id, company, row.net_salary, today]
        );

        // Amortize active loans by the EMI deducted in this payslip.
        const loanDeducted = Number(row.loan_deduction) || 0;
        if (loanDeducted > 0) {
          const [activeLoans] = await conn.execute(
            `SELECT id, balance_outstanding, paid_emis FROM loans
              WHERE employee_id = ? AND status = 'ACTIVE'
              ORDER BY start_date ASC, created_at ASC`,
            [row.employee_id]
          );
          let remaining = loanDeducted;
          for (const ln of activeLoans) {
            if (remaining <= 0) break;
            const apply = Math.min(remaining, Number(ln.balance_outstanding) || 0);
            if (apply <= 0) continue;
            const newBal = Math.max(Number(ln.balance_outstanding) - apply, 0);
            const newPaid = (Number(ln.paid_emis) || 0) + 1;
            const closed = newBal <= 0.5;
            await conn.execute(
              `UPDATE loans
                  SET balance_outstanding = ?,
                      paid_emis = ?,
                      status = ${closed ? "'CLOSED'" : "status"},
                      end_date = ${closed ? "CURDATE()" : "end_date"}
                WHERE id = ?`,
              [closed ? 0 : newBal, newPaid, ln.id]
            );
            remaining -= apply;
          }
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const totalAmount = drafts.reduce((sum, row) => sum + row.net_salary, 0);

    // Audit Log
    const auditId = 'log_' + crypto.randomBytes(6).toString('hex');
    await pool.execute(`
      INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by)
      VALUES (?, ?, 'PAYROLL_PAID_RAZORPAY', 'PAYROLL_BATCH', ?, ?, 'system')
    `, [
      auditId,
      company,
      `${month}-${year}`,
      JSON.stringify({ method: 'RazorpayX', amount: totalAmount, count: drafts.length })
    ]);

    // Push Notification
    const notifId = 'notif_' + crypto.randomBytes(6).toString('hex');
    const msg = `₹${totalAmount.toLocaleString('en-IN')} disbursed successfully via RazorpayX to ${drafts.length} employees.`;
    await pool.execute(`
      INSERT INTO notifications (id, company_id, message, type)
      VALUES (?, ?, ?, 'success')
    `, [notifId, company, msg]);

    return NextResponse.json({ success: true, processedCount: drafts.length, amount: totalAmount });
  } catch (error) {
    console.error('Razorpay simulation error', error);

    // Push Error Notification
    try {
      const pool = getPool();
      const notifId = 'notif_' + crypto.randomBytes(6).toString('hex');
      await pool.execute(`
        INSERT INTO notifications (id, message, type)
        VALUES (?, ?, 'error')
      `, [notifId, `Failed to disburse salary via Razorpay: ${error.message}`]);
    } catch (e) { /* swallow */ }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
