'use client';

import { useState, useEffect } from 'react';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function SalaryRegisterPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/payroll?company=${localStorage.getItem('active_company') || ''}&month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setSummary(d.summary || {}); setLoading(false); });
  }, [month, year]);

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📑 Salary Register</h1>
          <p className="page-subtitle">Monthly salary register for {MONTHS[month]} {year}</p>
        </div>
        <div className="page-actions">
          <select className="form-select" style={{ width: 140 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <input type="number" className="form-input" style={{ width: 90 }} value={year} onChange={e => setYear(parseInt(e.target.value))} />
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : records.length === 0 ? (
        <div className="card"><div className="card-body"><div className="table-empty"><div className="table-empty-icon">📑</div><p>No payroll data for {MONTHS[month]} {year}. Process payroll first.</p></div></div></div>
      ) : (
        <>
          {/* Summary header */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
                <div><div className="detail-label">Employees</div><div className="detail-value font-bold">{records.length}</div></div>
                <div><div className="detail-label">Total Gross</div><div className="detail-value font-bold text-success">{fmt(summary.totalGross)}</div></div>
                <div><div className="detail-label">Total Deductions</div><div className="detail-value font-bold text-danger">{fmt(summary.totalDeductions)}</div></div>
                <div><div className="detail-label">Net Payable</div><div className="detail-value font-bold" style={{ color: 'var(--primary)' }}>{fmt(summary.totalNet)}</div></div>
                <div><div className="detail-label">Employer PF</div><div className="detail-value">{fmt(summary.employerPF)}</div></div>
                <div><div className="detail-label">Employer ESIC</div><div className="detail-value">{fmt(summary.employerESIC)}</div></div>
              </div>
            </div>
          </div>

          <div className="table-container">
            <div className="table-toolbar">
              <span className="card-title">Salary Register — {MONTHS[month]} {year}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 1400 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 2 }}>Sl</th>
                    <th style={{ position: 'sticky', left: 30, background: 'var(--gray-50)', zIndex: 2 }}>Employee</th>
                    <th>Dept</th><th>Days</th>
                    <th style={{ textAlign: 'right' }}>Basic</th>
                    <th style={{ textAlign: 'right' }}>HRA</th>
                    <th style={{ textAlign: 'right' }}>Conv.</th>
                    <th style={{ textAlign: 'right' }}>Medical</th>
                    <th style={{ textAlign: 'right' }}>Special</th>
                    <th style={{ textAlign: 'right', fontWeight: 700 }}>Gross</th>
                    <th style={{ textAlign: 'right' }}>PF</th>
                    <th style={{ textAlign: 'right' }}>ESIC</th>
                    <th style={{ textAlign: 'right' }}>PT</th>
                    <th style={{ textAlign: 'right' }}>TDS</th>
                    <th style={{ textAlign: 'right' }}>Loan</th>
                    <th style={{ textAlign: 'right', fontWeight: 700 }}>Tot.Ded</th>
                    <th style={{ textAlign: 'right', fontWeight: 700 }}>Net Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>{i + 1}</td>
                      <td style={{ position: 'sticky', left: 30, background: 'white', zIndex: 1, minWidth: 150 }}>
                        <div><strong>{r.full_name}</strong></div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.employee_code}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{r.department_name || '—'}</td>
                      <td>{r.paid_days}/{r.total_working_days}</td>
                      <td className="currency text-right">{fmt(r.basic_salary)}</td>
                      <td className="currency text-right">{fmt(r.hra)}</td>
                      <td className="currency text-right">{fmt(r.conveyance)}</td>
                      <td className="currency text-right">{fmt(r.medical)}</td>
                      <td className="currency text-right">{fmt(r.special_allowance)}</td>
                      <td className="currency text-right font-bold text-success">{fmt(r.gross_earnings)}</td>
                      <td className="currency text-right text-danger">{fmt(r.pf_deduction)}</td>
                      <td className="currency text-right text-danger">{fmt(r.esic_deduction)}</td>
                      <td className="currency text-right text-danger">{fmt(r.pt_deduction)}</td>
                      <td className="currency text-right text-danger">{fmt(r.tds_deduction)}</td>
                      <td className="currency text-right text-danger">{fmt(r.loan_deduction)}</td>
                      <td className="currency text-right font-bold text-danger">{fmt(r.total_deductions)}</td>
                      <td className="currency text-right" style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>{fmt(r.net_salary)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--gray-50)', fontSize: 13 }}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 1 }}></td>
                    <td style={{ position: 'sticky', left: 30, background: 'var(--gray-50)', zIndex: 1 }}>TOTAL</td>
                    <td></td><td></td>
                    <td className="currency text-right">{fmt(records.reduce((s, r) => s + r.basic_salary, 0))}</td>
                    <td className="currency text-right">{fmt(records.reduce((s, r) => s + r.hra, 0))}</td>
                    <td className="currency text-right">{fmt(records.reduce((s, r) => s + r.conveyance, 0))}</td>
                    <td className="currency text-right">{fmt(records.reduce((s, r) => s + r.medical, 0))}</td>
                    <td className="currency text-right">{fmt(records.reduce((s, r) => s + r.special_allowance, 0))}</td>
                    <td className="currency text-right text-success">{fmt(summary.totalGross)}</td>
                    <td className="currency text-right text-danger">{fmt(summary.totalPF)}</td>
                    <td className="currency text-right text-danger">{fmt(summary.totalESIC)}</td>
                    <td className="currency text-right text-danger">{fmt(summary.totalPT)}</td>
                    <td className="currency text-right text-danger">{fmt(summary.totalTDS)}</td>
                    <td className="currency text-right text-danger">{fmt(records.reduce((s, r) => s + r.loan_deduction, 0))}</td>
                    <td className="currency text-right text-danger">{fmt(summary.totalDeductions)}</td>
                    <td className="currency text-right" style={{ color: 'var(--primary)', fontSize: 14 }}>{fmt(summary.totalNet)}</td>
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
