import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';

    const [settlements] = await pool.execute(`
      SELECT f.*, e.full_name, e.employee_code, e.designation, e.joining_date,
             e.bank_name, e.account_number, e.ifsc_code,
             d.name as department_name
      FROM fnf_settlements f
      JOIN employees e ON f.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ?
      ORDER BY f.created_at DESC
    `, [companyId]);

    // Attach payments per settlement
    const settlementIds = settlements.map(s => s.id);
    let paymentsBySettlement = {};
    if (settlementIds.length > 0) {
      const placeholders = settlementIds.map(() => '?').join(',');
      const [payments] = await pool.execute(
        `SELECT * FROM payments WHERE payment_kind = 'FNF' AND reference_id IN (${placeholders}) ORDER BY payment_date DESC`,
        settlementIds
      );
      payments.forEach(p => {
        (paymentsBySettlement[p.reference_id] ||= []).push(p);
      });
    }
    settlements.forEach(s => { s.payments = paymentsBySettlement[s.id] || []; });

    // Get exited employees without FNF
    const [exitedWithoutFnf] = await pool.execute(`
      SELECT e.id, e.full_name, e.employee_code, e.designation, e.exit_date, e.exit_reason, e.joining_date
      FROM employees e
      WHERE e.company_id = ? AND e.is_active = 0
      AND e.id NOT IN (SELECT employee_id FROM fnf_settlements)
      ORDER BY e.exit_date DESC
    `, [companyId]);

    return NextResponse.json({ settlements, exitedWithoutFnf });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();

    const [[emp]] = await pool.execute(`
      SELECT e.*, ss.ctc_monthly, ss.ctc_annual
      FROM employees e
      LEFT JOIN salary_structures ss ON ss.employee_id = e.id
      WHERE e.id = ?
    `, [body.employee_id]);

    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    // Calculate components
    const [components] = await pool.execute(`
      SELECT ssd.monthly_amount, sc.code
      FROM salary_structure_details ssd
      JOIN salary_components sc ON sc.id = ssd.component_id
      JOIN salary_structures ss ON ss.id = ssd.salary_structure_id
      WHERE ss.employee_id = ?
    `, [body.employee_id]);

    const basicMonthly = components.find(c => c.code === 'BASIC')?.monthly_amount || 0;

    // Calculate gratuity
    let gratuity = 0;
    if (emp.joining_date && body.last_working_date) {
      const joining = new Date(emp.joining_date);
      const exit = new Date(body.last_working_date);
      const years = (exit - joining) / (1000 * 60 * 60 * 24 * 365.25);
      if (years >= 5) {
        gratuity = Math.round((basicMonthly * 15 * Math.round(years)) / 26);
      }
    }

    // Calculate leave encashment (EL balance × daily rate)
    const [[lastAtt]] = await pool.execute(`
      SELECT el_balance FROM attendance WHERE employee_id = ?
      ORDER BY year DESC, month DESC LIMIT 1
    `, [body.employee_id]);
    const elBalance = lastAtt?.el_balance || 0;
    const dailyRate = Math.round((emp.ctc_monthly || 0) / 26);
    const leaveEncashment = Math.round(elBalance * dailyRate);

    // Pending loans
    const [[pendingLoans]] = await pool.execute(`
      SELECT SUM(balance_outstanding) as total FROM loans
      WHERE employee_id = ? AND status = 'ACTIVE'
    `, [body.employee_id]);
    const pendingDeductions = (pendingLoans?.total || 0) + (body.pending_deductions || 0);

    const noticePeriodRecovery = body.notice_period_recovery || 0;
    const bonusPayable = body.bonus_payable || 0;
    const assetRecoveryAmount = body.asset_recovery_amount || 0;

    const finalAmount = leaveEncashment + gratuity + bonusPayable - noticePeriodRecovery - pendingDeductions - assetRecoveryAmount;

    const id = generateId();
    await pool.execute(`
      INSERT INTO fnf_settlements (id, employee_id, last_working_date, notice_period_days, notice_period_recovery,
        leave_encashment, gratuity, bonus_payable, pending_deductions, asset_recovery, asset_recovery_amount,
        noc_status, final_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')
    `, [id, body.employee_id, body.last_working_date, body.notice_period_days || 30,
      noticePeriodRecovery, leaveEncashment, gratuity, bonusPayable, pendingDeductions,
      body.asset_recovery ? 1 : 0, assetRecoveryAmount, body.noc_status || 'PENDING', finalAmount]);

    const [[settlement]] = await pool.execute('SELECT * FROM fnf_settlements WHERE id = ?', [id]);
    return NextResponse.json({ settlement, details: { basicMonthly, elBalance, dailyRate } }, { status: 201 });
  } catch (error) {
    console.error('FNF error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — clear settlements
//   ?id=<settlement_id>  → delete one
//   ?company=<id>&scope=all  → delete every settlement under company (clears history)
export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const scope = searchParams.get('scope');
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || '';

    if (id) {
      const [[s]] = await pool.execute('SELECT employee_id FROM fnf_settlements WHERE id = ?', [id]);
      if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(`DELETE FROM payments WHERE payment_kind = 'FNF' AND reference_id = ?`, [id]);
        await conn.execute('DELETE FROM fnf_settlements WHERE id = ?', [id]);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      return NextResponse.json({ success: true, deleted: 1 });
    }

    if (scope === 'all') {
      const [rows] = await pool.execute(
        `SELECT f.id FROM fnf_settlements f JOIN employees e ON e.id = f.employee_id WHERE e.company_id = ?`,
        [companyId]
      );
      const ids = rows.map(r => r.id);

      if (ids.length > 0) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const ph = ids.map(() => '?').join(',');
          await conn.execute(`DELETE FROM payments WHERE payment_kind = 'FNF' AND reference_id IN (${ph})`, ids);
          await conn.execute(`DELETE FROM fnf_settlements WHERE id IN (${ph})`, ids);
          await conn.commit();
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }
      }

      try {
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), companyId, 'FNF_CLEARED_ALL', 'fnf_settlement', null, JSON.stringify({ count: ids.length }), 'admin']);
      } catch (e) { console.error('audit:', e.message); }
      return NextResponse.json({ success: true, deleted: ids.length });
    }

    return NextResponse.json({ error: 'Provide id=<settlement_id> or scope=all&company=<id>' }, { status: 400 });
  } catch (error) {
    console.error('FNF DELETE:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — actions: 'approve' | 'pay' | 'cancel'
export async function PUT(request) {
  try {
    const pool = getPool();
    const body = await request.json();
    const { id, action } = body;
    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    const [[settlement]] = await pool.execute('SELECT * FROM fnf_settlements WHERE id = ?', [id]);
    if (!settlement) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });

    const [[emp]] = await pool.execute('SELECT company_id FROM employees WHERE id = ?', [settlement.employee_id]);

    if (action === 'approve') {
      if (settlement.status !== 'DRAFT') {
        return NextResponse.json({ error: `Cannot approve settlement in ${settlement.status} state` }, { status: 400 });
      }
      await pool.execute(`UPDATE fnf_settlements SET status = 'APPROVED', updated_at = NOW() WHERE id = ?`, [id]);
      try {
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), emp?.company_id, 'FNF_APPROVED', 'fnf_settlement', id, JSON.stringify({ amount: settlement.final_amount }), 'admin']);
      } catch (e) { console.error('audit:', e.message); }
      return NextResponse.json({ success: true });
    }

    if (action === 'pay') {
      if (settlement.status !== 'APPROVED') {
        return NextResponse.json({ error: `Settlement must be APPROVED before payment (current: ${settlement.status})` }, { status: 400 });
      }
      const {
        payment_mode = 'NEFT', payment_date, payment_reference, payment_bank,
        cheque_number, cheque_bank, cheque_date, utr_number, from_bank_account,
        payment_notes,
      } = body;

      if (!payment_date) return NextResponse.json({ error: 'payment_date is required' }, { status: 400 });

      const mode = String(payment_mode).toUpperCase();
      if (!['NEFT','CHEQUE','CASH','UPI','IMPS','RTGS','RAZORPAY'].includes(mode)) {
        return NextResponse.json({ error: 'Unsupported payment_mode' }, { status: 400 });
      }
      if (mode === 'CHEQUE' && !cheque_number) {
        return NextResponse.json({ error: 'cheque_number is required for CHEQUE payments' }, { status: 400 });
      }
      if ((mode === 'NEFT' || mode === 'IMPS' || mode === 'RTGS') && !(utr_number || payment_reference)) {
        return NextResponse.json({ error: `${mode} requires utr_number / payment_reference` }, { status: 400 });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        await conn.execute(`
          UPDATE fnf_settlements
          SET status = 'PAID',
              payment_mode = ?,
              payment_reference = ?,
              payment_bank = ?,
              payment_date = ?,
              payment_notes = ?,
              paid_at = NOW(),
              updated_at = NOW()
          WHERE id = ?
        `, [
          mode,
          payment_reference || utr_number || cheque_number || null,
          payment_bank || cheque_bank || from_bank_account || null,
          payment_date,
          payment_notes || null,
          id
        ]);

        await conn.execute(`
          INSERT INTO payments (id, payment_kind, reference_id, employee_id, company_id, amount, payment_mode,
            payment_date, utr_number, from_bank_account, cheque_number, cheque_bank, cheque_date, notes, status)
          VALUES (?, 'FNF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
        `, [
          generateId(), id, settlement.employee_id, emp?.company_id,
          settlement.final_amount, mode, payment_date,
          utr_number || (mode !== 'CHEQUE' ? payment_reference : null) || null,
          from_bank_account || null,
          cheque_number || null, cheque_bank || null, cheque_date || null,
          payment_notes || null,
        ]);

        if (mode === 'CHEQUE' && cheque_number) {
          const next = String(parseInt(cheque_number, 10) + 1).padStart(cheque_number.length, '0');
          await conn.execute(`
            INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('next_cheque_number', ?, NOW())
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()
          `, [next]);
        }

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

      try {
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), emp?.company_id, 'FNF_PAID', 'fnf_settlement', id,
            JSON.stringify({ mode, amount: settlement.final_amount, ref: payment_reference || utr_number || cheque_number }), 'admin']);
      } catch (e) { console.error('audit:', e.message); }

      return NextResponse.json({ success: true });
    }

    if (action === 'cancel') {
      await pool.execute(`UPDATE fnf_settlements SET status = 'DRAFT', updated_at = NOW() WHERE id = ?`, [id]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('FNF PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
