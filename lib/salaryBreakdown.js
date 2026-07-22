// Shared salary auto-breakdown logic.
// Single source of truth used by:
//   - employee creation (app/api/employees/route.js)
//   - bulk auto-breakdown tool (app/api/salary-structures/auto-breakdown/route.js)
//
// Given an annual CTC and the company template, it splits the monthly CTC into
// the fixed statutory components. Special Allowance is the balancing figure.

const EARNING_ORDER = ['BASIC', 'HRA', 'CONV', 'PETROL', 'MED', 'SPL'];

// Read the template percentages/amounts from system_settings (with sane fallbacks).
export async function getBreakdownTemplate(pool) {
  const setting = async (key, fallback) => {
    const [[row]] = await pool.execute(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      [key]
    );
    return row ? Number(row.setting_value) : fallback;
  };
  return {
    basic_pct: await setting('template_basic_pct', 50),
    hra_pct: await setting('template_hra_pct', 40),
    conv: await setting('template_conv_amount', 1600),
    petrol: await setting('template_petrol_amount', 0),
    med: await setting('template_med_amount', 1250),
  };
}

// Compute the component breakdown for a given annual CTC.
// Returns [{ code, monthly }] in display order. PETROL is omitted when 0.
export function computeBreakdown(ctcAnnual, template) {
  const monthly = Math.round(Number(ctcAnnual) / 12);
  const basic = Math.round(monthly * (template.basic_pct / 100));
  const hra = Math.round(basic * (template.hra_pct / 100));
  const conv = Math.round(template.conv);
  const petrol = Math.round(template.petrol);
  const med = Math.round(template.med);
  const special = Math.max(monthly - basic - hra - conv - petrol - med, 0);

  return [
    { code: 'BASIC', monthly: basic },
    { code: 'HRA', monthly: hra },
    { code: 'CONV', monthly: conv },
    ...(petrol > 0 ? [{ code: 'PETROL', monthly: petrol }] : []),
    { code: 'MED', monthly: med },
    { code: 'SPL', monthly: special },
  ];
}

// Normalize a component list into a comparable { CODE: monthly } map (integers).
export function toAmountMap(components) {
  const map = {};
  for (const c of components) {
    map[c.code] = Math.round(Number(c.monthly ?? c.monthly_amount) || 0);
  }
  return map;
}

// True when two breakdowns are identical (same codes, same rounded amounts).
export function breakdownsEqual(a, b) {
  const ma = toAmountMap(a);
  const mb = toAmountMap(b);
  const keys = new Set([...Object.keys(ma), ...Object.keys(mb)]);
  for (const k of keys) {
    if ((ma[k] || 0) !== (mb[k] || 0)) return false;
  }
  return true;
}

export { EARNING_ORDER };
