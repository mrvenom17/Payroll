'use client';

import { useState, useEffect } from 'react';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function PfEsicReportPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/payroll?company=${localStorage.getItem('active_company') || ''}&month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setLoading(false); });
  }, [month, year]);

  const pfRecords = records.filter(r => r.pf_deduction > 0);
  const esicRecords = records.filter(r => r.esic_deduction > 0);
  const ptRecords = records.filter(r => r.pt_deduction > 0);

  const pfTotals = {
    empPF: pfRecords.reduce((s, r) => s + r.pf_deduction, 0),
    empPFCount: pfRecords.length,
    employerPF: pfRecords.reduce((s, r) => s + r.employer_pf, 0),
  };
  const esicTotals = {
    empESIC: esicRecords.reduce((s, r) => s + r.esic_deduction, 0),
    employerESIC: esicRecords.reduce((s, r) => s + r.employer_esic, 0),
  };
  const ptTotal = ptRecords.reduce((s, r) => s + r.pt_deduction, 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏛️ PF / ESIC / PT Report</h1>
          <p className="page-subtitle">Statutory contributions for {MONTHS[month]} {year}</p>
        </div>
        <div className="page-actions">
          <select className="form-select" style={{ width: 140 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <input type="number" className="form-input" style={{ width: 90 }} value={year} onChange={e => setYear(parseInt(e.target.value))} />
        </div>
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card stat-card--info">
          <div>
            <div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(pfTotals.empPF)}</div>
            <div className="stat-label">Employee PF ({pfTotals.empPFCount} emp)</div>
          </div>
        </div>
        <div className="stat-card stat-card--primary">
          <div>
            <div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(pfTotals.employerPF)}</div>
            <div className="stat-label">Employer PF</div>
          </div>
        </div>
        <div className="stat-card stat-card--warning">
          <div>
            <div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(esicTotals.empESIC + esicTotals.employerESIC)}</div>
            <div className="stat-label">Total ESIC ({esicRecords.length} emp)</div>
          </div>
        </div>
        <div className="stat-card stat-card--accent">
          <div>
            <div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(ptTotal)}</div>
            <div className="stat-label">Professional Tax ({ptRecords.length} emp)</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : records.length === 0 ? (
        <div className="card"><div className="card-body"><div className="table-empty"><div className="table-empty-icon">🏛️</div><p>No payroll data for {MONTHS[month]} {year}</p></div></div></div>
      ) : (
        <>
          {/* PF Report */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">🏛️ Provident Fund Report</span><span className="badge badge-info">{pfRecords.length} employees</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Sl</th><th>Employee</th><th>UAN</th><th>PF No.</th><th style={{ textAlign: 'right' }}>PF Wages</th><th style={{ textAlign: 'right' }}>Employee PF (12%)</th><th style={{ textAlign: 'right' }}>Employer PF (12%)</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                <tbody>
                  {pfRecords.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td><div><strong>{r.full_name}</strong></div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code}</div></td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{r.uan || <span style={{ color: 'var(--danger)' }}>Missing</span>}</td>
                      <td className="font-mono" style={{ fontSize: 12 }}>{r.pf_number || '—'}</td>
                      <td className="currency text-right">{fmt(Math.min(r.basic_salary, 15000))}</td>
                      <td className="currency text-right text-danger">{fmt(r.pf_deduction)}</td>
                      <td className="currency text-right text-danger">{fmt(r.employer_pf)}</td>
                      <td className="currency text-right font-bold">{fmt(r.pf_deduction + r.employer_pf)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                    <td></td><td>TOTAL</td><td></td><td></td><td></td>
                    <td className="currency text-right text-danger">{fmt(pfTotals.empPF)}</td>
                    <td className="currency text-right text-danger">{fmt(pfTotals.employerPF)}</td>
                    <td className="currency text-right font-bold">{fmt(pfTotals.empPF + pfTotals.employerPF)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ESIC Report */}
          {esicRecords.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><span className="card-title">🏥 ESIC Report</span><span className="badge badge-warning">{esicRecords.length} employees</span></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th>Sl</th><th>Employee</th><th>ESIC No.</th><th style={{ textAlign: 'right' }}>Gross Wages</th><th style={{ textAlign: 'right' }}>Employee (0.75%)</th><th style={{ textAlign: 'right' }}>Employer (3.25%)</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                  <tbody>
                    {esicRecords.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td><div><strong>{r.full_name}</strong></div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code}</div></td>
                        <td className="font-mono" style={{ fontSize: 12 }}>{r.esic_number || <span style={{ color: 'var(--danger)' }}>Missing</span>}</td>
                        <td className="currency text-right">{fmt(r.gross_earnings)}</td>
                        <td className="currency text-right text-danger">{fmt(r.esic_deduction)}</td>
                        <td className="currency text-right text-danger">{fmt(r.employer_esic)}</td>
                        <td className="currency text-right font-bold">{fmt(r.esic_deduction + r.employer_esic)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                      <td></td><td>TOTAL</td><td></td><td></td>
                      <td className="currency text-right">{fmt(esicTotals.empESIC)}</td>
                      <td className="currency text-right">{fmt(esicTotals.employerESIC)}</td>
                      <td className="currency text-right">{fmt(esicTotals.empESIC + esicTotals.employerESIC)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* PT Report */}
          <div className="card">
            <div className="card-header"><span className="card-title">📋 Professional Tax Report (MP)</span><span className="badge badge-accent">{ptRecords.length} employees</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead><tr><th>Sl</th><th>Employee</th><th style={{ textAlign: 'right' }}>Annual CTC</th><th style={{ textAlign: 'right' }}>Monthly PT</th></tr></thead>
                <tbody>
                  {ptRecords.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td><div><strong>{r.full_name}</strong></div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code}</div></td>
                      <td className="currency text-right">—</td>
                      <td className="currency text-right font-bold text-danger">{fmt(r.pt_deduction)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                    <td></td><td>TOTAL</td><td></td>
                    <td className="currency text-right text-danger">{fmt(ptTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
