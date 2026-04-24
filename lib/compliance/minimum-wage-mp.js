/**
 * Minimum Wage Validator — Madhya Pradesh
 * Effective: 1 April 2026 – 30 September 2026
 * 
 * Rates include Basic Wage + VDA (₹2,850/month)
 * 
 * Unskilled:      ₹12,425/month (₹478/day)
 * Semi-skilled:    ₹13,421/month (₹516/day)
 * Skilled:         ₹15,144/month (₹582/day)
 * Highly Skilled:  ₹16,769/month (₹645/day)
 */

const MINIMUM_WAGES_MP = {
  'Unskilled': { monthly: 12425, daily: 478, basic: 9575, vda: 2850 },
  'Semi-skilled': { monthly: 13421, daily: 516, basic: 10571, vda: 2850 },
  'Skilled': { monthly: 15144, daily: 582, basic: 12294, vda: 2850 },
  'Highly Skilled': { monthly: 16769, daily: 645, basic: 13919, vda: 2850 },
};

const EFFECTIVE_PERIOD = {
  from: '2026-04-01',
  to: '2026-09-30',
};

/**
 * Validate if an employee's salary meets MP minimum wage
 * @param {number} monthlySalary - Employee's monthly gross salary
 * @param {string} skillCategory - Unskilled / Semi-skilled / Skilled / Highly Skilled
 * @returns {Object} Validation result
 */
export function validateMinimumWage(monthlySalary, skillCategory = 'Unskilled') {
  const minWage = MINIMUM_WAGES_MP[skillCategory];
  
  if (!minWage) {
    return {
      valid: false,
      error: `Unknown skill category: ${skillCategory}`,
    };
  }
  
  const isCompliant = monthlySalary >= minWage.monthly;
  const shortfall = isCompliant ? 0 : minWage.monthly - monthlySalary;
  
  return {
    valid: isCompliant,
    skillCategory,
    requiredMinimum: minWage.monthly,
    actualSalary: monthlySalary,
    shortfall,
    dailyRequired: minWage.daily,
    message: isCompliant 
      ? `✓ Compliant — Salary ₹${monthlySalary.toLocaleString()} meets MP minimum wage ₹${minWage.monthly.toLocaleString()} for ${skillCategory}`
      : `✗ VIOLATION — Salary ₹${monthlySalary.toLocaleString()} is below MP minimum wage ₹${minWage.monthly.toLocaleString()} for ${skillCategory}. Shortfall: ₹${shortfall.toLocaleString()}`,
    effectivePeriod: EFFECTIVE_PERIOD,
  };
}

export { MINIMUM_WAGES_MP, EFFECTIVE_PERIOD };
