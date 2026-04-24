'use client';

import { useState, useEffect } from 'react';

const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function LoansPage() {
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({
    employee_id: '', loan_type: 'Advance', loan_amount: '', emi_amount: '', start_date: new Date().toISOString().split('T')[0],
  });

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/loans?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}${filter ? `&status=${filter}` : ''}`).then(r => r.json()),
      fetch(`/api/employees?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}&status=active`).then(r => r.json()),
    ]).then(([loanData, empData]) => {
      setLoans(loanData.loans || []);
      setSummary(loanData.summary || {});
      setEmployees(empData.employees || []);
      setLoading(false);
    });
  };

  useEffect(fetchData, [filter]);

  const createLoan = async (e) => {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.success) {
      setMsg('✅ Loan created');
      setShowModal(false);
      setForm({ employee_id: '', loan_type: 'Advance', loan_amount: '', emi_amount: '', start_date: new Date().toISOString().split('T')[0] });
      fetchData();
    } else setMsg(`❌ ${data.error}`);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏦 Loans & Advances</h1>
          <p className="page-subtitle">Manage employee loans, salary advances, and EMI deductions</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>➕ New Loan / Advance</button>
      </div>

      {msg && <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>{msg}</div>}

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="stat-card stat-card--info"><div><div className="stat-value">{summary.totalActive || 0}</div><div className="stat-label">Active Loans</div></div><div className="stat-icon stat-icon--info">📋</div></div>
        <div className="stat-card stat-card--danger"><div><div className="stat-value currency" style={{ fontSize: 22 }}>{fmt(summary.totalOutstanding)}</div><div className="stat-label">Outstanding Balance</div></div><div className="stat-icon stat-icon--danger">💸</div></div>
        <div className="stat-card stat-card--success"><div><div className="stat-value currency" style={{ fontSize: 22 }}>{fmt(summary.totalDisbursed)}</div><div className="stat-label">Total Disbursed</div></div><div className="stat-icon stat-icon--success">🏦</div></div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['', 'ACTIVE', 'CLOSED', 'WRITTEN_OFF'].map(s => (
          <button key={s} className={`btn ${filter === s ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setFilter(s)}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : loans.length === 0 ? (
        <div className="card"><div className="card-body"><div className="table-empty"><div className="table-empty-icon">🏦</div><p>No loans found</p></div></div></div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Loan Amount</th>
                <th style={{ textAlign: 'right' }}>EMI</th>
                <th>EMIs Paid</th>
                <th style={{ textAlign: 'right' }}>Outstanding</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(l => {
                const paidEmis = l.total_emis > 0 ? Math.round(((l.loan_amount - l.balance_outstanding) / l.loan_amount) * l.total_emis) : 0;
                const progress = l.loan_amount > 0 ? Math.round(((l.loan_amount - l.balance_outstanding) / l.loan_amount) * 100) : 0;
                return (
                  <tr key={l.id}>
                    <td><div><strong>{l.full_name}</strong></div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l.employee_code}</div></td>
                    <td><span className={`badge ${l.loan_type === 'Advance' ? 'badge-info' : l.loan_type === 'Personal Loan' ? 'badge-warning' : 'badge-primary'}`}>{l.loan_type}</span></td>
                    <td className="currency text-right">{fmt(l.loan_amount)}</td>
                    <td className="currency text-right">{fmt(l.emi_amount)}</td>
                    <td>{paidEmis} / {l.total_emis}</td>
                    <td className="currency text-right font-bold text-danger">{fmt(l.balance_outstanding)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? 'var(--success)' : 'var(--primary)', borderRadius: 3 }}></div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>{progress}%</span>
                      </div>
                    </td>
                    <td><span className={`badge ${l.status === 'ACTIVE' ? 'badge-warning' : l.status === 'CLOSED' ? 'badge-success' : 'badge-danger'}`}>{l.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Loan / Advance</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={createLoan}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label form-label-required">Employee</label>
                  <select className="form-select" value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} required>
                    <option value="">Select Employee</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Loan Type</label>
                  <select className="form-select" value={form.loan_type} onChange={e => setForm(p => ({ ...p, loan_type: e.target.value }))}>
                    <option>Advance</option>
                    <option>Personal Loan</option>
                    <option>Emergency Loan</option>
                    <option>Festival Advance</option>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Loan Amount (₹)</label>
                    <input type="number" className="form-input" value={form.loan_amount} onChange={e => setForm(p => ({ ...p, loan_amount: parseFloat(e.target.value) || 0 }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">Monthly EMI (₹)</label>
                    <input type="number" className="form-input" value={form.emi_amount} onChange={e => setForm(p => ({ ...p, emi_amount: parseFloat(e.target.value) || 0 }))} required />
                    {form.loan_amount && form.emi_amount > 0 && (
                      <span className="form-hint">Duration: ~{Math.ceil(form.loan_amount / form.emi_amount)} months</span>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-input" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">✓ Create Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
