'use client';

import { useState, useEffect } from 'react';
import { useConfirm } from '@/components/ConfirmModal';
import { useToast } from '@/components/Toast';
import Link from 'next/link';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function PayrollPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [paySettings, setPaySettings] = useState({ default_payment_mode: 'NEFT', payer_bank_name: '', payer_account_number: '', next_cheque_number: '000001' });
  const [bulkUtr, setBulkUtr] = useState('');
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [payRows, setPayRows] = useState([]); // [{ payroll_id, employee, net, mode, utr, cheque_number, cheque_bank, cheque_date }]
  const [editingRecord, setEditingRecord] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const confirm = useConfirm();
  const toast = useToast();

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/payroll?company=${localStorage.getItem('active_company') || ''}&month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setSummary(d.summary || {}); setLoading(false); });
  };

  useEffect(fetchData, [month, year]);

  useEffect(() => {
    fetch('/api/settings/integrations')
      .then(r => r.json())
      .then(d => { if (d.settings) setPaySettings(prev => ({ ...prev, ...d.settings })); });
  }, []);

  const processPayroll = async () => {
    setProcessing(true); setMsg('');
    const res = await fetch('/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: localStorage.getItem('active_company') || '', month, year }),
    });
    const data = await res.json();
    setProcessing(false);
    if (data.success) {
      toast.success(`Payroll processed for ${data.processedCount} employees`);
      fetchData();
    } else {
      toast.error(data.error || 'Processing failed');
    }
  };

  const approvePayroll = async () => {
    const ok = await confirm({
      title: 'Approve Payroll',
      message: `Are you sure you want to approve payroll for ${summary.draftCount} employee(s) for ${MONTHS[month]} ${year}? This action cannot be undone.`,
      confirmText: 'Yes, Approve',
      variant: 'success',
      icon: '✅',
    });
    if (!ok) return;

    const res = await fetch('/api/payroll', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', month, year, company_id: localStorage.getItem('active_company') || '' }),
    });
    if ((await res.json()).success) {
      toast.success('Payroll approved successfully');
      fetchData();
    }
  };

  const openManualPay = () => {
    const approved = records.filter(r => r.status === 'APPROVED');
    if (approved.length === 0) { toast.info('No approved records to pay'); return; }
    const defaultMode = paySettings.default_payment_mode || 'NEFT';
    let chequeSeed = parseInt(paySettings.next_cheque_number, 10);
    if (isNaN(chequeSeed)) chequeSeed = 1;
    setPayRows(approved.map(r => ({
      payroll_id: r.id,
      employee_id: r.employee_id,
      full_name: r.full_name,
      employee_code: r.employee_code,
      net_salary: r.net_salary,
      mode: defaultMode,
      utr: '',
      cheque_number: '',
      cheque_bank: paySettings.payer_bank_name || '',
      cheque_date: new Date().toISOString().split('T')[0],
    })));
    setBulkUtr('');
    setBulkDate(new Date().toISOString().split('T')[0]);
    setShowPayModal(true);
  };

  const setRowMode = (idx, mode) => {
    setPayRows(rows => rows.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, mode };
      if (mode === 'CHEQUE' && !updated.cheque_number) {
        // Auto-suggest cheque numbers, incrementing across rows
        const used = rows.filter((rr, j) => j !== idx && rr.mode === 'CHEQUE' && rr.cheque_number).map(rr => parseInt(rr.cheque_number, 10)).filter(n => !isNaN(n));
        const seed = parseInt(paySettings.next_cheque_number, 10) || 1;
        const next = (used.length > 0 ? Math.max(...used) + 1 : seed);
        updated.cheque_number = String(next).padStart((paySettings.next_cheque_number || '000001').length, '0');
      }
      return updated;
    }));
  };

  const setRowField = (idx, field, value) => {
    setPayRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const applyBulkUtr = () => {
    if (!bulkUtr) { toast.error('Enter a UTR / batch reference first'); return; }
    setPayRows(rows => rows.map(r => (['NEFT','IMPS','RTGS'].includes(r.mode) && !r.utr) ? { ...r, utr: bulkUtr } : r));
    toast.info(`Applied UTR to all NEFT/IMPS/RTGS rows`);
  };

  const submitManualPay = async () => {
    // Validate
    for (const r of payRows) {
      if (['NEFT','IMPS','RTGS','UPI'].includes(r.mode) && !r.utr) {
        toast.error(`${r.full_name}: ${r.mode} reference required`); return;
      }
      if (r.mode === 'CHEQUE' && !r.cheque_number) {
        toast.error(`${r.full_name}: cheque number required`); return;
      }
    }

    const payload = {
      month, year,
      company_id: localStorage.getItem('active_company') || '',
      payments: payRows.map(r => ({
        payroll_id: r.payroll_id,
        payment_mode: r.mode,
        payment_date: bulkDate,
        utr_number: r.utr || null,
        cheque_number: r.cheque_number || null,
        cheque_bank: r.cheque_bank || null,
        cheque_date: r.cheque_date || null,
        from_bank_account: paySettings.payer_account_number ? `${paySettings.payer_bank_name} • ${paySettings.payer_account_number}` : (paySettings.payer_bank_name || null),
      })),
    };

    const res = await fetch('/api/payroll/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`Recorded ${data.recorded} payment(s)`);
      setShowPayModal(false);
      fetchData();
      // Refresh paySettings to pick up bumped cheque number
      fetch('/api/settings/integrations').then(r => r.json()).then(d => { if (d.settings) setPaySettings(prev => ({ ...prev, ...d.settings })); });
    } else {
      toast.error(data.error || 'Failed to record payments');
    }
  };

  const payViaRazorpay = async () => {
    const ok = await confirm({
      title: 'Initiate Razorpay Payouts',
      message: `Do you want to disburse ₹${summary.totalNet.toLocaleString('en-IN')} to ${summary.approvedCount} employees natively via RazorpayX? This will simulate real API limits.`,
      confirmText: 'Pay via Razorpay',
      confirmVariant: 'accent'
    });
    if (!ok) return;

    setProcessing(true);
    const res = await fetch('/api/payroll/razorpay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year, company_id: localStorage.getItem('active_company') || '' }),
    });
    setProcessing(false);
    
    if (res.ok) {
      toast.success('Razorpay disbursement initiated successfully!');
      fetchData();
    } else {
      toast.error('Razorpay API failed or timing out');
    }
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setEditFormData({
      total_working_days: record.total_working_days || 0,
      paid_days: record.paid_days !== undefined && record.paid_days !== null ? record.paid_days : (record.total_working_days || 0),
      basic_salary: record.basic_salary || 0,
      hra: record.hra || 0,
      conveyance: record.conveyance || 0,
      medical: record.medical || 0,
      special_allowance: record.special_allowance || 0,
      gross_earnings: record.gross_earnings || 0,
      pf_deduction: record.pf_deduction || 0,
      esic_deduction: record.esic_deduction || 0,
      pt_deduction: record.pt_deduction || 0,
      tds_deduction: record.tds_deduction || 0,
      loan_deduction: record.loan_deduction || 0,
      advance_deduction: record.advance_deduction || 0,
      other_deductions: record.other_deductions || 0,
    });
  };

  const handleDaysChange = (field, value) => {
    setEditFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      const oldPaid = Number(editingRecord.paid_days) || 0;
      const oldTotal = Number(editingRecord.total_working_days) || 26;
      const newPaid = Number(updated.paid_days) || 0;
      const newTotal = Number(updated.total_working_days) || 26;
      
      if (oldPaid > 0 && oldTotal > 0 && newTotal > 0) {
        // Only trigger recalculation if the ratio actually changed
        if (newPaid !== oldPaid || newTotal !== oldTotal) {
          const recalc = (code, fallbackValue) => {
            const fullAmt = editingRecord.full_components?.[code];
            if (fullAmt !== undefined) {
              return Math.round((fullAmt / newTotal) * newPaid);
            }
            // Fallback to reverse calculation if full_components isn't available
            if (!fallbackValue) return 0;
            const reversedFullAmt = (fallbackValue * oldTotal) / oldPaid;
            return Math.round((reversedFullAmt / newTotal) * newPaid);
          };
          
          updated.basic_salary = recalc('BASIC', editingRecord.basic_salary);
          updated.hra = recalc('HRA', editingRecord.hra);
          updated.conveyance = recalc('CONV', editingRecord.conveyance);
          updated.medical = recalc('MED', editingRecord.medical);
          updated.special_allowance = recalc('SPL', editingRecord.special_allowance);
          
          updated.gross_earnings = updated.basic_salary + updated.hra + updated.conveyance + updated.medical + updated.special_allowance;
          
          // Re-calculate deductions
          updated.pf_deduction = Math.round(updated.basic_salary * 0.12);
          
          const fullGross = (editingRecord.gross_earnings * oldTotal) / oldPaid;
          if (fullGross <= 21000) {
            updated.esic_deduction = Math.round(updated.gross_earnings * 0.0075);
          } else {
            updated.esic_deduction = 0;
          }
        }
      }
      return updated;
    });
  };

  const submitEdit = async () => {
    setProcessing(true);
    const res = await fetch(`/api/payroll/${editingRecord.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editFormData),
    });
    setProcessing(false);
    if (res.ok) {
      toast.success('Record updated successfully');
      setEditingRecord(null);
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Update failed');
    }
  };


  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🔄 Run Payroll</h1>
          <p className="page-subtitle">Process monthly payroll for {MONTHS[month]} {year}</p>
        </div>
        <div className="page-actions">
          <select className="form-select" style={{ width: 140 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <input type="number" className="form-input" style={{ width: 90 }} value={year} onChange={e => setYear(parseInt(e.target.value))} />
        </div>
      </div>

      {msg && <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>{msg}</div>}

      {/* Action Buttons */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={processPayroll} disabled={processing}>
            {processing ? '⏳ Processing...' : '🔄 Process Payroll'}
          </button>
          {summary.draftCount > 0 && (
            <button className="btn btn-success" onClick={approvePayroll}>✅ Approve All ({summary.draftCount} draft)</button>
          )}
          {summary.approvedCount > 0 && (
            <div style={{ display: 'flex', gap: 8, background: 'var(--gray-50)', padding: 4, borderRadius: 'var(--radius-md)' }}>
              <button className="btn btn-primary btn-sm" onClick={openManualPay}>💳 Pay {summary.approvedCount} ({paySettings.default_payment_mode})</button>
              <button className="btn btn-accent btn-sm" onClick={payViaRazorpay}>🚀 RazorpayX</button>
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <span className="badge badge-neutral">Draft: {summary.draftCount || 0}</span>
            <span className="badge badge-success">Approved: {summary.approvedCount || 0}</span>
            <span className="badge badge-info">Paid: {summary.paidCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {records.length > 0 && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card stat-card--success">
            <div><div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(summary.totalGross)}</div><div className="stat-label">Gross Earnings</div></div>
          </div>
          <div className="stat-card stat-card--danger">
            <div><div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(summary.totalDeductions)}</div><div className="stat-label">Total Deductions</div></div>
          </div>
          <div className="stat-card stat-card--primary">
            <div><div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(summary.totalNet)}</div><div className="stat-label">Net Payable</div></div>
          </div>
          <div className="stat-card stat-card--purple">
            <div><div className="stat-value currency" style={{ fontSize: 20 }}>{fmt(summary.employerPF + summary.employerESIC)}</div><div className="stat-label">Employer Contributions</div></div>
          </div>
        </div>
      )}

      {/* Statutory Summary */}
      {records.length > 0 && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
          <div className="stat-card stat-card--info"><div><div className="stat-value currency" style={{ fontSize: 18 }}>{fmt(summary.totalPF)}</div><div className="stat-label">PF (Employee)</div></div></div>
          <div className="stat-card stat-card--warning"><div><div className="stat-value currency" style={{ fontSize: 18 }}>{fmt(summary.totalESIC)}</div><div className="stat-label">ESIC (Employee)</div></div></div>
          <div className="stat-card stat-card--accent"><div><div className="stat-value currency" style={{ fontSize: 18 }}>{fmt(summary.totalPT)}</div><div className="stat-label">Prof. Tax</div></div></div>
          <div className="stat-card stat-card--danger"><div><div className="stat-value currency" style={{ fontSize: 18 }}>{fmt(summary.totalTDS)}</div><div className="stat-label">TDS</div></div></div>
        </div>
      )}

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : records.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="table-empty">
              <div className="table-empty-icon">📋</div>
              <p>No payroll processed for {MONTHS[month]} {year}</p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>Click "Process Payroll" to auto-calculate salaries for all employees</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 2 }}>Employee</th>
                  <th>Days</th>
                  <th style={{ textAlign: 'right' }}>Basic</th>
                  <th style={{ textAlign: 'right' }}>HRA</th>
                  <th style={{ textAlign: 'right' }}>Gross</th>
                  <th style={{ textAlign: 'right' }}>PF</th>
                  <th style={{ textAlign: 'right' }}>ESIC</th>
                  <th style={{ textAlign: 'right' }}>PT</th>
                  <th style={{ textAlign: 'right' }}>TDS</th>
                  <th style={{ textAlign: 'right' }}>Loan</th>
                  <th style={{ textAlign: 'right' }}>Total Ded.</th>
                  <th style={{ textAlign: 'right', fontWeight: 800 }}>Net Salary</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1, minWidth: 160 }}>
                      <Link href={`/employees/${r.employee_id}`} style={{ textDecoration: 'none', color: 'var(--primary)' }}><strong>{r.full_name}</strong></Link>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code}</div>
                    </td>
                    <td>{r.paid_days}/{r.total_working_days}</td>
                    <td className="currency text-right">{fmt(r.basic_salary)}</td>
                    <td className="currency text-right">{fmt(r.hra)}</td>
                    <td className="currency text-right font-bold text-success">{fmt(r.gross_earnings)}</td>
                    <td className="currency text-right text-danger">{fmt(r.pf_deduction)}</td>
                    <td className="currency text-right text-danger">{fmt(r.esic_deduction)}</td>
                    <td className="currency text-right text-danger">{fmt(r.pt_deduction)}</td>
                    <td className="currency text-right text-danger">{fmt(r.tds_deduction)}</td>
                    <td className="currency text-right text-danger">{fmt(r.loan_deduction)}</td>
                    <td className="currency text-right font-bold text-danger">{fmt(r.total_deductions)}</td>
                    <td className="currency text-right" style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>{fmt(r.net_salary)}</td>
                    <td>
                      <span className={`badge ${r.status === 'PAID' ? 'badge-success' : r.status === 'APPROVED' ? 'badge-info' : 'badge-warning'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {(r.status === 'APPROVED' || r.status === 'PAID') && (
                          <Link href={`/payslip?employee=${r.employee_id}&month=${month}&year=${year}`} className="btn btn-ghost btn-sm" title="View Payslip">
                            🧾
                          </Link>
                        )}
                        {r.status === 'DRAFT' && (
                          <button className="btn btn-ghost btn-sm" title="Edit Record" onClick={() => openEditModal(r)}>
                            ✏️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 1 }}>TOTAL ({records.length} employees)</td>
                  <td></td>
                  <td className="currency text-right">{fmt(records.reduce((s, r) => s + r.basic_salary, 0))}</td>
                  <td className="currency text-right">{fmt(records.reduce((s, r) => s + r.hra, 0))}</td>
                  <td className="currency text-right text-success">{fmt(summary.totalGross)}</td>
                  <td className="currency text-right text-danger">{fmt(summary.totalPF)}</td>
                  <td className="currency text-right text-danger">{fmt(summary.totalESIC)}</td>
                  <td className="currency text-right text-danger">{fmt(summary.totalPT)}</td>
                  <td className="currency text-right text-danger">{fmt(summary.totalTDS)}</td>
                  <td className="currency text-right text-danger">{fmt(records.reduce((s, r) => s + r.loan_deduction, 0))}</td>
                  <td className="currency text-right text-danger">{fmt(summary.totalDeductions)}</td>
                  <td className="currency text-right" style={{ fontSize: 15, color: 'var(--primary)' }}>{fmt(summary.totalNet)}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Manual Pay Modal — NEFT bulk + per-row Cheque */}
      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" style={{ maxWidth: 1100 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">💳 Record Payments — {MONTHS[month]} {year}</h3>
              <button className="modal-close" onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info" style={{ marginBottom: 12, fontSize: 13 }}>
                Default mode is <strong>{paySettings.default_payment_mode}</strong>. NEFT/IMPS/RTGS rows can share a batch UTR. Each cheque is tracked separately with its own number, drawee bank and date.
              </div>

              {/* Bulk controls */}
              <div className="card" style={{ marginBottom: 12, background: 'var(--gray-50)' }}>
                <div className="card-body" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
                      <label className="form-label">Payment Date</label>
                      <input type="date" className="form-input" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                      <label className="form-label">Bulk UTR (apply to all NEFT/IMPS/RTGS rows)</label>
                      <input className="form-input font-mono" placeholder="e.g. SBINH26041234567" value={bulkUtr} onChange={e => setBulkUtr(e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-outline" onClick={applyBulkUtr}>Apply UTR</button>
                  </div>
                  {paySettings.payer_account_number && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Payer: <strong>{paySettings.payer_bank_name}</strong> · A/C {paySettings.payer_account_number} · {paySettings.payer_ifsc}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th style={{ textAlign: 'right' }}>Net</th>
                      <th>Mode</th>
                      <th>UTR / Reference</th>
                      <th>Cheque No.</th>
                      <th>Drawee Bank</th>
                      <th>Cheque Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payRows.map((r, i) => (
                      <tr key={r.payroll_id}>
                        <td>
                          <div><strong>{r.full_name}</strong></div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code}</div>
                        </td>
                        <td className="currency text-right" style={{ fontWeight: 700 }}>{fmt(r.net_salary)}</td>
                        <td>
                          <select className="form-select" value={r.mode} onChange={e => setRowMode(i, e.target.value)} style={{ minWidth: 110 }}>
                            <option>NEFT</option>
                            <option>IMPS</option>
                            <option>RTGS</option>
                            <option>UPI</option>
                            <option>CHEQUE</option>
                            <option>CASH</option>
                          </select>
                        </td>
                        <td>
                          {['NEFT','IMPS','RTGS','UPI'].includes(r.mode) ? (
                            <input className="form-input font-mono" placeholder={r.mode === 'UPI' ? 'UPI tx id' : 'UTR'} value={r.utr} onChange={e => setRowField(i, 'utr', e.target.value)} style={{ minWidth: 150 }} />
                          ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td>
                          {r.mode === 'CHEQUE' ? (
                            <input className="form-input font-mono" placeholder="000123" value={r.cheque_number} onChange={e => setRowField(i, 'cheque_number', e.target.value)} style={{ minWidth: 100 }} />
                          ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td>
                          {r.mode === 'CHEQUE' ? (
                            <input className="form-input" placeholder="Drawee bank" value={r.cheque_bank} onChange={e => setRowField(i, 'cheque_bank', e.target.value)} style={{ minWidth: 130 }} />
                          ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                        <td>
                          {r.mode === 'CHEQUE' ? (
                            <input type="date" className="form-input" value={r.cheque_date} onChange={e => setRowField(i, 'cheque_date', e.target.value)} />
                          ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                      <td>TOTAL ({payRows.length})</td>
                      <td className="currency text-right">{fmt(payRows.reduce((s, r) => s + r.net_salary, 0))}</td>
                      <td colSpan={5} style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        NEFT: {payRows.filter(r => ['NEFT','IMPS','RTGS','UPI'].includes(r.mode)).length}  ·  Cheque: {payRows.filter(r => r.mode === 'CHEQUE').length}  ·  Cash: {payRows.filter(r => r.mode === 'CASH').length}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitManualPay}>💳 Record Payments</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payroll Record Modal */}
      {editingRecord && (
        <div className="modal-overlay" onClick={() => setEditingRecord(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">✏️ Edit Payroll - {editingRecord.full_name}</h3>
              <button className="modal-close" onClick={() => setEditingRecord(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                You are manually overriding the calculated deductions/earnings for this employee.
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Total Working Days</label>
                  <input type="number" className="form-input" value={editFormData.total_working_days} onChange={e => handleDaysChange('total_working_days', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Paid Days</label>
                  <input type="number" className="form-input" value={editFormData.paid_days} onChange={e => handleDaysChange('paid_days', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Basic Salary</label>
                  <input type="number" className="form-input" value={editFormData.basic_salary} onChange={e => setEditFormData({ ...editFormData, basic_salary: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">HRA</label>
                  <input type="number" className="form-input" value={editFormData.hra} onChange={e => setEditFormData({ ...editFormData, hra: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Gross Earnings</label>
                  <input type="number" className="form-input" value={editFormData.gross_earnings} onChange={e => setEditFormData({ ...editFormData, gross_earnings: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">PF Deduction</label>
                  <input type="number" className="form-input" value={editFormData.pf_deduction} onChange={e => setEditFormData({ ...editFormData, pf_deduction: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">ESIC Deduction</label>
                  <input type="number" className="form-input" value={editFormData.esic_deduction} onChange={e => setEditFormData({ ...editFormData, esic_deduction: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">PT Deduction</label>
                  <input type="number" className="form-input" value={editFormData.pt_deduction} onChange={e => setEditFormData({ ...editFormData, pt_deduction: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">TDS Deduction</label>
                  <input type="number" className="form-input" value={editFormData.tds_deduction} onChange={e => setEditFormData({ ...editFormData, tds_deduction: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Other Deductions</label>
                  <input type="number" className="form-input" value={editFormData.other_deductions} onChange={e => setEditFormData({ ...editFormData, other_deductions: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setEditingRecord(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitEdit} disabled={processing}>
                {processing ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
