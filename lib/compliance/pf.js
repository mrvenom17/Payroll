/**
 * Provident Fund Calculator — India
 * EPF Act, 1952
 * 
 * Wage Base: Basic + DA (capped at ₹15,000/month for statutory)
 * Employee: 12% of wage base
 * Employer: 12% of wage base (split: 3.67% EPF + 8.33% EPS)
 * EPS capped at ₹1,250/month (8.33% of ₹15,000)
 * EDLI: 0.50% (max ₹75/month)
 * Admin charges: 0.50%
 */

const PF_CONFIG = {
  WAGE_CEILING: 15000,
  EMPLOYEE_RATE: 0.12,
  EMPLOYER_RATE: 0.12,
  EPF_RATE: 0.0367,      // Employer's EPF share
  EPS_RATE: 0.0833,      // Employer's EPS share
  EPS_CAP: 1250,         // Max EPS contribution per month
  EDLI_RATE: 0.005,      // Employer's EDLI
  EDLI_CAP: 75,          // Max EDLI per month
  ADMIN_RATE: 0.005,     // Admin charges
};

/**
 * Calculate PF for an employee
 * @param {number} basicSalary - Monthly Basic + DA
 * @param {boolean} voluntaryHigher - If true, calculate on actual basic (above ceiling)
 * @returns {Object} PF breakdown
 */
export function calculatePF(basicSalary, voluntaryHigher = false) {
  const wageBase = voluntaryHigher ? basicSalary : Math.min(basicSalary, PF_CONFIG.WAGE_CEILING);
  
  const employeeContribution = Math.round(wageBase * PF_CONFIG.EMPLOYEE_RATE);
  
  // Employer split
  const epsContribution = Math.min(
    Math.round(wageBase * PF_CONFIG.EPS_RATE),
    PF_CONFIG.EPS_CAP
  );
  const epfContribution = Math.round(wageBase * PF_CONFIG.EMPLOYER_RATE) - epsContribution;
  const employerContribution = epfContribution + epsContribution;
  
  // Additional employer charges
  const edli = Math.min(Math.round(wageBase * PF_CONFIG.EDLI_RATE), PF_CONFIG.EDLI_CAP);
  const adminCharges = Math.round(wageBase * PF_CONFIG.ADMIN_RATE);
  
  return {
    wageBase,
    employeeContribution,
    employerContribution,
    epfContribution,
    epsContribution,
    edli,
    adminCharges,
    totalEmployerCost: employerContribution + edli + adminCharges,
    totalContribution: employeeContribution + employerContribution,
  };
}

export { PF_CONFIG };
