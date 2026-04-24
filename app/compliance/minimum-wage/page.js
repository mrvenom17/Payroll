'use client';

import { useState, useEffect } from 'react';

const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

// MP Minimum Wage Rates (Apr 2026 — Gazette Notification)
const MIN_WAGE_RATES = {
  'Unskilled': { daily: 399.25, monthly: 10381 },
  'Semi-skilled': { daily: 436.25, monthly: 11343 },
  'Skilled': { daily: 473.25, monthly: 12305 },
  'Highly Skilled': { daily: 530.25, monthly: 13787 },
};

export default function MinWageCheckPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/employees?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}&status=active`)
      .then(r => r.json())
      .then(d => { setEmployees(d.employees || []); setLoading(false); });
  }, []);

  const results = employees.map(emp => {
    const category = emp.skill_category || 'Unskilled';
    const rate = MIN_WAGE_RATES[category] || MIN_WAGE_RATES['Unskilled'];
    const monthly = emp.ctc_monthly || 0;
    const compliant = monthly >= rate.monthly;
    const shortfall = compliant ? 0 : rate.monthly - monthly;

    return { ...emp, category, minWage: rate.monthly, compliant, shortfall };
  });

  const compliantCount = results.filter(r => r.compliant).length;
  const nonCompliantCount = results.filter(r => !r.compliant).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">✅ Minimum Wage Check</h1>
        <p className="page-subtitle">Validate employee wages against Madhya Pradesh minimum wage rates (Apr 2026 Gazette)</p>
      </div>

      {/* Rate Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">📋 MP Minimum Wage Rates (Apr 2026)</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {Object.entries(MIN_WAGE_RATES).map(([cat, rate]) => (
              <div key={cat} style={{ padding: 16, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{cat}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{fmt(rate.monthly)}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}>/mo</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{fmt(rate.daily)}/day</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="stat-card stat-card--primary"><div><div className="stat-value">{results.length}</div><div className="stat-label">Total Employees</div></div></div>
        <div className="stat-card stat-card--success"><div><div className="stat-value">{compliantCount}</div><div className="stat-label">Compliant</div></div><div className="stat-icon stat-icon--success">✅</div></div>
        <div className="stat-card stat-card--danger"><div><div className="stat-value">{nonCompliantCount}</div><div className="stat-label">Non-Compliant</div></div><div className="stat-icon stat-icon--danger">⚠️</div></div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
        <div className="table-container">
          <div className="table-toolbar">
            <span className="card-title">Employee-wise Validation</span>
            {nonCompliantCount > 0 && (
              <div className="alert alert-danger" style={{ margin: 0, padding: '6px 12px' }}>⚠️ {nonCompliantCount} employees below minimum wage!</div>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Skill Category</th>
                <th style={{ textAlign: 'right' }}>Current CTC/mo</th>
                <th style={{ textAlign: 'right' }}>Minimum Required</th>
                <th style={{ textAlign: 'right' }}>Shortfall</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} style={!r.compliant ? { background: 'var(--danger-bg)' } : {}}>
                  <td>
                    <div><strong>{r.full_name}</strong></div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code} • {r.designation}</div>
                  </td>
                  <td><span className="badge badge-primary">{r.category}</span></td>
                  <td className="currency text-right font-bold">{fmt(r.ctc_monthly)}</td>
                  <td className="currency text-right">{fmt(r.minWage)}</td>
                  <td className="currency text-right" style={{ color: r.shortfall > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                    {r.shortfall > 0 ? `- ${fmt(r.shortfall)}` : '—'}
                  </td>
                  <td>
                    <span className={`badge ${r.compliant ? 'badge-success' : 'badge-danger'}`}>
                      {r.compliant ? '✅ Compliant' : '⚠️ Below Minimum'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
