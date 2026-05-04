import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const pool = getPool();
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
      medical,
      special_allowance,
      gross_earnings
    } = body;

    // Fetch the current record
    const [[record]] = await pool.execute(`SELECT * FROM payroll WHERE id = ?`, [id]);
    
    if (!record) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 });
    }

    if (record.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only draft payrolls can be edited' }, { status: 400 });
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
      medical: safeNumber(medical, record.medical),
      special_allowance: safeNumber(special_allowance, record.special_allowance),
      gross_earnings: safeNumber(gross_earnings, record.gross_earnings),
      pf_deduction: safeNumber(pf_deduction, record.pf_deduction),
      esic_deduction: safeNumber(esic_deduction, record.esic_deduction),
      pt_deduction: safeNumber(pt_deduction, record.pt_deduction),
      tds_deduction: safeNumber(tds_deduction, record.tds_deduction),
      loan_deduction: safeNumber(loan_deduction, record.loan_deduction),
      advance_deduction: safeNumber(advance_deduction, record.advance_deduction),
      other_deductions: safeNumber(other_deductions, record.other_deductions),
    };

    // Calculate total deductions
    const total_deductions = 
      update.pf_deduction + 
      update.esic_deduction + 
      update.pt_deduction + 
      update.tds_deduction + 
      update.loan_deduction + 
      update.advance_deduction + 
      update.other_deductions;

    // Calculate net salary
    const net_salary = Math.max(update.gross_earnings - total_deductions, 0);

    await pool.execute(`
      UPDATE payroll 
      SET 
        total_working_days = ?, paid_days = ?,
        basic_salary = ?, hra = ?, conveyance = ?, medical = ?, special_allowance = ?, gross_earnings = ?,
        pf_deduction = ?, esic_deduction = ?, pt_deduction = ?, tds_deduction = ?, 
        loan_deduction = ?, advance_deduction = ?, other_deductions = ?, 
        total_deductions = ?, net_salary = ?, updated_at = NOW()
      WHERE id = ?
    `, [
      update.total_working_days, update.paid_days,
      update.basic_salary, update.hra, update.conveyance, update.medical, update.special_allowance, update.gross_earnings,
      update.pf_deduction, update.esic_deduction, update.pt_deduction, update.tds_deduction,
      update.loan_deduction, update.advance_deduction, update.other_deductions,
      total_deductions, net_salary, id
    ]);

    return NextResponse.json({ success: true, total_deductions, net_salary });
  } catch (error) {
    console.error('Edit payroll error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
