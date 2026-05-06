/**
 * ESIC Calculator — India
 * ESI Act, 1948
 * 
 * Applicable: Employees with gross wages ≤ ₹21,000/month
 * (₹25,000 for persons with disability)
 * 
 * Employee: 0.75% of gross wages
 * Employer: 3.25% of gross wages
 * 
 * Employees earning ≤ ₹176/day (approx ₹4,576/month) are exempt
 * from employee contribution, but employer still pays.
 */

const ESIC_CONFIG = {
  WAGE_CEILING: 21000,
  WAGE_CEILING_PWD: 25000,  // Persons with disability
  EMPLOYEE_RATE: 0.0075,
  EMPLOYER_RATE: 0.0325,
  EXEMPT_DAILY_WAGE: 176,   // Below this, employee exempt
};

/**
 * Calculate ESIC for an employee
 * @param {number} grossWages - Monthly gross wages
 * @param {boolean} isPWD - Is person with disability
 * @returns {Object|null} ESIC breakdown, null if not applicable
 */
export function calculateESIC(grossWages, isPWD = false, fullGrossWages = null) {
  const ceiling = isPWD ? ESIC_CONFIG.WAGE_CEILING_PWD : ESIC_CONFIG.WAGE_CEILING;
  
  const applicabilityWages = fullGrossWages !== null ? fullGrossWages : grossWages;

  if (applicabilityWages > ceiling) {
    return {
      applicable: false,
      reason: `Gross wages ₹${applicabilityWages.toLocaleString()} exceeds ceiling ₹${ceiling.toLocaleString()}`,
      employeeContribution: 0,
      employerContribution: 0,
      totalContribution: 0,
    };
  }
  
  const dailyWage = applicabilityWages / 26; // Approx 26 working days
  const isEmployeeExempt = dailyWage <= ESIC_CONFIG.EXEMPT_DAILY_WAGE;
  
  const employeeContribution = isEmployeeExempt ? 0 : Math.round(grossWages * ESIC_CONFIG.EMPLOYEE_RATE);
  const employerContribution = Math.round(grossWages * ESIC_CONFIG.EMPLOYER_RATE);
  
  return {
    applicable: true,
    isEmployeeExempt,
    employeeContribution,
    employerContribution,
    totalContribution: employeeContribution + employerContribution,
  };
}

export { ESIC_CONFIG };
