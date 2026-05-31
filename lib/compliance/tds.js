/**
 * TDS (Income Tax) Calculator — India, FY 2025-26 (AY 2026-27)
 *
 * Slabs (annual taxable income after deductions):
 *
 * NEW REGIME (default)               OLD REGIME
 *   0 – 4L      0%                     0 – 2.5L    0%
 *   4L – 8L     5%                     2.5L – 5L   5%
 *   8L – 12L    10%                    5L – 10L    20%
 *   12L – 16L   15%                    > 10L       30%
 *   16L – 20L   20%
 *   20L – 24L   25%
 *   > 24L       30%
 *
 * Standard Deduction: New ₹75,000 · Old ₹50,000
 * Rebate u/s 87A:    New taxable ≤ ₹12L · Old taxable ≤ ₹5L
 *                    Marginal relief applies just above the rebate cliff (income - cliff)
 * Surcharge: 10% (>₹50L), 15% (>₹1Cr), 25% (>₹2Cr), 37% (>₹5Cr — capped at 25% under new regime)
 * Cess: 4% Health & Education on (tax + surcharge)
 */

const TAX_SLABS = {
  NEW: {
    standardDeduction: 75000,
    rebateLimit: 1200000,
    slabs: [
      { upTo: 400000,  rate: 0    },
      { upTo: 800000,  rate: 0.05 },
      { upTo: 1200000, rate: 0.10 },
      { upTo: 1600000, rate: 0.15 },
      { upTo: 2000000, rate: 0.20 },
      { upTo: 2400000, rate: 0.25 },
      { upTo: Infinity, rate: 0.30 },
    ],
  },
  OLD: {
    standardDeduction: 50000,
    rebateLimit: 500000,
    slabs: [
      { upTo: 250000,  rate: 0    },
      { upTo: 500000,  rate: 0.05 },
      { upTo: 1000000, rate: 0.20 },
      { upTo: Infinity, rate: 0.30 },
    ],
  },
};

const CESS_RATE = 0.04;

const SURCHARGE_TIERS = [
  { upTo:  5000000, rate: 0    },
  { upTo: 10000000, rate: 0.10 },
  { upTo: 20000000, rate: 0.15 },
  { upTo: 50000000, rate: 0.25 },
  { upTo: Infinity, rate: 0.37 },
];

function taxOnSlabs(taxableIncome, slabs) {
  let remaining = Math.max(taxableIncome, 0);
  let prevCap = 0;
  let tax = 0;
  const breakdown = [];
  for (const slab of slabs) {
    if (remaining <= 0) break;
    const width = slab.upTo - prevCap;
    const inThisSlab = Math.min(remaining, width);
    const t = inThisSlab * slab.rate;
    if (inThisSlab > 0) {
      breakdown.push({
        slab: `₹${prevCap.toLocaleString()} – ${slab.upTo === Infinity ? '∞' : '₹' + slab.upTo.toLocaleString()}`,
        rate: `${(slab.rate * 100).toFixed(0)}%`,
        income: inThisSlab,
        tax: Math.round(t),
      });
    }
    tax += t;
    remaining -= inThisSlab;
    prevCap = slab.upTo;
  }
  return { tax, breakdown };
}

function surchargeFor(totalIncome, regime) {
  let rate = 0;
  for (const tier of SURCHARGE_TIERS) {
    if (totalIncome <= tier.upTo) { rate = tier.rate; break; }
  }
  // Under the new regime the 37% slab is capped at 25%.
  if (regime === 'NEW' && rate > 0.25) rate = 0.25;
  return rate;
}

export function calculateTDS({
  grossAnnualSalary,
  regime = 'NEW',
  section80c = 0,
  section80d = 0,
  hraExemption = 0,
  otherDeductions = 0,
  otherIncome = 0,
  previousEmployerIncome = 0,
  previousEmployerTds = 0,
}) {
  const config = TAX_SLABS[regime];

  const totalIncome = (grossAnnualSalary || 0) + (previousEmployerIncome || 0) + (otherIncome || 0);

  let taxableIncome = totalIncome - config.standardDeduction;
  let totalExemptions = config.standardDeduction;

  if (regime === 'OLD') {
    const effective80c = Math.min(section80c, 150000);
    const effective80d = Math.min(section80d, 75000);
    taxableIncome -= effective80c + effective80d + hraExemption + otherDeductions;
    totalExemptions += effective80c + effective80d + hraExemption + otherDeductions;
  }
  taxableIncome = Math.max(taxableIncome, 0);

  const { tax: baseTax, breakdown: slabBreakdown } = taxOnSlabs(taxableIncome, config.slabs);

  // §87A rebate with marginal relief: tax payable cannot exceed (income above cliff).
  let taxBeforeRebate = baseTax;
  let rebate = 0;
  if (taxableIncome <= config.rebateLimit) {
    rebate = baseTax;
  } else {
    const excessOverCliff = taxableIncome - config.rebateLimit;
    if (baseTax > excessOverCliff) {
      rebate = baseTax - excessOverCliff;
    }
  }
  const taxAfterRebate = Math.max(baseTax - rebate, 0);

  const surchargeRate = surchargeFor(taxableIncome, regime);
  const surcharge = Math.round(taxAfterRebate * surchargeRate);

  const cess = Math.round((taxAfterRebate + surcharge) * CESS_RATE);
  const totalTax = Math.round(taxAfterRebate + surcharge + cess);

  const netTax = Math.max(totalTax - (previousEmployerTds || 0), 0);
  const monthlyTds = Math.round(netTax / 12);

  return {
    regime,
    grossAnnualSalary,
    totalIncome,
    standardDeduction: config.standardDeduction,
    totalExemptions,
    taxableIncome,
    slabBreakdown,
    taxBeforeRebate: Math.round(taxBeforeRebate),
    rebate: Math.round(rebate),
    taxAfterRebate: Math.round(taxAfterRebate),
    surchargeRate,
    surcharge,
    cess,
    totalAnnualTax: totalTax,
    previousEmployerTds: previousEmployerTds || 0,
    netAnnualTax: netTax,
    monthlyTds,
  };
}

export function compareRegimes(params) {
  const newRegime = calculateTDS({ ...params, regime: 'NEW' });
  const oldRegime = calculateTDS({ ...params, regime: 'OLD' });
  const savings = oldRegime.netAnnualTax - newRegime.netAnnualTax;
  return {
    new: newRegime,
    old: oldRegime,
    recommended: savings >= 0 ? 'NEW' : 'OLD',
    savings: Math.abs(savings),
    message: savings > 0
      ? `New Regime saves ₹${savings.toLocaleString()} annually`
      : savings < 0
        ? `Old Regime saves ₹${Math.abs(savings).toLocaleString()} annually`
        : 'Both regimes result in same tax',
  };
}

export { TAX_SLABS, CESS_RATE, SURCHARGE_TIERS };
