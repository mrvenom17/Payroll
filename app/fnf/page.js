'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().split('T')[0];

const STATUS_BADGE = {
  DRAFT: 'badge-warning',
  APPROVED: 'badge-info',
  PAID: 'badge-success',
};

export default function FnfPage() {
  const [settlements, setSettlements] = useState([]);
  const [exitedWithoutFnf, setExitedWithoutFnf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
  const [result, setResult] = useState(null);
  const [paymentDefaults, setPaymentDefaults] = useState({
    default_payment_mode: 'NEFT',
    payer_bank_name: '',
    payer_account_number: '',
    payer_ifsc: '',
    next_cheque_number: '000001',
  });

  const toast = useToast();
  const confirm = useConfirm();

  const [calcForm, setCalcForm] = useState({
    last_working_date: '', notice_period_days: 30, notice_period_recovery: 0,
    bonus_payable: 0, pending_deductions: 0, asset_recovery: false,
    asset_recovery_amount: 0, noc_status: 'PENDING',
  });

  const [payForm, setPayForm] = useState({
    payment_mode: 'NEFT',
    payment_date: today(),
    utr_number: '',
    from_bank_account: '',
    cheque_number: '',
    cheque_bank: '',
    cheque_date: today(),
    payment_notes: '',
  });

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/fnf?company=${localStorage.getItem('active_company') || ''}`)
      .then(r => r.json())
      .then(d => {
        setSettlements(d.settlements || []);
        setExitedWithoutFnf(d.exitedWithoutFnf || []);
        setLoading(false);
      });

    fetch('/api/settings/integrations')
      .then(r => r.json())
      .then(d => {
        if (d.settings) setPaymentDefaults(prev => ({ ...prev, ...d.settings }));
      });
  };

  useEffect(fetchData, []);

  const openCalc = (emp) => {
    setSelectedEmp(emp);
    setCalcForm(prev => ({ ...prev, last_working_date: emp.exit_date || today() }));
    setResult(null);
    setShowCalcModal(true);
  };

  const processFnf = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/fnf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: selectedEmp.id, ...calcForm }),
    });
    const data = await res.json();
    if (data.settlement) {
      setResult({ settlement: data.settlement, details: data.details });
      toast.success('FNF Settlement created in DRAFT');
      fetchData();
    } else {
      toast.error(data.error || 'Failed to create settlement');
    }
  };

  const approve = async (settlement) => {
    const ok = await confirm({
      title: 'Approve FNF',
      message: `Approve final settlement of ${fmt(settlement.final_amount)} for ${settlement.full_name}?`,
      confirmText: 'Approve',
      variant: 'success',
      icon: '✅',
    });
    if (!ok) return;
    const res = await fetch('/api/fnf', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: settlement.id, action: 'approve' }),
    });
    const data = await res.json();
    if (data.success) { toast.success('FNF approved — ready for payment'); fetchData(); }
    else toast.error(data.error || 'Approval failed');
  };

  const openPay = (settlement) => {
    setSelectedSettlement(settlement);
    setPayForm({
      payment_mode: paymentDefaults.default_payment_mode || 'NEFT',
      payment_date: today(),
      utr_number: '',
      from_bank_account: paymentDefaults.payer_account_number
        ? `${paymentDefaults.payer_bank_name} • ${paymentDefaults.payer_account_number}`
        : (paymentDefaults.payer_bank_name || ''),
      cheque_number: paymentDefaults.next_cheque_number || '',
      cheque_bank: paymentDefaults.payer_bank_name || '',
      cheque_date: today(),
      payment_notes: '',
    });
    setShowPayModal(true);
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    const payload = {
      id: selectedSettlement.id,
      action: 'pay',
      payment_mode: payForm.payment_mode,
      payment_date: payForm.payment_date,
      payment_notes: payForm.payment_notes,
    };
    if (payForm.payment_mode === 'CHEQUE') {
      payload.cheque_number = payForm.cheque_number;
      payload.cheque_bank = payForm.cheque_bank;
      payload.cheque_date = payForm.cheque_date;
      payload.payment_reference = payForm.cheque_number;
      payload.payment_bank = payForm.cheque_bank;
    } else if (['NEFT','IMPS','RTGS'].includes(payForm.payment_mode)) {
      payload.utr_number = payForm.utr_number;
      payload.from_bank_account = payForm.from_bank_account;
      payload.payment_reference = payForm.utr_number;
      payload.payment_bank = payForm.from_bank_account;
    } else {
      payload.payment_reference = payForm.utr_number || '';
      payload.payment_bank = payForm.from_bank_account || '';
    }

    const res = await fetch('/api/fnf', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`FNF marked PAID via ${payForm.payment_mode}`);
      setShowPayModal(false);
      fetchData();
    } else {
      toast.error(data.error || 'Payment failed');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📝 Full & Final Settlement</h1>
          <p className="page-subtitle">Process FNF for exited employees · Default payout: <strong>{paymentDefaults.default_payment_mode}</strong></p>
        </div>
        {settlements.length > 0 && (
          <button
            className="btn btn-outline"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={async () => {
              const ok = await confirm({
                title: 'Clear all FNF history?',
                message: `Permanently delete all ${settlements.length} FNF settlement record${settlements.length === 1 ? '' : 's'} for this company, including the linked payment ledger entries. Employees themselves are NOT touched. This cannot be undone.`,
                confirmText: 'Yes, Clear All',
                variant: 'danger',
                icon: '🗑️',
              });
              if (!ok) return;
              const res = await fetch(`/api/fnf?scope=all&company=${localStorage.getItem('active_company') || ''}`, { method: 'DELETE' });
              const d = await res.json();
              if (d.success) {
                toast.success(`Cleared ${d.deleted} settlement${d.deleted === 1 ? '' : 's'}`);
                fetchData();
              } else {
                toast.error(d.error || 'Clear failed');
              }
            }}
          >🗑️ Clear All History</button>
        )}
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
        <div className="stat-card stat-card--warning"><div><div className="stat-value">{exitedWithoutFnf.length}</div><div className="stat-label">Pending FNF</div></div><div className="stat-icon stat-icon--warning">⏳</div></div>
        <div className="stat-card stat-card--info"><div><div className="stat-value">{settlements.filter(s => s.status === 'DRAFT' || s.status === 'APPROVED').length}</div><div className="stat-label">In Process</div></div><div className="stat-icon stat-icon--info">📝</div></div>
        <div className="stat-card stat-card--success"><div><div className="stat-value">{settlements.filter(s => s.status === 'PAID').length}</div><div className="stat-label">Paid</div></div><div className="stat-icon stat-icon--success">✅</div></div>
        <div className="stat-card stat-card--primary"><div><div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(settlements.filter(s=>s.status==='PAID').reduce((s, f) => s + (f.final_amount || 0), 0))}</div><div className="stat-label">Total Settled</div></div><div className="stat-icon stat-icon--primary">💰</div></div>
      </div>

      {/* Pending FNF */}
      {exitedWithoutFnf.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">⏳ Exited Employees — FNF Pending</span>
            <span className="badge badge-warning">{exitedWithoutFnf.length}</span>
          </div>
          <div className="card-body">
            <table>
              <thead>
                <tr><th>Employee</th><th>Designation</th><th>Joining Date</th><th>Exit Date</th><th>Exit Reason</th><th>Action</th></tr>
              </thead>
              <tbody>
                {exitedWithoutFnf.map(emp => (
                  <tr key={emp.id}>
                    <td><div><Link href={`/employees/${emp.id}`} style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>{emp.full_name}</Link></div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{emp.employee_code}</div></td>
                    <td>{emp.designation || '—'}</td>
                    <td>{fmtDate(emp.joining_date)}</td>
                    <td className="text-danger">{fmtDate(emp.exit_date)}</td>
                    <td>{emp.exit_reason || '—'}</td>
                    <td><button className="btn btn-primary btn-sm" onClick={() => openCalc(emp)}>Calculate FNF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Existing Settlements */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 FNF Settlements</span>
          <span className="badge badge-info">{settlements.length}</span>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="page-loader"><div className="spinner"></div></div>
          ) : settlements.length === 0 ? (
            <div className="table-empty"><div className="table-empty-icon">📝</div><p>No FNF settlements yet</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Last Working</th>
                  <th style={{ textAlign: 'right' }}>Leave Enc.</th>
                  <th style={{ textAlign: 'right' }}>Gratuity</th>
                  <th style={{ textAlign: 'right' }}>Deductions</th>
                  <th style={{ textAlign: 'right', fontWeight: 800 }}>Final Amount</th>
                  <th>NOC</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th style={{ minWidth: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map(s => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/employees/${s.employee_id}`} style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>{s.full_name}</Link>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.employee_code}</div>
                    </td>
                    <td>{fmtDate(s.last_working_date)}</td>
                    <td className="currency text-right">{fmt(s.leave_encashment)}</td>
                    <td className="currency text-right">{fmt(s.gratuity)}</td>
                    <td className="currency text-right text-danger">{fmt((s.pending_deductions || 0) + (s.notice_period_recovery || 0) + (s.asset_recovery_amount || 0))}</td>
                    <td className="currency text-right" style={{ fontSize: 15, fontWeight: 800, color: s.final_amount >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(s.final_amount)}</td>
                    <td><span className={`badge ${s.noc_status === 'CLEARED' ? 'badge-success' : s.noc_status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>{s.noc_status}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[s.status] || 'badge-neutral'}`}>{s.status}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {s.status === 'PAID' ? (
                        <div>
                          <div><strong>{s.payment_mode}</strong></div>
                          <div style={{ color: 'var(--text-tertiary)' }}>
                            {s.payment_reference || '—'}{s.payment_date ? ` · ${fmtDate(s.payment_date)}` : ''}
                          </div>
                        </div>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td>
                      {s.status === 'DRAFT' && (
                        <button className="btn btn-sm btn-success" onClick={() => approve(s)}>✅ Approve</button>
                      )}
                      {s.status === 'APPROVED' && (
                        <button className="btn btn-sm btn-primary" onClick={() => openPay(s)}>💳 Mark Paid</button>
                      )}
                      {s.status === 'PAID' && <span className="text-success" style={{ fontSize: 12, fontWeight: 600 }}>✓ Settled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Calculate Modal */}
      {showCalcModal && selectedEmp && (
        <div className="modal-overlay" onClick={() => setShowCalcModal(false)}>
          <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">FNF Calculation — {selectedEmp.full_name}</h3>
              <button className="modal-close" onClick={() => setShowCalcModal(false)}>×</button>
            </div>
            <form onSubmit={processFnf}>
              <div className="modal-body">
                <div className="alert alert-info" style={{ marginBottom: 16 }}>
                  Employee: <strong>{selectedEmp.full_name}</strong> ({selectedEmp.employee_code}) • Joined: {fmtDate(selectedEmp.joining_date)}
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label form-label-required">Last Working Date</label>
                    <input type="date" className="form-input" value={calcForm.last_working_date} onChange={e => setCalcForm(p => ({ ...p, last_working_date: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notice Period (days)</label>
                    <input type="number" className="form-input" value={calcForm.notice_period_days} onChange={e => setCalcForm(p => ({ ...p, notice_period_days: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notice Recovery (₹)</label>
                    <input type="number" className="form-input" value={calcForm.notice_period_recovery} onChange={e => setCalcForm(p => ({ ...p, notice_period_recovery: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Bonus Payable (₹)</label>
                    <input type="number" className="form-input" value={calcForm.bonus_payable} onChange={e => setCalcForm(p => ({ ...p, bonus_payable: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Other Deductions (₹)</label>
                    <input type="number" className="form-input" value={calcForm.pending_deductions} onChange={e => setCalcForm(p => ({ ...p, pending_deductions: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">NOC Status</label>
                    <select className="form-select" value={calcForm.noc_status} onChange={e => setCalcForm(p => ({ ...p, noc_status: e.target.value }))}>
                      <option value="PENDING">Pending</option>
                      <option value="CLEARED">Cleared</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-check"><input type="checkbox" checked={calcForm.asset_recovery} onChange={e => setCalcForm(p => ({ ...p, asset_recovery: e.target.checked }))} /> Asset Recovery</label>
                  </div>
                  {calcForm.asset_recovery && (
                    <div className="form-group">
                      <label className="form-label">Recovery Amount (₹)</label>
                      <input type="number" className="form-input" value={calcForm.asset_recovery_amount} onChange={e => setCalcForm(p => ({ ...p, asset_recovery_amount: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  )}
                </div>

                {result && (
                  <div style={{ marginTop: 16, padding: 16, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }}>
                    <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 700 }}>✅ Settlement Breakdown (DRAFT)</h4>
                    <div className="salary-breakdown">
                      <div className="salary-row salary-row--earning"><span className="salary-row-label">Leave Encashment ({result.details?.elBalance} days × {fmt(result.details?.dailyRate)}/day)</span><span className="salary-row-value">{fmt(result.settlement.leave_encashment)}</span></div>
                      <div className="salary-row salary-row--earning"><span className="salary-row-label">Gratuity</span><span className="salary-row-value">{fmt(result.settlement.gratuity)}</span></div>
                      <div className="salary-row salary-row--earning"><span className="salary-row-label">Bonus Payable</span><span className="salary-row-value">{fmt(result.settlement.bonus_payable)}</span></div>
                      <div className="salary-row salary-row--deduction"><span className="salary-row-label">Notice Period Recovery</span><span className="salary-row-value">- {fmt(result.settlement.notice_period_recovery)}</span></div>
                      <div className="salary-row salary-row--deduction"><span className="salary-row-label">Pending Deductions (Loans + Other)</span><span className="salary-row-value">- {fmt(result.settlement.pending_deductions)}</span></div>
                      <div className="salary-row salary-row--deduction"><span className="salary-row-label">Asset Recovery</span><span className="salary-row-value">- {fmt(result.settlement.asset_recovery_amount)}</span></div>
                      <div className="salary-row salary-row-total">
                        <span className="salary-row-label">Final Settlement Amount</span>
                        <span className="salary-row-value" style={{ color: result.settlement.final_amount >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 18 }}>{fmt(result.settlement.final_amount)}</span>
                      </div>
                    </div>
                    <div className="alert alert-info" style={{ marginTop: 12, fontSize: 12 }}>
                      Settlement saved as <strong>DRAFT</strong>. Approve & then Mark Paid (NEFT or Cheque) from the list.
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCalcModal(false)}>Close</button>
                {!result && <button type="submit" className="btn btn-primary">🧮 Calculate & Save Draft</button>}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && selectedSettlement && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">💳 Mark FNF Paid — {selectedSettlement.full_name}</h3>
              <button className="modal-close" onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <form onSubmit={submitPayment}>
              <div className="modal-body">
                <div className="alert alert-info" style={{ marginBottom: 16 }}>
                  Net Amount: <strong style={{ fontSize: 18 }}>{fmt(selectedSettlement.final_amount)}</strong>
                  {selectedSettlement.account_number && (
                    <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>
                      Beneficiary: {selectedSettlement.bank_name} · A/C {selectedSettlement.account_number} · {selectedSettlement.ifsc_code}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label form-label-required">Payment Mode</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['NEFT','IMPS','RTGS','CHEQUE','UPI','CASH'].map(mode => (
                      <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `2px solid ${payForm.payment_mode === mode ? 'var(--primary)' : 'var(--border-light)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: payForm.payment_mode === mode ? 'var(--primary-50, #eef5fa)' : 'white', fontWeight: 600, fontSize: 13 }}>
                        <input type="radio" name="payment_mode" value={mode} checked={payForm.payment_mode === mode} onChange={e => setPayForm(p => ({ ...p, payment_mode: e.target.value }))} />
                        {mode}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Payment Date</label>
                    <input type="date" className="form-input" value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} required />
                  </div>
                </div>

                {/* NEFT / IMPS / RTGS / UPI fields */}
                {['NEFT','IMPS','RTGS','UPI'].includes(payForm.payment_mode) && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label form-label-required">{payForm.payment_mode === 'UPI' ? 'UPI Transaction ID' : 'UTR Number'}</label>
                      <input className="form-input font-mono" placeholder={payForm.payment_mode === 'UPI' ? 'upi tx id' : 'e.g. SBIN123456789'} value={payForm.utr_number} onChange={e => setPayForm(p => ({ ...p, utr_number: e.target.value }))} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">From Bank Account</label>
                      <input className="form-input" placeholder="Payer's bank/account" value={payForm.from_bank_account} onChange={e => setPayForm(p => ({ ...p, from_bank_account: e.target.value }))} />
                    </div>
                  </div>
                )}

                {/* Cheque fields — each cheque tracked separately */}
                {payForm.payment_mode === 'CHEQUE' && (
                  <div style={{ padding: 12, background: 'var(--warning-bg, #fff8e6)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning-border, #f0c46f)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--warning, #b07900)' }}>📃 Cheque Details (each cheque tracked individually)</div>
                    <div className="form-row-3">
                      <div className="form-group">
                        <label className="form-label form-label-required">Cheque Number</label>
                        <input className="form-input font-mono" placeholder="e.g. 000123" value={payForm.cheque_number} onChange={e => setPayForm(p => ({ ...p, cheque_number: e.target.value }))} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Drawee Bank</label>
                        <input className="form-input" placeholder="e.g. SBI Jabalpur" value={payForm.cheque_bank} onChange={e => setPayForm(p => ({ ...p, cheque_bank: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Cheque Date</label>
                        <input type="date" className="form-input" value={payForm.cheque_date} onChange={e => setPayForm(p => ({ ...p, cheque_date: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Notes (optional)</label>
                  <textarea className="form-textarea" rows={2} value={payForm.payment_notes} onChange={e => setPayForm(p => ({ ...p, payment_notes: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowPayModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">💳 Confirm Payment ({payForm.payment_mode})</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
