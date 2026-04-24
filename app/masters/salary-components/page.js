'use client';

import { useState, useEffect } from 'react';

export default function SalaryComponentsPage() {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/salary-components')
      .then(r => r.json())
      .then(d => { setComponents(d.components || []); setLoading(false); });
  }, []);

  const earnings = components.filter(c => c.type === 'EARNING');
  const deductions = components.filter(c => c.type === 'DEDUCTION');

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">⚙️ Salary Components</h1>
          <p className="page-subtitle">Master list of all earning and deduction components</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-success" style={{ fontSize: 13, padding: '6px 12px' }}>📈 {earnings.length} Earnings</span>
          <span className="badge badge-danger" style={{ fontSize: 13, padding: '6px 12px' }}>📉 {deductions.length} Deductions</span>
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
        <div className="dashboard-grid">
          {/* Earnings */}
          <div className="card">
            <div className="card-header" style={{ background: 'var(--success-bg)', borderBottom: '2px solid var(--success-border)' }}>
              <span className="card-title" style={{ color: 'var(--success)' }}>📈 Earnings</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr><th>#</th><th>Component</th><th>Code</th><th>Calculation</th><th>Flags</th></tr>
                </thead>
                <tbody>
                  {earnings.map((c, i) => (
                    <tr key={c.id}>
                      <td>{i + 1}</td>
                      <td><strong>{c.name}</strong></td>
                      <td><span className="badge badge-neutral font-mono">{c.code}</span></td>
                      <td style={{ fontSize: 12 }}>
                        {c.percent_of ? `${c.default_percent}% of ${c.percent_of}` : c.default_amount ? `₹${c.default_amount}` : 'Variable'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.is_taxable ? <span className="badge badge-warning" style={{ fontSize: 10 }}>Taxable</span> : null}
                          {c.is_statutory ? <span className="badge badge-info" style={{ fontSize: 10 }}>Statutory</span> : null}
                          {c.contributes_to_pf ? <span className="badge badge-primary" style={{ fontSize: 10 }}>PF</span> : null}
                          {c.contributes_to_esic ? <span className="badge badge-primary" style={{ fontSize: 10 }}>ESIC</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deductions */}
          <div className="card">
            <div className="card-header" style={{ background: 'var(--danger-bg)', borderBottom: '2px solid var(--danger-border)' }}>
              <span className="card-title" style={{ color: 'var(--danger)' }}>📉 Deductions</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr><th>#</th><th>Component</th><th>Code</th><th>Calculation</th><th>Flags</th></tr>
                </thead>
                <tbody>
                  {deductions.map((c, i) => (
                    <tr key={c.id}>
                      <td>{i + 1}</td>
                      <td><strong>{c.name}</strong></td>
                      <td><span className="badge badge-neutral font-mono">{c.code}</span></td>
                      <td style={{ fontSize: 12 }}>
                        {c.percent_of ? `${c.default_percent}% of ${c.percent_of}` : c.default_amount ? `₹${c.default_amount}` : 'Variable'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.is_statutory ? <span className="badge badge-info" style={{ fontSize: 10 }}>Statutory</span> : null}
                          {c.tax_deductible ? <span className="badge badge-success" style={{ fontSize: 10 }}>80C Eligible</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
