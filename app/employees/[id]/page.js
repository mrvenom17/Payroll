'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

const COLORS = ['#1B4D6E','#2A6F97','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#FF6B35'];

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';
}

export default function EmployeeDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('personal');
  const [investments, setInvestments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [savingInv, setSavingInv] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [allComponents, setAllComponents] = useState([]);
  const [structForm, setStructForm] = useState({ effective_from: '', amounts: {} });
  const [savingStruct, setSavingStruct] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees/${id}`).then(r => r.json()),
      fetch(`/api/investments?employee_id=${id}`).then(r => r.json()),
      fetch(`/api/upload?entity_id=${id}`).then(r => r.json())
    ]).then(([empData, invData, docData]) => {
      setData(empData);
      setInvestments(invData.declarations || []);
      setDocuments(docData.documents || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>;
  }

  if (!data?.employee) {
    return <div className="alert alert-danger">Employee not found</div>;
  }

  const emp = data.employee;
  const salary = data.salaryStructure;

  const tabs = [
    { id: 'personal', label: '👤 Personal', icon: '👤' },
    { id: 'employment', label: '💼 Employment', icon: '💼' },
    { id: 'statutory', label: '🏛️ Statutory', icon: '🏛️' },
    { id: 'salary', label: '💰 Salary', icon: '💰' },
    { id: 'bank', label: '🏦 Bank', icon: '🏦' },
    { id: 'attendance', label: '📅 Attendance', icon: '📅' },
    { id: 'investments', label: '📈 Investments', icon: '📈' },
    { id: 'documents', label: '📂 Documents', icon: '📂' },
  ];

  const handleSaveInvestments = async (e) => {
    e.preventDefault();
    setSavingInv(true);
    try {
      const res = await fetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: id, financial_year: '2024-2025', declarations: investments }),
      });
      if (res.ok) toast.success('Investments saved successfully!');
      else toast.error('Failed to save investments');
    } catch(err) {
      toast.error('Network error while saving');
    }
    setSavingInv(false);
  };

  const updateInv = (idx, value) => {
    const newInv = [...investments];
    newInv[idx].amount = value;
    setInvestments(newInv);
  };

  const addInv = () => {
    setInvestments([...investments, { section: '80C', type: 'Life Insurance', amount: '' }]);
  };

  const openStructureEditor = async () => {
    if (allComponents.length === 0) {
      try {
        const res = await fetch('/api/salary-components');
        const d = await res.json();
        setAllComponents((d.components || []).filter(c => c.type === 'EARNING' && c.is_active !== 0));
      } catch (e) { toast.error('Could not load components'); return; }
    }
    const amounts = {};
    (data.salaryStructure?.components || []).forEach(c => {
      if (c.type === 'EARNING') amounts[c.code] = c.monthly;
    });
    setStructForm({
      effective_from: data.salaryStructure?.effective_from || new Date().toISOString().split('T')[0],
      amounts,
    });
    setShowStructureModal(true);
  };

  const saveStructure = async () => {
    setSavingStruct(true);
    const components = Object.entries(structForm.amounts).map(([code, monthly_amount]) => ({ code, monthly_amount: Number(monthly_amount) || 0 }));
    const res = await fetch('/api/salary-structures', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: id, effective_from: structForm.effective_from, components }),
    });
    const resp = await res.json();
    setSavingStruct(false);
    if (resp.success) {
      toast.success(`Structure saved · CTC ₹${resp.ctc_annual.toLocaleString('en-IN')}/yr`);
      setShowStructureModal(false);
      // Refetch detail
      const refetch = await fetch(`/api/employees/${id}`).then(r => r.json());
      setData(refetch);
    } else {
      toast.error(resp.error || 'Save failed');
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    const file = e.target.file.files[0];
    const tag = e.target.tag.value;
    if (!file || !tag) return toast.error('Check form');

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tag', tag);
    fd.append('entity_type', 'employee');
    fd.append('entity_id', id);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        toast.success('File uploaded');
        setDocuments([data.document, ...documents]);
        e.target.reset();
      } else toast.error('Upload failed');
    } catch(err) {
      toast.error('Network error');
    }
    setUploading(false);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 16 }}>
        <Link href="/employees" className="btn btn-ghost btn-sm">← Back to Employees</Link>
      </div>

      {/* Profile Header */}
      <div className="profile-header">
        <div className="profile-avatar">
          {getInitials(emp.full_name)}
        </div>
        <div className="profile-details">
          <h2>{emp.full_name}</h2>
          <div className="profile-meta">
            <span className="profile-meta-item">🏷️ {emp.employee_code}</span>
            <span className="profile-meta-item">💼 {emp.designation || '—'}</span>
            <span className="profile-meta-item">🏢 {emp.department_name || '—'}</span>
            <span className="profile-meta-item">📍 {emp.work_location || '—'}</span>
            <span className={`badge ${emp.is_active ? 'badge-success' : 'badge-danger'}`} style={{ color: 'white', background: emp.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }}>
              {emp.is_active ? '● Active' : '● Exited'}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link href={`/employees/${id}/edit`} className="btn" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
            ✏️ Edit
          </Link>
          {emp.is_active && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete Employee?',
                  message: `This marks ${emp.full_name} (${emp.employee_code}) as exited. Payroll, attendance and payslip history are preserved. Use Edit → set Exit Date if you also want to trigger FNF settlement.`,
                  confirmText: 'Yes, Delete',
                  variant: 'danger',
                  icon: '🗑️',
                });
                if (!ok) return;
                const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
                const d = await res.json();
                if (d.success) {
                  toast.success(`${emp.full_name} deleted`);
                  router.push('/employees');
                } else {
                  toast.error(d.error || 'Delete failed');
                }
              }}
              className="btn"
              style={{ background: 'rgba(239,68,68,0.25)', color: 'white', border: '1px solid rgba(239,68,68,0.35)' }}
            >🗑️ Delete</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="card">
        <div className="card-body animate-fade-in">

          {activeTab === 'personal' && (
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Full Name</span>
                <span className="detail-value">{emp.full_name}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Father / Spouse Name</span>
                <span className="detail-value">{emp.father_spouse_name || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Date of Birth</span>
                <span className="detail-value">{formatDate(emp.date_of_birth)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Gender</span>
                <span className="detail-value">{emp.gender}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Mobile Number</span>
                <span className="detail-value">{emp.mobile_number || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Email ID</span>
                <span className="detail-value">{emp.email_id || '—'}</span>
              </div>
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Current Address</span>
                <span className="detail-value">{emp.current_address || '—'}</span>
              </div>
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Permanent Address</span>
                <span className="detail-value">{emp.permanent_address || '—'}</span>
              </div>
            </div>
          )}

          {activeTab === 'employment' && (
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Employee Code</span>
                <span className="detail-value font-mono">{emp.employee_code}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Joining Date</span>
                <span className="detail-value">{formatDate(emp.joining_date)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Department</span>
                <span className="detail-value">{emp.department_name || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Designation</span>
                <span className="detail-value">{emp.designation || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Reporting Manager</span>
                <span className="detail-value">{emp.reporting_manager_name || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Employment Type</span>
                <span className="detail-value">
                  <span className={`badge ${emp.employment_type === 'Permanent' ? 'badge-success' : emp.employment_type === 'Contract' ? 'badge-warning' : 'badge-info'}`}>
                    {emp.employment_type}
                  </span>
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Work Location</span>
                <span className="detail-value">{emp.work_location || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Skill Category</span>
                <span className="detail-value">{emp.skill_category || '—'}</span>
              </div>
              {emp.probation_end_date && (
                <div className="detail-item">
                  <span className="detail-label">Probation End Date</span>
                  <span className="detail-value">{formatDate(emp.probation_end_date)}</span>
                </div>
              )}
              {!emp.is_active && (
                <>
                  <div className="detail-item">
                    <span className="detail-label">Exit Date</span>
                    <span className="detail-value text-danger">{formatDate(emp.exit_date)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Exit Reason</span>
                    <span className="detail-value text-danger">{emp.exit_reason || '—'}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'statutory' && (
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">PAN Number</span>
                <span className="detail-value font-mono">{emp.pan_number || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Aadhaar Number</span>
                <span className="detail-value font-mono">{emp.aadhaar_number || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">UAN</span>
                <span className="detail-value font-mono">{emp.uan || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">PF Number</span>
                <span className="detail-value font-mono">{emp.pf_number || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">ESIC Number</span>
                <span className="detail-value font-mono">{emp.esic_number || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">PT State</span>
                <span className="detail-value">{emp.pt_state || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Tax Regime</span>
                <span className="detail-value">
                  <span className={`badge ${emp.tax_regime === 'NEW' ? 'badge-info' : 'badge-warning'}`}>
                    {emp.tax_regime === 'NEW' ? 'New Regime' : 'Old Regime'}
                  </span>
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">LWF Applicable</span>
                <span className="detail-value">{emp.lwf_applicable ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">TDS Applicable</span>
                <span className="detail-value">{emp.tds_applicable ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Previous Employer Income</span>
                <span className="detail-value currency">{formatCurrency(emp.previous_employer_income)}</span>
              </div>
            </div>
          )}

          {activeTab === 'salary' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>💰 Salary Structure</h3>
                <button className="btn btn-primary btn-sm" onClick={openStructureEditor}>
                  {salary ? '✏️ Edit Structure' : '➕ Create Structure'}
                </button>
              </div>
              {salary ? (
                <>
                  <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 24 }}>
                    <div className="stat-card stat-card--primary">
                      <div>
                        <div className="stat-value currency" style={{ fontSize: 22 }}>{formatCurrency(salary.ctc_annual)}</div>
                        <div className="stat-label">Annual CTC</div>
                      </div>
                    </div>
                    <div className="stat-card stat-card--success">
                      <div>
                        <div className="stat-value currency" style={{ fontSize: 22 }}>{formatCurrency(salary.ctc_monthly)}</div>
                        <div className="stat-label">Monthly CTC</div>
                      </div>
                    </div>
                    <div className="stat-card stat-card--info">
                      <div>
                        <div className="stat-value" style={{ fontSize: 16 }}>{formatDate(salary.effective_from)}</div>
                        <div className="stat-label">Effective From</div>
                      </div>
                    </div>
                  </div>

                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Component Breakdown (Monthly)</h4>

                  {/* Earnings */}
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 10 }}>EARNINGS</h4>
                    <div className="salary-breakdown">
                      {salary.components?.filter(c => c.type === 'EARNING').map(comp => (
                        <div key={comp.code} className="salary-row salary-row--earning">
                          <span className="salary-row-label">{comp.name}</span>
                          <span className="salary-row-value">{formatCurrency(comp.monthly)}</span>
                        </div>
                      ))}
                      <div className="salary-row salary-row-total">
                        <span className="salary-row-label">Total Earnings</span>
                        <span className="salary-row-value text-success">
                          {formatCurrency(salary.components?.filter(c => c.type === 'EARNING').reduce((s, c) => s + c.monthly, 0))}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="table-empty">
                  <div className="table-empty-icon">💰</div>
                  <p>No salary structure assigned yet</p>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={openStructureEditor}>
                    ➕ Create Structure
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'bank' && (
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Bank Name</span>
                <span className="detail-value">{emp.bank_name || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Account Number</span>
                <span className="detail-value font-mono">{emp.account_number || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">IFSC Code</span>
                <span className="detail-value font-mono">{emp.ifsc_code || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Branch Name</span>
                <span className="detail-value">{emp.branch_name || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Payment Mode</span>
                <span className="detail-value">{emp.payment_mode || '—'}</span>
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <div>
              {data.attendance?.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Working Days</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Paid Leave</th>
                      <th>Unpaid Leave</th>
                      <th>OT Hours</th>
                      <th>CL / SL / EL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attendance.map(att => {
                      const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      return (
                        <tr key={att.id}>
                          <td>{months[att.month]} {att.year}</td>
                          <td>{att.total_working_days}</td>
                          <td className="text-success font-bold">{att.present_days}</td>
                          <td className={att.absent_days > 0 ? 'text-danger font-bold' : ''}>{att.absent_days}</td>
                          <td>{att.paid_leaves}</td>
                          <td className={att.unpaid_leaves > 0 ? 'text-danger' : ''}>{att.unpaid_leaves}</td>
                          <td>{att.overtime_hours}</td>
                          <td>
                            <span className="badge badge-success" style={{ marginRight: 4 }}>CL:{att.cl_balance}</span>
                            <span className="badge badge-info" style={{ marginRight: 4 }}>SL:{att.sl_balance}</span>
                            <span className="badge badge-warning">EL:{att.el_balance}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="table-empty">
                  <div className="table-empty-icon">📅</div>
                  <p>No attendance records found</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'investments' && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                Declare investments here to compute accurate TDS during payroll processing.
              </div>
              <form onSubmit={handleSaveInvestments}>
                <div style={{ display: 'grid', gap: 16, marginBottom: 20 }}>
                  {investments.map((inv, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <select className="form-select" style={{ flex: 1 }} value={inv.section} onChange={e => {
                        const newInv = [...investments]; newInv[idx].section = e.target.value; setInvestments(newInv);
                      }}>
                        <option value="80C">Section 80C (Max ₹1.5L)</option>
                        <option value="80D">Section 80D (Medical)</option>
                        <option value="HRA">HRA Exemption</option>
                        <option value="80E">Section 80E (Education Loan)</option>
                      </select>
                      <input className="form-input" style={{ flex: 2 }} placeholder="Investment Type (e.g. LIC, PPF, Rent)" value={inv.type || ''} onChange={e => {
                        const newInv = [...investments]; newInv[idx].type = e.target.value; setInvestments(newInv);
                      }} required />
                      <input type="number" className="form-input" style={{ flex: 1 }} placeholder="Amount" value={inv.declared_amount || inv.amount || ''} onChange={e => updateInv(idx, e.target.value)} required />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                        const newInv = [...investments]; newInv.splice(idx, 1); setInvestments(newInv);
                      }}>Trash</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="btn btn-outline" onClick={addInv}>+ Add Declaration</button>
                  <button type="submit" className="btn btn-success" disabled={savingInv}>{savingInv ? '⏳ Saving...' : '💾 Save Declarations'}</button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'documents' && (
            <div>
              <div className="card" style={{ marginBottom: 24, background: 'var(--gray-50)' }}>
                <div className="card-body">
                  <h4 style={{ marginBottom: 16, fontSize: 14 }}>📤 Upload New Document</h4>
                  <form onSubmit={handleFileUpload} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <select name="tag" className="form-select" style={{ width: 200 }} required>
                      <option value="">Select Document Type</option>
                      <option value="PAN_CARD">PAN Card</option>
                      <option value="AADHAAR">Aadhaar Card</option>
                      <option value="OFFER_LETTER">Offer Letter</option>
                      <option value="RELIEVING_LETTER">Relieving Letter</option>
                      <option value="TAX_PROOF">Tax/Investment Proof</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input type="file" name="file" className="form-input" style={{ flex: 1 }} required />
                    <button type="submit" className="btn btn-primary" disabled={uploading}>
                      {uploading ? '⏳ Uploading...' : 'Upload'}
                    </button>
                  </form>
                </div>
              </div>

              {documents.length === 0 ? (
                <div className="table-empty">
                  <div className="table-empty-icon">📂</div>
                  <p>No documents uploaded yet</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Document Type</th>
                      <th>File Name</th>
                      <th>Uploaded On</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr key={doc.id}>
                        <td><span className="badge badge-info">{doc.tag.replace(/_/g, ' ')}</span></td>
                        <td>{doc.file_name}</td>
                        <td style={{ color: 'var(--text-tertiary)' }}>{new Date(doc.created_at).toLocaleDateString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          <a href={doc.file_path} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline">👁️ View / Download</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Structure Editor Modal */}
      {showStructureModal && (
        <div className="modal-overlay" onClick={() => setShowStructureModal(false)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">💰 Edit Salary Structure — {emp.full_name}</h3>
              <button className="modal-close" onClick={() => setShowStructureModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 13 }}>
                Set monthly amounts per earning component. CTC auto-computes as monthly total × 12. Statutory deductions (PF/ESI/PT/TDS) are calculated automatically at payroll run.
              </div>

              <div className="form-group">
                <label className="form-label">Effective From</label>
                <input type="date" className="form-input" value={structForm.effective_from} onChange={e => setStructForm(p => ({ ...p, effective_from: e.target.value }))} style={{ maxWidth: 220 }} />
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Code</th>
                    <th style={{ textAlign: 'right' }}>Monthly (₹)</th>
                    <th style={{ textAlign: 'right' }}>Annual (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {allComponents.map(c => {
                    const val = structForm.amounts[c.code] ?? '';
                    const annual = (Number(val) || 0) * 12;
                    return (
                      <tr key={c.code}>
                        <td>
                          <div><strong>{c.name}</strong></div>
                          {c.description && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.description}</div>}
                        </td>
                        <td className="font-mono" style={{ fontSize: 12 }}>{c.code}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: 130, textAlign: 'right' }}
                            value={val}
                            min={0}
                            onChange={e => setStructForm(p => ({ ...p, amounts: { ...p.amounts, [c.code]: e.target.value } }))}
                          />
                        </td>
                        <td className="currency text-right" style={{ color: 'var(--text-tertiary)' }}>{formatCurrency(annual)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const monthly = Object.values(structForm.amounts).reduce((s, v) => s + (Number(v) || 0), 0);
                    return (
                      <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                        <td colSpan={2}>TOTAL CTC</td>
                        <td className="currency text-right">{formatCurrency(monthly)}</td>
                        <td className="currency text-right text-success">{formatCurrency(monthly * 12)}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowStructureModal(false)} disabled={savingStruct}>Cancel</button>
              <button className="btn btn-success" onClick={saveStructure} disabled={savingStruct}>
                {savingStruct ? '⏳ Saving…' : '💾 Save Structure'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
