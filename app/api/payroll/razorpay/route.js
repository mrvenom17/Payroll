import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
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

    // Validate state
    const [drafts] = await pool.execute(`SELECT * FROM payroll WHERE month = ? AND year = ? AND status = 'APPROVED'`, [month, year]);
    if(drafts.length === 0) {
      return NextResponse.json({ error: 'No approved payroll records found for payout' }, { status: 400 });
    }

    // Simulate Network Delay & Processing
    await new Promise(resolve => setTimeout(resolve, 800));

    // Update to PAID
    await pool.execute(`
      UPDATE payroll
      SET status = 'PAID', paid_at = NOW()
      WHERE month = ? AND year = ? AND status = 'APPROVED'
    `, [month, year]);

    const totalAmount = drafts.reduce((sum, row) => sum + row.net_salary, 0);

    // Audit Log
    const auditId = 'log_' + crypto.randomBytes(6).toString('hex');
    await pool.execute(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, details)
      VALUES (?, 'PAYROLL_PAID_RAZORPAY', 'PAYROLL_BATCH', ?, ?)
    `, [
      auditId,
      `${month}-${year}`,
      JSON.stringify({ method: 'RazorpayX', amount: totalAmount, count: drafts.length })
    ]);

    // Push Notification
    const notifId = 'notif_' + crypto.randomBytes(6).toString('hex');
    const msg = `₹${totalAmount.toLocaleString('en-IN')} disbursed successfully via RazorpayX to ${drafts.length} employees.`;
    await pool.execute(`
      INSERT INTO notifications (id, message, type)
      VALUES (?, ?, 'success')
    `, [notifId, msg]);

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
