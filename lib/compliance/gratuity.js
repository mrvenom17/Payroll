/**
 * Gratuity Calculator — India
 * Payment of Gratuity Act, 1972
 * 
 * Eligibility: 5+ years of continuous service
 * Formula: (Last drawn salary × 15 × years of service) / 26
 * Last drawn salary = Basic + DA
 * 
 * Max gratuity: ₹25,00,000 (₹25 lakh) — tax free
 * Above ₹25L is taxable
 */

const GRATUITY_CONFIG = {
  MIN_SERVICE_YEARS: 5,
  DAYS_PER_MONTH: 26,     // Working days in a month
  WORKING_DAYS_FACTOR: 15, // 15 days' wages for each year
  MAX_TAX_FREE: 2500000,   // ₹25 lakh
};

/**
 * Calculate Gratuity
 * @param {number} lastDrawnSalary - Last drawn Basic + DA per month
 * @param {number} yearsOfService - Total years of service (can be fractional)
 * @param {string} joiningDate - ISO date string
 * @param {string} lastWorkingDate - ISO date string
 * @returns {Object} Gratuity breakdown
 */
export function calculateGratuity(lastDrawnSalary, yearsOfService = null, joiningDate = null, lastWorkingDate = null) {
  // Calculate years of service if dates provided
  if (joiningDate && lastWorkingDate && yearsOfService === null) {
    const joining = new Date(joiningDate);
    const exit = new Date(lastWorkingDate);
    const diffMs = exit - joining;
    const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    // Round to nearest 0.5 — if > 6 months in last year, round up
    yearsOfService = Math.round(diffYears);
  }

  if (yearsOfService === null) yearsOfService = 0;
  
  const isEligible = yearsOfService >= GRATUITY_CONFIG.MIN_SERVICE_YEARS;
  
  if (!isEligible) {
    return {
      eligible: false,
      yearsOfService: Math.round(yearsOfService * 10) / 10,
      reason: `Requires minimum ${GRATUITY_CONFIG.MIN_SERVICE_YEARS} years of service. Current: ${yearsOfService.toFixed(1)} years`,
      amount: 0,
      taxFreeAmount: 0,
      taxableAmount: 0,
    };
  }
  
  // Gratuity = (Last drawn salary × 15 × Years of service) / 26
  const gratuityAmount = Math.round(
    (lastDrawnSalary * GRATUITY_CONFIG.WORKING_DAYS_FACTOR * yearsOfService) / GRATUITY_CONFIG.DAYS_PER_MONTH
  );
  
  const taxFreeAmount = Math.min(gratuityAmount, GRATUITY_CONFIG.MAX_TAX_FREE);
  const taxableAmount = Math.max(gratuityAmount - GRATUITY_CONFIG.MAX_TAX_FREE, 0);
  
  return {
    eligible: true,
    yearsOfService: Math.round(yearsOfService * 10) / 10,
    lastDrawnSalary,
    formula: `(₹${lastDrawnSalary.toLocaleString()} × 15 × ${yearsOfService}) / 26`,
    amount: gratuityAmount,
    taxFreeAmount,
    taxableAmount,
    maxTaxFree: GRATUITY_CONFIG.MAX_TAX_FREE,
  };
}

export { GRATUITY_CONFIG };
