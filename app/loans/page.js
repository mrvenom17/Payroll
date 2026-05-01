'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function LoansPage() {
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({
    employee_id: '', loan_type: 'Imprest Money', loan_amount: '', emi_amount: '', start_date: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/loans?company=${localStorage.getItem('active_company') || ''}${filter ? `&status=${filter}` : ''}`).then(r => r.json()),
      fetch(`/api/employees?company=${localStorage.getItem('active_company') || ''}&status=active`).then(r => r.json()),
    ]).then(([loanData, empData]) => {
      setLoans(loanData.loans || []);
      setSummary(loanData.summary || {});
      setEmployees(empData.employees || []);
      setLoading(false);
    });
  };

  useEffect(fetchData, [filter]);

  const openNew = () => {
    setEditing(null);
    setForm({ employee_id: '', loan_type: 'Imprest Money', loan_amount: '', emi_amount: '', start_date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const openEdit = (loan) => {
    setEditing(loan);
    setForm({
      employee_id: loan.employee_id,
      loan_type: loan.loan_type,
      loan_amount: loan.loan_amount,
      emi_amount: loan.emi_amount,
      start_date: loan.start_date || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        // Update existing loan
        const res = await fetch('/api/loans', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editing.id,
            loan_type: form.loan_type,
            emi_amount: parseFloat(form.emi_amount),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success('Loan updated');
          setShowModal(false);
          fetchData();
        } else {
          toast.error(data.error || 'Update failed');
        }
      } else {
        // Create new loan
        const res = await fetch('/api/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            loan_amount: parseFloat(form.loan_amount),
            emi_amount: parseFloat(form.emi_amount),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success('Loan created successfully');
          setShowModal(false);
          fetchData();
        } else {
          toast.error(data.error || 'Creation failed');
        }
      }
    } catch (err) {
      toast.error('Network error');
    }
    setSaving(false);
  };

  const closeLoan = async (loan) => {
    const ok = await confirm({
      title: 'Close Loan?',
      message: `Mark loan "${loan.loan_type}" for ${loan.full_name} as fully repaid? Outstanding balance (${fmt(loan.balance_outstanding)}) will be set to ₹0.`,
      confirmText: 'Yes, Close',
      variant: 'success',
      icon: '✅',
    });
    if (!ok) return;
    const res = await fetch('/api/loans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: loan.id, action: 'close' }),
    });
    const data = await res.json();
    if (data.success) { toast.success('Loan closed'); fetchData(); }
    else toast.error(data.error || 'Close failed');
  };

  const writeOffLoan = async (loan) => {
    const ok = await confirm({
      title: 'Write Off Loan?',
      message: `Write off loan "${loan.loan_type}" for ${loan.full_name}? Outstanding: ${fmt(loan.balance_outstanding)}. This marks the loan as unrecoverable.`,
      confirmText: 'Yes, Write Off',
      variant: 'danger',
      icon: '💸',
    });
    if (!ok) return;
    const res = await fetch('/api/loans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: loan.id, action: 'write_off' }),
    });
    const data = await res.json();
    if (data.success) { toast.success('Loan written off'); fetchData(); }
    else toast.error(data.error || 'Write-off failed');
  };

  const deleteLoan = async (loan) => {
    const isActive = loan.status === 'ACTIVE';
    const ok = await confirm({
      title: 'Delete Loan?',
      message: isActive
        ? `This will permanently delete the ACTIVE loan "${loan.loan_type}" for ${loan.full_name} (${fmt(loan.loan_amount)}). This cannot be undone. Consider closing it instead.`
        : `Permanently remove "${loan.loan_type}" record for ${loan.full_name}?`,
      confirmText: 'Yes, Delete',
      variant: 'danger',
      icon: '🗑️',
    });
    if (!ok) return;
    const res = await fetch(`/api/loans?id=${loan.id}${isActive ? '&force=true' : ''}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('Loan deleted'); fetchData(); }
    else toast.error(data.error || 'Delete failed');
  };

  const reactivateLoan = async (loan) => {
    const ok = await confirm({
      title: 'Reactivate Loan?',
      message: `Reactivate "${loan.loan_type}" for ${loan.full_name}? Outstanding: ${fmt(loan.balance_outstanding)}.`,
      confirmText: 'Yes, Reactivate',
      variant: 'warning',
      icon: '🔄',
    });
    if (!ok) return;
    const res = await fetch('/api/loans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: loan.id, action: 'reactivate' }),
    });
    const data = await res.json();
    if (data.success) { toast.success('Loan reactivated'); fetchData(); }
    else toast.error(data.error || 'Reactivate failed');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏦 Loans & Advances</h1>
          <p className="page-subtitle">Manage employee loans, salary advances, and EMI deductions</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ New Loan / Advance</button>
      </div>

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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(l => {
                const paidEmis = l.total_emis > 0 ? Math.round(((l.loan_amount - l.balance_outstanding) / l.loan_amount) * l.total_emis) : 0;
                const progress = l.loan_amount > 0 ? Math.round(((l.loan_amount - l.balance_outstanding) / l.loan_amount) * 100) : 0;
                return (
                  <tr key={l.id}>
                    <td><div><Link href={`/employees/${l.employee_id}`} style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>{l.full_name}</Link></div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l.employee_code}</div></td>
                    <td><span className={`badge ${['Imprest Money','Advance','Festival Advance'].includes(l.loan_type) ? 'badge-info' : l.loan_type === 'Personal Loan' ? 'badge-warning' : 'badge-primary'}`}>{l.loan_type}</span></td>
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
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {l.status === 'ACTIVE' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(l)} title="Edit EMI">✏️</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => closeLoan(l)} title="Close (mark as repaid)" style={{ color: 'var(--success)' }}>✅</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => writeOffLoan(l)} title="Write Off" style={{ color: 'var(--warning)' }}>💸</button>
                          </>
                        )}
                        {(l.status === 'CLOSED' || l.status === 'WRITTEN_OFF') && (
                          <button className="btn btn-ghost btn-sm" onClick={() => reactivateLoan(l)} title="Reactivate">🔄</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteLoan(l)} title="Delete" style={{ color: 'var(--danger)' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '✏️ Edit Loan' : '➕ Create Loan / Advance'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label form-label-required">Employee</label>
                  {editing ? (
                    <input className="form-input" value={`${editing.full_name} (${editing.employee_code})`} disabled />
                  ) : (
                    <select className="form-select" value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} required>
                      <option value="">Select Employee</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Loan / Advance Type</label>
                  <select className="form-select" value={form.loan_type} onChange={e => setForm(p => ({ ...p, loan_type: e.target.value }))}>
                    <optgroup label="Advances">
                      <option>Imprest Money</option>
                      <option>Advance</option>
                      <option>Festival Advance</option>
                    </optgroup>
                    <optgroup label="Loans">
                      <option>Personal Loan</option>
                      <option>Emergency Loan</option>
                    </optgroup>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Loan Amount (₹)</label>
                    <input type="number" className="form-input" value={form.loan_amount} onChange={e => setForm(p => ({ ...p, loan_amount: e.target.value }))} required disabled={!!editing} />
                    {editing && <span className="form-hint">Loan amount cannot be changed after creation</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">Monthly EMI (₹)</label>
                    <input type="number" className="form-input" value={form.emi_amount} onChange={e => setForm(p => ({ ...p, emi_amount: e.target.value }))} required />
                    {form.loan_amount && form.emi_amount > 0 && (
                      <span className="form-hint">Duration: ~{Math.ceil((editing ? editing.balance_outstanding : form.loan_amount) / form.emi_amount)} months</span>
                    )}
                  </div>
                </div>
                {!editing && (
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input type="date" className="form-input" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-success" disabled={saving}>
                  {saving ? '⏳ Saving…' : (editing ? '💾 Save Changes' : '✓ Create Loan')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
