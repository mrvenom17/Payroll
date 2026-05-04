import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const pool = getPool();
    const id = params.id;
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

    // Use updated values or fall back to existing
    const update = {
      total_working_days: total_working_days !== undefined ? Number(total_working_days) : record.total_working_days,
      paid_days: paid_days !== undefined ? Number(paid_days) : record.paid_days,
      basic_salary: basic_salary !== undefined ? Number(basic_salary) : record.basic_salary,
      hra: hra !== undefined ? Number(hra) : record.hra,
      conveyance: conveyance !== undefined ? Number(conveyance) : record.conveyance,
      medical: medical !== undefined ? Number(medical) : record.medical,
      special_allowance: special_allowance !== undefined ? Number(special_allowance) : record.special_allowance,
      gross_earnings: gross_earnings !== undefined ? Number(gross_earnings) : record.gross_earnings,
      pf_deduction: pf_deduction !== undefined ? Number(pf_deduction) : record.pf_deduction,
      esic_deduction: esic_deduction !== undefined ? Number(esic_deduction) : record.esic_deduction,
      pt_deduction: pt_deduction !== undefined ? Number(pt_deduction) : record.pt_deduction,
      tds_deduction: tds_deduction !== undefined ? Number(tds_deduction) : record.tds_deduction,
      loan_deduction: loan_deduction !== undefined ? Number(loan_deduction) : record.loan_deduction,
      advance_deduction: advance_deduction !== undefined ? Number(advance_deduction) : record.advance_deduction,
      other_deductions: other_deductions !== undefined ? Number(other_deductions) : record.other_deductions,
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
