'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function formatINR(amt) { return '₹' + Number(amt || 0).toLocaleString('en-IN'); }
function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Lakh', 'Crore'];
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '');
  // Indian numbering
  if (num < 100000) {
    const t = Math.floor(num / 1000);
    const r = num % 1000;
    return numberToWords(t) + ' Thousand' + (r ? ' ' + numberToWords(r) : '');
  }
  if (num < 10000000) {
    const l = Math.floor(num / 100000);
    const r = num % 100000;
    return numberToWords(l) + ' Lakh' + (r ? ' ' + numberToWords(r) : '');
  }
  const c = Math.floor(num / 10000000);
  const r = num % 10000000;
  return numberToWords(c) + ' Crore' + (r ? ' ' + numberToWords(r) : '');
}

export default function PayslipPage() {
  return (
    <Suspense fallback={<div className="page-loader"><div className="spinner"></div></div>}>
      <PayslipContent />
    </Suspense>
  );
}

const DEDUCTION_FIELDS = [
  { key: 'pf_deduction', label: 'Provident Fund (Employee)' },
  { key: 'esic_deduction', label: 'ESI (Employee)' },
  { key: 'pt_deduction', label: 'Professional Tax' },
  { key: 'tds_deduction', label: 'TDS' },
  { key: 'loan_deduction', label: 'Loan Deduction' },
  { key: 'advance_deduction', label: 'Advance Deduction' },
  { key: 'other_deductions', label: 'Other Deductions' },
];

function PayslipContent() {
  const searchParams = useSearchParams();
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/employees?company=${localStorage.getItem('active_company') || ''}&status=active`)
      .then(r => r.json())
      .then(d => {
        setEmployees(d.employees || []);
        const empFromUrl = searchParams.get('employee');
        if (empFromUrl) {
          setSelectedEmp(empFromUrl);
        }
      });
  }, [searchParams]);

  useEffect(() => {
    if (selectedEmp) {
      loadPayslip();
    }
  }, [selectedEmp, month, year]);

  const loadPayslip = async () => {
    setLoading(true); setError(''); setPayslip(null); setEditing(false);
    try {
      const res = await fetch(`/api/payslip?company=${localStorage.getItem('active_company') || ''}&employee=${selectedEmp}&month=${month}&year=${year}`);
      const d = await res.json();
      if (res.ok) {
        setPayslip(d.payslip);
      } else {
        setError(d.error || 'Payslip not found');
      }
    } catch (e) {
      setError('Failed to load payslip');
    }
    setLoading(false);
  };

  const handlePrint = () => window.print();

  const startEdit = () => {
    if (!payslip) return;
    setEdits({ ...payslip.editable });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEdits({});
  };

  const updateEdit = (key, raw) => {
    const num = raw === '' ? 0 : Number(raw);
    setEdits(prev => ({ ...prev, [key]: isNaN(num) ? 0 : num }));
  };

  const saveEdits = async () => {
    if (!payslip?.payrollId) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/payroll/${payslip.payrollId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Failed to save');
      } else {
        await loadPayslip();
      }
    } catch (e) {
      setError('Failed to save edits');
    }
    setSaving(false);
  };

  // Live totals while editing.
  const liveEarningsTotal = editing && payslip
    ? payslip.allEarnings.reduce((s, e) => s + (Number(edits[e.column]) || 0), 0)
    : payslip?.totalEarnings || 0;

  const liveDeductionsTotal = editing
    ? DEDUCTION_FIELDS.reduce((s, f) => s + (Number(edits[f.key]) || 0), 0)
    : payslip?.totalDeductions || 0;

  const liveEmployerTotal = editing
    ? (Number(edits.employer_pf) || 0) + (Number(edits.employer_esic) || 0)
    : (payslip?.employerContributions?.total || 0);

  const liveNetPayable = editing
    ? Math.max(liveEarningsTotal - liveDeductionsTotal - liveEmployerTotal, 0)
    : (payslip?.netPayable || 0);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="animate-fade-in">
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body { height: 100vh; margin: 0 !important; padding: 0 !important; overflow: hidden; background: white; }
          body * { visibility: hidden; }
          #payslip-preview, #payslip-preview * { visibility: visible; }
          #payslip-preview .no-print, #payslip-preview .no-print * { display: none !important; }
          #payslip-preview { 
            position: absolute; 
            left: 10mm; 
            top: 10mm; 
            width: calc(100% - 20mm); 
            max-width: none !important; 
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            page-break-inside: avoid;
            transform: scale(0.98);
            transform-origin: top left;
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🧾 Payslip</h1>
          <p className="page-subtitle">View and print employee payslips</p>
        </div>
        {payslip && !editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={startEdit} className="btn btn-secondary">✏️ Edit</button>
            <button onClick={handlePrint} className="btn btn-primary">🖨️ Print Payslip</button>
          </div>
        )}
        {payslip && editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={cancelEdit} className="btn btn-secondary" disabled={saving}>Cancel</button>
            <button onClick={saveEdits} className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : '💾 Save'}
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 200 }}>
              <label className="form-label">Employee</label>
              <select className="form-select" value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}>
                <option value="">Select Employee</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_code})</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 120 }}>
              <label className="form-label">Month</label>
              <select className="form-select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 100 }}>
              <label className="form-label">Year</label>
              <input type="number" className="form-input" value={year} onChange={e => setYear(parseInt(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      {loading && <div className="page-loader"><div className="spinner"></div></div>}
      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* Payslip Preview */}
      {payslip && (
        <div id="payslip-preview" className="card" style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="card-body" style={{ padding: 0 }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))',
              color: 'white', padding: '28px 32px', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{payslip.company.name}</h2>
                  <p style={{ fontSize: 13, opacity: 0.85 }}>{payslip.company.address}</p>
                  <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    PAN: {payslip.company.pan || '—'} | TAN: {payslip.company.tan || '—'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 1 }}>Payslip for</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{payslip.period.monthName} {payslip.period.year}</div>
                  <div style={{
                    marginTop: 8, padding: '3px 12px', borderRadius: 'var(--radius-full)',
                    fontSize: 11, fontWeight: 700,
                    background: payslip.status === 'PAID' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)',
                  }}>
                    {payslip.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Employee Details */}
            <div style={{ padding: '20px 32px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 13 }}>
                {[
                  ['Employee Name', payslip.employee.name],
                  ['Employee Code', payslip.employee.code],
                  ['Department', payslip.employee.department],
                  ['Designation', payslip.employee.designation],
                  ['Date of Joining', payslip.employee.doj],
                  ['PAN', payslip.employee.pan || '—'],
                  ['UAN', payslip.employee.uan || '—'],
                  ['ESI No.', payslip.employee.esicNumber || '—'],
                  ['PF No.', payslip.employee.pfNumber || '—'],
                  ['Bank A/C', payslip.employee.accountNumber ? `***${payslip.employee.accountNumber.slice(-4)}` : '—'],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Attendance */}
            <div style={{ padding: '16px 32px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 32, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Working Days: </span><strong>{payslip.attendance.workingDays}</strong></div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Days Present: </span><strong>{payslip.attendance.presentDays}</strong></div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>LWP (Leave without pay): </span><strong style={{ color: payslip.attendance.lwp > 0 ? 'var(--danger)' : 'inherit' }}>{payslip.attendance.lwp}</strong></div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Half Days: </span><strong>{payslip.attendance.halfDays}</strong></div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Holidays: </span><strong>{payslip.attendance.holidays}</strong></div>
              <div><span style={{ color: 'var(--text-tertiary)' }}>Sundays: </span><strong>{payslip.attendance.sundays}</strong></div>
            </div>

            {/* Earnings & Deductions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '0 32px' }}>
              {/* Earnings */}
              <div style={{ borderRight: '1px solid var(--border-light)', paddingRight: 24, paddingTop: 20, paddingBottom: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Earnings</h4>
                {(editing ? payslip.allEarnings : payslip.earnings).map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                    <span>{e.name}</span>
                    {editing ? (
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 110, textAlign: 'right', padding: '4px 8px', fontSize: 13 }}
                        value={edits[e.column] ?? 0}
                        onChange={ev => updateEdit(e.column, ev.target.value)}
                      />
                    ) : (
                      <span style={{ fontWeight: 600 }}>{formatINR(e.actual)}</span>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 14, fontWeight: 800, color: 'var(--success)' }}>
                  <span>Total Earnings</span>
                  <span>{formatINR(liveEarningsTotal)}</span>
                </div>
              </div>
              {/* Deductions */}
              <div style={{ paddingLeft: 24, paddingTop: 20, paddingBottom: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Deductions</h4>
                {editing ? (
                  DEDUCTION_FIELDS.map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                      <span>{f.label}</span>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 110, textAlign: 'right', padding: '4px 8px', fontSize: 13 }}
                        value={edits[f.key] ?? 0}
                        onChange={ev => updateEdit(f.key, ev.target.value)}
                      />
                    </div>
                  ))
                ) : (
                  <>
                    {payslip.deductions.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                        <span>{d.name}</span>
                        <span style={{ fontWeight: 600, color: 'var(--danger)' }}>{formatINR(d.amount)}</span>
                      </div>
                    ))}
                    {payslip.deductions.length === 0 && (
                      <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No deductions</p>
                    )}
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 14, fontWeight: 800, color: 'var(--danger)' }}>
                  <span>Total Deductions</span>
                  <span>{formatINR(liveDeductionsTotal)}</span>
                </div>
              </div>
            </div>

            {/* Employer-side fields — editable only, never displayed on the printed payslip */}
            {editing && (
              <div className="no-print" style={{ margin: '0 32px 16px', padding: '12px 16px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
                <div style={{ color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Employer contributions (subtracted from Net Payable in CTC mode — not shown on payslip)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Employer PF</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: 110, textAlign: 'right', padding: '4px 8px', fontSize: 13 }}
                      value={edits.employer_pf ?? 0}
                      onChange={ev => updateEdit('employer_pf', ev.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Employer ESIC</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: 110, textAlign: 'right', padding: '4px 8px', fontSize: 13 }}
                      value={edits.employer_esic ?? 0}
                      onChange={ev => updateEdit('employer_esic', ev.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Net Payable */}
            <div style={{
              margin: '0 32px', padding: '18px 24px', borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary-50), rgba(16,185,129,0.05))',
              border: '2px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Payable</div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  ({numberToWords(liveNetPayable)} Rupees Only)
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{formatINR(liveNetPayable)}</div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 32px', background: 'var(--gray-50)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              This is a computer-generated payslip and does not require a signature.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
