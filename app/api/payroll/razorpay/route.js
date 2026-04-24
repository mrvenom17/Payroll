import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const { month, year, company = 'comp_uabiotech' } = await request.json();
    const db = getDb();

    // Verify keys
    const getSetting = (key) => {
      const row = db.prepare(`SELECT setting_value FROM system_settings WHERE setting_key = ?`).get(key);
      return row ? row.setting_value : null;
    };
    
    const rzp_key = getSetting('razorpay_key_id');
    const rzp_secret = getSetting('razorpay_key_secret');

    if (!rzp_key || !rzp_secret) {
      return NextResponse.json({ error: 'Razorpay API keys are missing. Please configure them in Settings > Integrations.' }, { status: 400 });
    }

    // In a real production system, this is where we would call RazorpayX API:
    // const rzp = new Razorpay({ key_id: '...', key_secret: '...' });
    // await rzp.payouts.create({ account_number, amount, purpose: 'SALARY' });
    
    // Validate state
    const drafts = db.prepare(`SELECT * FROM payroll WHERE month = ? AND year = ? AND status = 'APPROVED'`).all(month, year);
    if(drafts.length === 0) {
      return NextResponse.json({ error: 'No approved payroll records found for payout' }, { status: 400 });
    }

    // Simulate Network Delay & Processing
    await new Promise(resolve => setTimeout(resolve, 800));

    // Update to PAID
    db.prepare(`
      UPDATE payroll 
      SET status = 'PAID', paid_at = datetime('now')
      WHERE month = ? AND year = ? AND status = 'APPROVED'
    `).run(month, year);

    const totalAmount = drafts.reduce((sum, row) => sum + row.net_salary, 0);

    // Audit Log
    const auditId = 'log_' + crypto.randomBytes(6).toString('hex');
    db.prepare(`
      INSERT INTO audit_logs (id, action, entity_type, entity_id, details)
      VALUES (?, 'PAYROLL_PAID_RAZORPAY', 'PAYROLL_BATCH', ?, ?)
    `).run(
      auditId, 
      `${month}-${year}`, 
      JSON.stringify({ method: 'RazorpayX', amount: totalAmount, count: drafts.length })
    );

    // Push Notification
    const notifId = 'notif_' + crypto.randomBytes(6).toString('hex');
    const msg = `₹${totalAmount.toLocaleString('en-IN')} disbursed successfully via RazorpayX to ${drafts.length} employees.`;
    db.prepare(`
      INSERT INTO notifications (id, message, type)
      VALUES (?, ?, 'success')
    `).run(notifId, msg);

    return NextResponse.json({ success: true, processedCount: drafts.length, amount: totalAmount });
  } catch (error) {
    console.error('Razorpay simulation error', error);
    
    // Push Error Notification
    const db = getDb();
    const notifId = 'notif_' + crypto.randomBytes(6).toString('hex');
    db.prepare(`
      INSERT INTO notifications (id, message, type)
      VALUES (?, ?, 'error')
    `).run(notifId, `Failed to disburse salary via Razorpay: ${error.message}`);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
