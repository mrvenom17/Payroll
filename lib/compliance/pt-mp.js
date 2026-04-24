/**
 * Professional Tax Calculator — Madhya Pradesh
 * 
 * Annual Income Slabs:
 * Up to ₹2,25,000         → Nil
 * ₹2,25,001 – ₹3,00,000  → ₹1,500/year (₹125/month)
 * ₹3,00,001 – ₹4,00,000  → ₹2,000/year (₹166/month, ₹174 in Feb)
 * Above ₹4,00,000         → ₹2,500/year (₹208/month, ₹212 in Feb)
 * 
 * Max cap: ₹2,500/year (Article 276)
 */

const PT_SLABS_MP = [
  { min: 0, max: 225000, annual: 0, monthly: 0, lastMonth: 0 },
  { min: 225001, max: 300000, annual: 1500, monthly: 125, lastMonth: 125 },
  { min: 300001, max: 400000, annual: 2000, monthly: 166, lastMonth: 174 },
  { min: 400001, max: Infinity, annual: 2500, monthly: 208, lastMonth: 212 },
];

/**
 * Calculate Professional Tax for MP
 * @param {number} annualSalary - Annual gross salary
 * @param {number} month - Current month (1-12), Feb = 2
 * @returns {Object} PT breakdown
 */
export function calculatePT(annualSalary, month = 1) {
  const slab = PT_SLABS_MP.find(s => annualSalary >= s.min && annualSalary <= s.max);
  
  if (!slab) {
    return { applicable: false, monthlyAmount: 0, annualAmount: 0, slab: null };
  }
  
  // February (month 2) gets the adjustment amount to hit the exact annual total
  const isLastMonth = month === 2;
  const monthlyAmount = isLastMonth ? slab.lastMonth : slab.monthly;
  
  return {
    applicable: slab.annual > 0,
    monthlyAmount,
    annualAmount: slab.annual,
    slab: slab.annual > 0 ? `₹${slab.min.toLocaleString()} – ₹${slab.max === Infinity ? '∞' : slab.max.toLocaleString()}` : 'Exempt',
  };
}

export { PT_SLABS_MP };
