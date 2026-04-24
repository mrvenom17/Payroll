/**
 * TDS (Income Tax) Calculator — India
 * Financial Year 2025-26 (AY 2026-27)
 * 
 * NEW REGIME (Default):
 * Up to ₹4L → 0%, ₹4L-8L → 5%, ₹8L-12L → 10%,
 * ₹12L-16L → 15%, ₹16L-20L → 20%, ₹20L-24L → 25%, Above ₹24L → 30%
 * Standard Deduction: ₹75,000
 * Rebate u/s 87A: Taxable income ≤ ₹12L → No tax
 * 
 * OLD REGIME:
 * Up to ₹2.5L → 0%, ₹2.5L-5L → 5%, ₹5L-10L → 20%, Above ₹10L → 30%
 * Standard Deduction: ₹50,000
 * Allows 80C (₹1.5L), 80D, HRA, etc.
 * Rebate u/s 87A: Taxable income ≤ ₹5L → No tax
 * 
 * Cess: 4% Health & Education on tax amount
 */

const TAX_SLABS = {
  NEW: {
    standardDeduction: 75000,
    rebateLimit: 1200000,
    slabs: [
      { min: 0, max: 400000, rate: 0 },
      { min: 400001, max: 800000, rate: 0.05 },
      { min: 800001, max: 1200000, rate: 0.10 },
      { min: 1200001, max: 1600000, rate: 0.15 },
      { min: 1600001, max: 2000000, rate: 0.20 },
      { min: 2000001, max: 2400000, rate: 0.25 },
      { min: 2400001, max: Infinity, rate: 0.30 },
    ],
  },
  OLD: {
    standardDeduction: 50000,
    rebateLimit: 500000,
    slabs: [
      { min: 0, max: 250000, rate: 0 },
      { min: 250001, max: 500000, rate: 0.05 },
      { min: 500001, max: 1000000, rate: 0.20 },
      { min: 1000001, max: Infinity, rate: 0.30 },
    ],
  },
};

const CESS_RATE = 0.04;

/**
 * Calculate annual tax on taxable income
 */
function calculateTaxOnIncome(taxableIncome, regime) {
  const { slabs } = TAX_SLABS[regime];
  let tax = 0;
  
  for (const slab of slabs) {
    if (taxableIncome <= 0) break;
    
    const slabWidth = slab.max === Infinity ? taxableIncome : (slab.max - slab.min + 1);
    const taxableInSlab = Math.min(taxableIncome - slab.min + (slab.min === 0 ? 0 : 1 ), slabWidth);
    
    if (taxableIncome > slab.min || slab.min === 0) {
      const incomeInSlab = Math.min(taxableIncome, slab.max) - slab.min + (slab.min === 0 ? 0 : 1);
      if (incomeInSlab > 0) {
        tax += incomeInSlab * slab.rate;
      }
    }
  }
  
  return Math.round(tax);
}

/**
 * Calculate TDS for an employee (Annual projection)
 * @param {Object} params
 * @param {number} params.grossAnnualSalary - Total annual salary
 * @param {string} params.regime - 'OLD' or 'NEW'
 * @param {number} params.section80c - 80C investments (old regime only)
 * @param {number} params.section80d - 80D health insurance (old regime only)
 * @param {number} params.hraExemption - HRA exemption amount (old regime only)
 * @param {number} params.otherDeductions - Other deductions
 * @param {number} params.otherIncome - Income from other sources
 * @param {number} params.previousEmployerIncome - Income from previous employer (same FY)
 * @param {number} params.previousEmployerTds - TDS already deducted by previous employer
 * @returns {Object} TDS breakdown
 */
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
  
  let totalIncome = grossAnnualSalary + previousEmployerIncome + otherIncome;
  
  // Step 1: Standard Deduction
  let taxableIncome = totalIncome - config.standardDeduction;
  
  // Step 2: Regime-specific deductions
  let totalExemptions = config.standardDeduction;
  
  if (regime === 'OLD') {
    // Section 80C (max ₹1,50,000)
    const effectiveSection80c = Math.min(section80c, 150000);
    taxableIncome -= effectiveSection80c;
    totalExemptions += effectiveSection80c;
    
    // Section 80D (max ₹25,000 self, ₹25,000 parents, ₹50,000 senior citizen parents)
    const effectiveSection80d = Math.min(section80d, 75000);
    taxableIncome -= effectiveSection80d;
    totalExemptions += effectiveSection80d;
    
    // HRA Exemption
    taxableIncome -= hraExemption;
    totalExemptions += hraExemption;
    
    // Other deductions
    taxableIncome -= otherDeductions;
    totalExemptions += otherDeductions;
  }
  
  taxableIncome = Math.max(taxableIncome, 0);
  
  // Step 3: Calculate tax
  let annualTax = 0;
  const slabBreakdown = [];
  
  for (const slab of config.slabs) {
    if (taxableIncome <= slab.min && slab.min > 0) break;
    
    const upper = slab.max === Infinity ? taxableIncome : Math.min(taxableIncome, slab.max);
    const lower = slab.min;
    const incomeInSlab = Math.max(upper - lower, 0);
    const taxInSlab = Math.round(incomeInSlab * slab.rate);
    
    if (incomeInSlab > 0) {
      slabBreakdown.push({
        slab: `₹${lower.toLocaleString()} – ${slab.max === Infinity ? '∞' : '₹' + slab.max.toLocaleString()}`,
        rate: `${(slab.rate * 100).toFixed(0)}%`,
        income: incomeInSlab,
        tax: taxInSlab,
      });
      annualTax += taxInSlab;
    }
  }
  
  // Step 4: Apply Rebate u/s 87A
  let rebate = 0;
  if (taxableIncome <= config.rebateLimit) {
    rebate = annualTax;
    annualTax = 0;
  }
  
  // Step 5: Add Cess
  const cess = Math.round(annualTax * CESS_RATE);
  const totalTax = annualTax + cess;
  
  // Step 6: Subtract previous employer TDS
  const netTax = Math.max(totalTax - previousEmployerTds, 0);
  
  // Step 7: Monthly TDS
  const monthlyTds = Math.round(netTax / 12);
  
  return {
    regime,
    grossAnnualSalary,
    totalIncome,
    standardDeduction: config.standardDeduction,
    totalExemptions,
    taxableIncome,
    slabBreakdown,
    taxBeforeRebate: annualTax + rebate,
    rebate,
    taxAfterRebate: annualTax,
    cess,
    totalAnnualTax: totalTax,
    previousEmployerTds,
    netAnnualTax: netTax,
    monthlyTds,
  };
}

/**
 * Compare Old vs New regime
 */
export function compareRegimes(params) {
  const newRegime = calculateTDS({ ...params, regime: 'NEW' });
  const oldRegime = calculateTDS({ ...params, regime: 'OLD' });
  
  const savings = oldRegime.netAnnualTax - newRegime.netAnnualTax;
  
  return {
    new: newRegime,
    old: oldRegime,
    recommended: savings > 0 ? 'NEW' : 'OLD',
    savings: Math.abs(savings),
    message: savings > 0
      ? `New Regime saves ₹${savings.toLocaleString()} annually`
      : savings < 0
        ? `Old Regime saves ₹${Math.abs(savings).toLocaleString()} annually`
        : 'Both regimes result in same tax',
  };
}

export { TAX_SLABS, CESS_RATE };
