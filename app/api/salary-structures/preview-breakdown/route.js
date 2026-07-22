import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getBreakdownTemplate, computeBreakdown } from '@/lib/salaryBreakdown';

// GET — compute the template breakdown for an ad-hoc CTC (no DB write).
// Used by the salary-structure editor's "Auto Break-down" button so a CTC can
// be split without hand-entering every component.
// Query: ?ctc_annual=NNN  (or ?ctc_monthly=NNN)
export async function GET(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);

    let ctcAnnual = Number(searchParams.get('ctc_annual'));
    const ctcMonthly = Number(searchParams.get('ctc_monthly'));
    if ((!ctcAnnual || ctcAnnual <= 0) && ctcMonthly > 0) {
      ctcAnnual = Math.round(ctcMonthly * 12);
    }
    if (!ctcAnnual || ctcAnnual <= 0) {
      return NextResponse.json({ error: 'A positive ctc_annual (or ctc_monthly) is required' }, { status: 400 });
    }

    const template = await getBreakdownTemplate(pool);

    // Component names for display (fall back to code if a component is missing).
    const [comps] = await pool.execute(`SELECT code, name FROM salary_components WHERE type = 'EARNING'`);
    const codeToName = Object.fromEntries(comps.map(c => [c.code, c.name]));

    const components = computeBreakdown(ctcAnnual, template).map(c => ({
      code: c.code,
      name: codeToName[c.code] || c.code,
      monthly: c.monthly,
      annual: c.monthly * 12,
    }));

    return NextResponse.json({
      ctc_annual: ctcAnnual,
      ctc_monthly: Math.round(ctcAnnual / 12),
      template,
      components,
    });
  } catch (e) {
    console.error('GET /api/salary-structures/preview-breakdown:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
