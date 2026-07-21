import { NextResponse } from 'next/server';
import { getSecureCompanyId } from '@/lib/authHelper';
import { getPool } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const pool = getPool();
    const companyId = await getSecureCompanyId(request);
    const { id } = await params;
    const body = await request.json();
    
    // We expect the body to contain the updated deductions/earnings
    // At minimum, if we are editing deductions:
    const { 
      total_working_days,
      paid_days,
      pf_deduction, 
      esic_deduction, 
      pt_deduction, 
      tds_deduction, 
      loan_deduction, 
      advance_deduction, 
      other_deductions,
      basic_salary,
      hra,
      conveyance,
      petrol_allowance,
      medical,
      special_allowance,
      overtime,
      gross_earnings,
      employer_pf,
      employer_esic
    } = body;

    // Fetch the current record
    const [[record]] = await pool.execute(`
      SELECT p.*, e.company_id 
      FROM payroll p 
      JOIN employees e ON e.id = p.employee_id 
      WHERE p.id = ?`, [id]);
    
    if (!record || record.company_id !== companyId) {
      return NextResponse.json({ error: 'Payroll record not found or unauthorized' }, { status: 404 });
    }

    const safeNumber = (val, fallback) => {
      if (val === undefined || val === null || val === '') return fallback;
      const num = Number(val);
      return isNaN(num) ? fallback : num;
    };

    // Use updated values or fall back to existing
    const update = {
      total_working_days: safeNumber(total_working_days, record.total_working_days),
      paid_days: safeNumber(paid_days, record.paid_days),
      basic_salary: safeNumber(basic_salary, record.basic_salary),
      hra: safeNumber(hra, record.hra),
      conveyance: safeNumber(conveyance, record.conveyance),
      petrol_allowance: safeNumber(petrol_allowance, record.petrol_allowance),
      medical: safeNumber(medical, record.medical),
      special_allowance: safeNumber(special_allowance, record.special_allowance),
      overtime: safeNumber(overtime, record.overtime),
      pf_deduction: safeNumber(pf_deduction, record.pf_deduction),
      esic_deduction: safeNumber(esic_deduction, record.esic_deduction),
      pt_deduction: safeNumber(pt_deduction, record.pt_deduction),
      tds_deduction: safeNumber(tds_deduction, record.tds_deduction),
      loan_deduction: safeNumber(loan_deduction, record.loan_deduction),
      advance_deduction: safeNumber(advance_deduction, record.advance_deduction),
      other_deductions: safeNumber(other_deductions, record.other_deductions),
      employer_pf: safeNumber(employer_pf, record.employer_pf),
      employer_esic: safeNumber(employer_esic, record.employer_esic),
    };

    // Recompute gross_earnings from earnings line items so totals never drift from displayed values.
    const grossEarnings =
      (update.basic_salary || 0) +
      (update.hra || 0) +
      (update.conveyance || 0) +
      (update.petrol_allowance || 0) +
      (update.medical || 0) +
      (update.special_allowance || 0) +
      (update.overtime || 0);
    update.gross_earnings = grossEarnings;

    const total_deductions =
      update.pf_deduction +
      update.esic_deduction +
      update.pt_deduction +
      update.tds_deduction +
      update.loan_deduction +
      update.advance_deduction +
      update.other_deductions;

    // CTC-inclusive: employer PF/ESIC are baked into gross, so subtract them from net.
    const net_salary = Math.max(
      grossEarnings - total_deductions - update.employer_pf - update.employer_esic,
      0
    );

    await pool.execute(`
      UPDATE payroll
      SET
        total_working_days = ?, paid_days = ?,
        basic_salary = ?, hra = ?, conveyance = ?, petrol_allowance = ?, medical = ?, special_allowance = ?, overtime = ?, gross_earnings = ?,
        pf_deduction = ?, esic_deduction = ?, pt_deduction = ?, tds_deduction = ?,
        loan_deduction = ?, advance_deduction = ?, other_deductions = ?,
        employer_pf = ?, employer_esic = ?,
        total_deductions = ?, net_salary = ?, updated_at = NOW()
      WHERE id = ?
    `, [
      update.total_working_days, update.paid_days,
      update.basic_salary, update.hra, update.conveyance, update.petrol_allowance, update.medical, update.special_allowance, update.overtime, update.gross_earnings,
      update.pf_deduction, update.esic_deduction, update.pt_deduction, update.tds_deduction,
      update.loan_deduction, update.advance_deduction, update.other_deductions,
      update.employer_pf, update.employer_esic,
      total_deductions, net_salary, id
    ]);

    try {
      // Find company_id to associate with audit log
      const [[empData]] = await pool.execute(`SELECT company_id FROM employees WHERE id = ?`, [record.employee_id]);
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [require('@/lib/db').generateId(), empData.company_id, 'PAYROLL_UPDATED', 'payroll', id, JSON.stringify({ old_net: record.net_salary, new_net: net_salary }), 'admin']);
    } catch (e) { console.error('audit log error:', e.message); }

    return NextResponse.json({ success: true, total_deductions, net_salary });
  } catch (error) {
    console.error('Edit payroll error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
