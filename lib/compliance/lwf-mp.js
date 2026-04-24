/**
 * Labour Welfare Fund — Madhya Pradesh
 * MP Shram Kalyan Nidhi Adhiniyam, 1982
 * 
 * Applicability: Establishments with 1+ employees
 * Exemption: Managerial/supervisory roles earning > ₹10,000/month
 * 
 * Employee: ₹10 per half-year
 * Employer: ₹30 per half-year
 * 
 * Due Dates:
 * - 15 July (Jan–Jun period)
 * - 15 January (Jul–Dec period)
 */

const LWF_CONFIG = {
  EMPLOYEE_CONTRIBUTION: 10,  // Per half-year
  EMPLOYER_CONTRIBUTION: 30,  // Per half-year
  EXEMPTION_LIMIT: 10000,     // Managerial/supervisory exemption
  FREQUENCY: 'HALF_YEARLY',
};

/**
 * Calculate LWF for an employee
 * @param {number} monthlySalary - Monthly salary
 * @param {boolean} isManagerial - Is in managerial/supervisory role
 * @param {number} month - Current month (1-12)
 * @returns {Object} LWF breakdown
 */
export function calculateLWF(monthlySalary, isManagerial = false, month = 1) {
  // Exempt if managerial and salary > ₹10,000
  if (isManagerial && monthlySalary > LWF_CONFIG.EXEMPTION_LIMIT) {
    return {
      applicable: false,
      reason: 'Exempt — Managerial/supervisory role with salary > ₹10,000',
      employeeContribution: 0,
      employerContribution: 0,
    };
  }
  
  // LWF is deducted in June (month 6) and December (month 12)
  const isDeductionMonth = month === 6 || month === 12;
  
  return {
    applicable: true,
    isDeductionMonth,
    employeeContribution: isDeductionMonth ? LWF_CONFIG.EMPLOYEE_CONTRIBUTION : 0,
    employerContribution: isDeductionMonth ? LWF_CONFIG.EMPLOYER_CONTRIBUTION : 0,
    totalContribution: isDeductionMonth ? LWF_CONFIG.EMPLOYEE_CONTRIBUTION + LWF_CONFIG.EMPLOYER_CONTRIBUTION : 0,
    dueDate: month <= 6 ? '15 July' : '15 January',
  };
}

export { LWF_CONFIG };
