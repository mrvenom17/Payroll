'use client';

import { useState } from 'react';

// Inline calculators for client-side (matching server-side lib)
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

function calculateTax(grossAnnual, regime, deductions = {}) {
  const config = TAX_SLABS[regime];
  let totalIncome = grossAnnual + (deductions.otherIncome || 0);
  let taxableIncome = totalIncome - config.standardDeduction;

  if (regime === 'OLD') {
    taxableIncome -= Math.min(deductions.section80c || 0, 150000);
    taxableIncome -= Math.min(deductions.section80d || 0, 75000);
    taxableIncome -= (deductions.hraExemption || 0);
    taxableIncome -= (deductions.otherDeductions || 0);
  }

  taxableIncome = Math.max(taxableIncome, 0);

  let tax = 0;
  const breakdown = [];

  for (const slab of config.slabs) {
    if (taxableIncome <= slab.min && slab.min > 0) break;
    const upper = slab.max === Infinity ? taxableIncome : Math.min(taxableIncome, slab.max);
    const income = Math.max(upper - slab.min, 0);
    const slabTax = Math.round(income * slab.rate);
    if (income > 0) {
      breakdown.push({
        range: `₹${slab.min.toLocaleString()} – ${slab.max === Infinity ? '∞' : '₹' + slab.max.toLocaleString()}`,
        rate: `${(slab.rate * 100).toFixed(0)}%`,
        income,
        tax: slabTax,
      });
      tax += slabTax;
    }
  }

  let rebate = 0;
  if (taxableIncome <= config.rebateLimit) {
    rebate = tax;
    tax = 0;
  }

  const cess = Math.round(tax * 0.04);
  const totalTax = tax + cess;
  const monthlyTds = Math.round(totalTax / 12);

  return { taxableIncome, breakdown, taxBeforeRebate: tax + rebate, rebate, taxAfterRebate: tax, cess, totalTax, monthlyTds, standardDeduction: config.standardDeduction };
}

function fmt(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

// PF calculator
function calcPF(basic) {
  const wage = Math.min(basic, 15000);
  return {
    employee: Math.round(wage * 0.12),
    employer: Math.round(wage * 0.12),
    wageBase: wage,
  };
}

// ESIC calculator
function calcESIC(gross) {
  if (gross > 21000) return { applicable: false, employee: 0, employer: 0 };
  return {
    applicable: true,
    employee: Math.round(gross * 0.0075),
    employer: Math.round(gross * 0.0325),
  };
}

// PT MP
function calcPT(annual) {
  if (annual <= 225000) return { monthly: 0, annual: 0 };
  if (annual <= 300000) return { monthly: 125, annual: 1500 };
  if (annual <= 400000) return { monthly: 166, annual: 2000 };
  return { monthly: 208, annual: 2500 };
}

export default function TaxCalculatorPage() {
  const [grossAnnual, setGrossAnnual] = useState(480000);
  const [basicMonthly, setBasicMonthly] = useState(16000);
  const [grossMonthly, setGrossMonthly] = useState(40000);
  const [tab, setTab] = useState('tds');

  // TDS inputs
  const [section80c, setSection80c] = useState(0);
  const [section80d, setSection80d] = useState(0);
  const [hraExemption, setHraExemption] = useState(0);

  const newResult = calculateTax(grossAnnual, 'NEW');
  const oldResult = calculateTax(grossAnnual, 'OLD', { section80c, section80d, hraExemption });
  const savings = oldResult.totalTax - newResult.totalTax;

  const pf = calcPF(basicMonthly);
  const esic = calcESIC(grossMonthly);
  const pt = calcPT(grossAnnual);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">🧮 Tax & Compliance Calculator</h1>
        <p className="page-subtitle">Calculate TDS, PF, ESIC, PT for any salary — FY 2025-26</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'tds' ? 'active' : ''}`} onClick={() => setTab('tds')}>📊 TDS Calculator</button>
        <button className={`tab ${tab === 'pf' ? 'active' : ''}`} onClick={() => setTab('pf')}>🏛️ PF Calculator</button>
        <button className={`tab ${tab === 'esic' ? 'active' : ''}`} onClick={() => setTab('esic')}>🏥 ESIC Calculator</button>
        <button className={`tab ${tab === 'pt' ? 'active' : ''}`} onClick={() => setTab('pt')}>📋 PT Calculator (MP)</button>
      </div>

      {tab === 'tds' && (
        <div>
          {/* Input */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">Enter Annual Gross Salary</span></div>
            <div className="card-body">
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Annual Gross Salary (₹)</label>
                  <input type="number" className="form-input" value={grossAnnual} onChange={e => setGrossAnnual(Number(e.target.value))} />
                  <span className="form-hint">Monthly: {fmt(Math.round(grossAnnual / 12))}</span>
                </div>
                <div className="form-group">
                  <label className="form-label">80C Investment (Old Regime)</label>
                  <input type="number" className="form-input" value={section80c} onChange={e => setSection80c(Number(e.target.value))} max={150000} />
                  <span className="form-hint">Max ₹1,50,000</span>
                </div>
                <div className="form-group">
                  <label className="form-label">80D Health Insurance (Old Regime)</label>
                  <input type="number" className="form-input" value={section80d} onChange={e => setSection80d(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`alert ${savings > 0 ? 'alert-success' : savings < 0 ? 'alert-info' : 'alert-warning'}`} style={{ marginBottom: 20 }}>
            <strong>💡 Recommendation:</strong> {savings > 0 
              ? `New Regime saves ${fmt(savings)} annually (${fmt(Math.round(savings/12))}/month)`
              : savings < 0 
                ? `Old Regime saves ${fmt(Math.abs(savings))} annually (${fmt(Math.round(Math.abs(savings)/12))}/month)`
                : 'Both regimes result in same tax'
            }
          </div>

          {/* Side by side comparison */}
          <div className="dashboard-grid">
            {/* New Regime */}
            <div className="card">
              <div className="card-header" style={{ background: 'var(--info-bg)' }}>
                <span className="card-title">🆕 New Regime {savings > 0 ? '✅ Recommended' : ''}</span>
              </div>
              <div className="card-body">
                <div className="salary-breakdown">
                  <div className="salary-row">
                    <span className="salary-row-label">Gross Annual Salary</span>
                    <span className="salary-row-value">{fmt(grossAnnual)}</span>
                  </div>
                  <div className="salary-row">
                    <span className="salary-row-label">Standard Deduction</span>
                    <span className="salary-row-value">- {fmt(newResult.standardDeduction)}</span>
                  </div>
                  <div className="salary-row" style={{ fontWeight: 600 }}>
                    <span className="salary-row-label">Taxable Income</span>
                    <span className="salary-row-value">{fmt(newResult.taxableIncome)}</span>
                  </div>
                  <div style={{ margin: '12px 0', padding: '10px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>SLAB-WISE BREAKDOWN</div>
                    {newResult.breakdown.map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                        <span>{s.range} @ {s.rate}</span>
                        <span>{fmt(s.tax)}</span>
                      </div>
                    ))}
                  </div>
                  {newResult.rebate > 0 && (
                    <div className="salary-row">
                      <span className="salary-row-label">Rebate u/s 87A</span>
                      <span className="salary-row-value text-success">- {fmt(newResult.rebate)}</span>
                    </div>
                  )}
                  <div className="salary-row">
                    <span className="salary-row-label">Cess (4%)</span>
                    <span className="salary-row-value">{fmt(newResult.cess)}</span>
                  </div>
                  <div className="salary-row salary-row-total">
                    <span className="salary-row-label">Total Annual Tax</span>
                    <span className="salary-row-value">{fmt(newResult.totalTax)}</span>
                  </div>
                  <div className="salary-row" style={{ background: 'var(--primary-50)', padding: '10px', borderRadius: 'var(--radius-md)', marginTop: 8 }}>
                    <span className="salary-row-label" style={{ fontWeight: 700 }}>Monthly TDS</span>
                    <span className="salary-row-value" style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{fmt(newResult.monthlyTds)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Old Regime */}
            <div className="card">
              <div className="card-header" style={{ background: 'var(--warning-bg)' }}>
                <span className="card-title">📜 Old Regime {savings < 0 ? '✅ Recommended' : ''}</span>
              </div>
              <div className="card-body">
                <div className="salary-breakdown">
                  <div className="salary-row">
                    <span className="salary-row-label">Gross Annual Salary</span>
                    <span className="salary-row-value">{fmt(grossAnnual)}</span>
                  </div>
                  <div className="salary-row">
                    <span className="salary-row-label">Standard Deduction</span>
                    <span className="salary-row-value">- {fmt(oldResult.standardDeduction)}</span>
                  </div>
                  {section80c > 0 && <div className="salary-row"><span className="salary-row-label">Section 80C</span><span className="salary-row-value">- {fmt(Math.min(section80c, 150000))}</span></div>}
                  {section80d > 0 && <div className="salary-row"><span className="salary-row-label">Section 80D</span><span className="salary-row-value">- {fmt(section80d)}</span></div>}
                  <div className="salary-row" style={{ fontWeight: 600 }}>
                    <span className="salary-row-label">Taxable Income</span>
                    <span className="salary-row-value">{fmt(oldResult.taxableIncome)}</span>
                  </div>
                  <div style={{ margin: '12px 0', padding: '10px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>SLAB-WISE BREAKDOWN</div>
                    {oldResult.breakdown.map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                        <span>{s.range} @ {s.rate}</span>
                        <span>{fmt(s.tax)}</span>
                      </div>
                    ))}
                  </div>
                  {oldResult.rebate > 0 && (
                    <div className="salary-row">
                      <span className="salary-row-label">Rebate u/s 87A</span>
                      <span className="salary-row-value text-success">- {fmt(oldResult.rebate)}</span>
                    </div>
                  )}
                  <div className="salary-row">
                    <span className="salary-row-label">Cess (4%)</span>
                    <span className="salary-row-value">{fmt(oldResult.cess)}</span>
                  </div>
                  <div className="salary-row salary-row-total">
                    <span className="salary-row-label">Total Annual Tax</span>
                    <span className="salary-row-value">{fmt(oldResult.totalTax)}</span>
                  </div>
                  <div className="salary-row" style={{ background: 'var(--warning-bg)', padding: '10px', borderRadius: 'var(--radius-md)', marginTop: 8 }}>
                    <span className="salary-row-label" style={{ fontWeight: 700 }}>Monthly TDS</span>
                    <span className="salary-row-value" style={{ fontSize: 18, fontWeight: 800, color: 'var(--warning)' }}>{fmt(oldResult.monthlyTds)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'pf' && (
        <div className="card">
          <div className="card-header"><span className="card-title">🏛️ Provident Fund Calculator</span></div>
          <div className="card-body">
            <div className="form-group" style={{ maxWidth: 300 }}>
              <label className="form-label">Monthly Basic Salary (₹)</label>
              <input type="number" className="form-input" value={basicMonthly} onChange={e => setBasicMonthly(Number(e.target.value))} />
              <span className="form-hint">PF wage capped at ₹15,000</span>
            </div>
            <div className="salary-breakdown" style={{ maxWidth: 400, marginTop: 20 }}>
              <div className="salary-row">
                <span className="salary-row-label">PF Wage Base</span>
                <span className="salary-row-value">{fmt(pf.wageBase)}</span>
              </div>
              <div className="salary-row salary-row--deduction">
                <span className="salary-row-label">Employee PF (12%)</span>
                <span className="salary-row-value">{fmt(pf.employee)}</span>
              </div>
              <div className="salary-row salary-row--deduction">
                <span className="salary-row-label">Employer PF (12%)</span>
                <span className="salary-row-value">{fmt(pf.employer)}</span>
              </div>
              <div className="salary-row salary-row-total">
                <span className="salary-row-label">Total PF Contribution</span>
                <span className="salary-row-value">{fmt(pf.employee + pf.employer)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'esic' && (
        <div className="card">
          <div className="card-header"><span className="card-title">🏥 ESIC Calculator</span></div>
          <div className="card-body">
            <div className="form-group" style={{ maxWidth: 300 }}>
              <label className="form-label">Monthly Gross Wages (₹)</label>
              <input type="number" className="form-input" value={grossMonthly} onChange={e => setGrossMonthly(Number(e.target.value))} />
              <span className="form-hint">Applicable if ≤ ₹21,000/month</span>
            </div>
            <div style={{ marginTop: 20 }}>
              {esic.applicable ? (
                <div className="salary-breakdown" style={{ maxWidth: 400 }}>
                  <div className="alert alert-success">✅ ESIC Applicable</div>
                  <div className="salary-row salary-row--deduction">
                    <span className="salary-row-label">Employee (0.75%)</span>
                    <span className="salary-row-value">{fmt(esic.employee)}</span>
                  </div>
                  <div className="salary-row salary-row--deduction">
                    <span className="salary-row-label">Employer (3.25%)</span>
                    <span className="salary-row-value">{fmt(esic.employer)}</span>
                  </div>
                  <div className="salary-row salary-row-total">
                    <span className="salary-row-label">Total ESIC</span>
                    <span className="salary-row-value">{fmt(esic.employee + esic.employer)}</span>
                  </div>
                </div>
              ) : (
                <div className="alert alert-warning">
                  ⚠️ ESIC Not Applicable — Gross wages {fmt(grossMonthly)} exceed ₹21,000 ceiling
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'pt' && (
        <div className="card">
          <div className="card-header"><span className="card-title">📋 Professional Tax — Madhya Pradesh</span></div>
          <div className="card-body">
            <div className="form-group" style={{ maxWidth: 300 }}>
              <label className="form-label">Annual Gross Salary (₹)</label>
              <input type="number" className="form-input" value={grossAnnual} onChange={e => setGrossAnnual(Number(e.target.value))} />
            </div>
            <div className="salary-breakdown" style={{ maxWidth: 400, marginTop: 20 }}>
              <div className="salary-row">
                <span className="salary-row-label">Monthly PT Deduction</span>
                <span className="salary-row-value">{fmt(pt.monthly)}</span>
              </div>
              <div className="salary-row salary-row-total">
                <span className="salary-row-label">Annual PT</span>
                <span className="salary-row-value">{fmt(pt.annual)}</span>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>MP PT Slab Table</h4>
              <table>
                <thead><tr><th>Annual Income</th><th>Monthly Deduction</th><th>Annual Total</th></tr></thead>
                <tbody>
                  <tr><td>Up to ₹2,25,000</td><td>Nil</td><td>Nil</td></tr>
                  <tr style={grossAnnual > 225000 && grossAnnual <= 300000 ? { background: 'var(--success-bg)' } : {}}>
                    <td>₹2,25,001 – ₹3,00,000</td><td>₹125</td><td>₹1,500</td>
                  </tr>
                  <tr style={grossAnnual > 300000 && grossAnnual <= 400000 ? { background: 'var(--success-bg)' } : {}}>
                    <td>₹3,00,001 – ₹4,00,000</td><td>₹166</td><td>₹2,000</td>
                  </tr>
                  <tr style={grossAnnual > 400000 ? { background: 'var(--success-bg)' } : {}}>
                    <td>Above ₹4,00,000</td><td>₹208</td><td>₹2,500</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
