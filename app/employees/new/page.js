'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { PRESET_DESIGNATIONS } from '@/lib/designations';

export default function NewEmployeePage() {
  const router = useRouter();
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    company_id: 'comp_uabiotech',
    full_name: '', father_spouse_name: '',
    date_of_birth: '', gender: 'Male',
    mobile_number: '', email_id: '',
    current_address: '', permanent_address: '',
    joining_date: new Date().toISOString().split('T')[0],
    department_id: '', designation: '',
    reporting_manager_id: '',
    employment_type: 'Permanent',
    work_location: 'Jabalpur',
    probation_end_date: '',
    skill_category: 'Unskilled',
    tax_regime: 'NEW',
    pan_number: '', aadhaar_number: '',
    uan: '', pf_number: '', esic_number: '',
    bank_name: '', account_number: '',
    ifsc_code: '', branch_name: '',
    payment_mode: 'Bank Transfer',
    ctc_annual: '',
  });

  // Salary structure: 'auto' uses template (Basic = 50% of gross, HRA = 40% of basic, etc.)
  // 'manual' lets user enter each component amount individually.
  const [salaryMode, setSalaryMode] = useState('auto');
  const [template, setTemplate] = useState({ basic_pct: 50, hra_pct: 40, conv: 1600, med: 1250 });
  const [manualComponents, setManualComponents] = useState({
    BASIC: '', HRA: '', CONV: '', MED: '', SPL: '',
  });

  useEffect(() => {
    fetch('/api/settings/integrations').then(r => r.json()).then(d => {
      const s = d.settings || {};
      setTemplate({
        basic_pct: Number(s.template_basic_pct ?? 50),
        hra_pct: Number(s.template_hra_pct ?? 40),
        conv: Number(s.template_conv_amount ?? 1600),
        med: Number(s.template_med_amount ?? 1250),
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const company = localStorage.getItem('active_company') || 'comp_uabiotech';
    setForm(prev => ({ ...prev, company_id: company }));
    Promise.all([
      fetch(`/api/departments?company=${company}`).then(r => r.json()),
      fetch(`/api/employees?company=${company}&status=active`).then(r => r.json()),
    ]).then(([deptData, mgrData]) => {
      setDepartments(deptData.departments || []);
      setManagers(mgrData.employees || []);
    });
  }, []);

  const u = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const validate = () => {
    if (!form.full_name.trim()) return 'Full name is required';
    if (!form.joining_date) return 'Joining date is required';
    if (!form.department_id) return 'Department is required';
    if (!form.designation.trim()) return 'Designation is required';
    if (form.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan_number)) return 'Invalid PAN format (e.g., ABCDE1234F)';
    if (form.aadhaar_number && form.aadhaar_number.length !== 12) return 'Aadhaar must be 12 digits';
    if (form.ctc_annual && parseFloat(form.ctc_annual) < 0) return 'CTC cannot be negative';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    setSaving(true);

    let payload = {
      ...form,
      ctc_annual: form.ctc_annual ? parseFloat(form.ctc_annual) : 0,
    };

    if (salaryMode === 'manual') {
      const components = Object.entries(manualComponents)
        .map(([code, v]) => ({ code, monthly_amount: Number(v) || 0 }))
        .filter(c => c.monthly_amount > 0);
      if (components.length === 0) {
        toast.error('Enter at least one component amount, or switch to Auto');
        setSaving(false);
        return;
      }
      payload.salary_components = components;
      const monthlyTotal = components.reduce((s, c) => s + c.monthly_amount, 0);
      // CTC Annual matches the manual entry
      payload.ctc_annual = monthlyTotal * 12;
    }

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Employee created successfully');
        router.push(`/employees/${data.employee.id}`);
      } else {
        toast.error(data.error || 'Failed to create employee');
        setSaving(false);
      }
    } catch (err) {
      toast.error('Network error while saving employee');
      setSaving(false);
    }
  };

  const steps = [
    { num: 1, label: 'Personal', icon: '👤' },
    { num: 2, label: 'Employment', icon: '💼' },
    { num: 3, label: 'Statutory', icon: '🏛️' },
    { num: 4, label: 'Bank & Salary', icon: '🏦' },
  ];

  const canNext = () => {
    if (step === 1) return form.full_name.trim() && form.joining_date;
    if (step === 2) return form.department_id && form.designation.trim();
    return true;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">➕ Add New Employee</h1>
          <p className="page-subtitle">Onboard a new team member</p>
        </div>
        <button onClick={() => router.back()} className="btn btn-outline">← Back</button>
      </div>


      {/* Stepper */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 20, left: '10%', right: '10%', height: 3,
              background: 'var(--gray-200)', zIndex: 0, borderRadius: 2,
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: 'var(--primary)',
                width: `${((step - 1) / 3) * 100}%`,
                transition: 'width 0.4s ease',
              }}></div>
            </div>
            {steps.map(s => (
              <div key={s.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, cursor: 'pointer' }} onClick={() => setStep(s.num)}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                  background: step >= s.num ? 'var(--primary)' : 'var(--gray-200)',
                  color: step >= s.num ? 'white' : 'var(--text-tertiary)',
                  fontWeight: 700, transition: 'all 0.3s ease',
                  boxShadow: step === s.num ? '0 0 0 4px rgba(27,77,110,0.2)' : 'none',
                }}>
                  {step > s.num ? '✓' : s.icon}
                </div>
                <span style={{ fontSize: 12, marginTop: 6, fontWeight: step === s.num ? 700 : 400, color: step >= s.num ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Personal */}
        {step === 1 && (
          <div className="card animate-fade-in">
            <div className="card-header"><span className="card-title">👤 Personal Information</span></div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label form-label-required">Full Name</label>
                  <input className="form-input" placeholder="e.g., Rajesh Kumar Sharma" value={form.full_name} onChange={e => u('full_name', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Father / Spouse Name</label>
                  <input className="form-input" placeholder="e.g., Ramesh Sharma" value={form.father_spouse_name} onChange={e => u('father_spouse_name', e.target.value)} />
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input type="date" className="form-input" value={form.date_of_birth} onChange={e => u('date_of_birth', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select className="form-select" value={form.gender} onChange={e => u('gender', e.target.value)}>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Joining Date</label>
                  <input type="date" className="form-input" value={form.joining_date} onChange={e => u('joining_date', e.target.value)} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mobile Number</label>
                  <input className="form-input" placeholder="10-digit mobile" value={form.mobile_number} onChange={e => u('mobile_number', e.target.value)} maxLength={10} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email ID</label>
                  <input type="email" className="form-input" placeholder="employee@company.com" value={form.email_id} onChange={e => u('email_id', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Current Address</label>
                <textarea className="form-textarea" rows={2} placeholder="Full address with city, state, PIN" value={form.current_address} onChange={e => u('current_address', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Permanent Address</label>
                <textarea className="form-textarea" rows={2} placeholder="Same as current or different" value={form.permanent_address} onChange={e => u('permanent_address', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Employment */}
        {step === 2 && (
          <div className="card animate-fade-in">
            <div className="card-header"><span className="card-title">💼 Employment Details</span></div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label form-label-required">Department</label>
                  <select className="form-select" value={form.department_id} onChange={e => u('department_id', e.target.value)} required>
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Designation</label>
                  <input
                    className="form-input"
                    list="preset-designations"
                    placeholder="Start typing or pick from list…"
                    value={form.designation}
                    onChange={e => u('designation', e.target.value)}
                    required
                  />
                  <datalist id="preset-designations">
                    {PRESET_DESIGNATIONS.map(d => <option key={d} value={d} />)}
                  </datalist>
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Reporting Manager</label>
                  <select className="form-select" value={form.reporting_manager_id} onChange={e => u('reporting_manager_id', e.target.value)}>
                    <option value="">Select</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.employee_code})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Employment Type</label>
                  <select className="form-select" value={form.employment_type} onChange={e => u('employment_type', e.target.value)}>
                    <option>Permanent</option><option>Contract</option><option>Trainee</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Work Location</label>
                  <input className="form-input" placeholder="e.g., Jabalpur" value={form.work_location} onChange={e => u('work_location', e.target.value)} />
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Skill Category</label>
                  <select className="form-select" value={form.skill_category} onChange={e => u('skill_category', e.target.value)}>
                    <option>Unskilled</option><option>Semi-skilled</option><option>Skilled</option><option>Highly Skilled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tax Regime</label>
                  <select className="form-select" value={form.tax_regime} onChange={e => u('tax_regime', e.target.value)}>
                    <option value="NEW">New Regime</option><option value="OLD">Old Regime</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Probation End Date</label>
                  <input type="date" className="form-input" value={form.probation_end_date} onChange={e => u('probation_end_date', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Statutory */}
        {step === 3 && (
          <div className="card animate-fade-in">
            <div className="card-header"><span className="card-title">🏛️ Statutory & Compliance</span></div>
            <div className="card-body">
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                PAN, Aadhaar, UAN, and PF numbers are mandatory for statutory compliance. You can add them later if not available now.
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">PAN Number</label>
                  <input className="form-input" placeholder="ABCDE1234F" value={form.pan_number} onChange={e => u('pan_number', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} maxLength={10} />
                  {form.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan_number) && form.pan_number.length === 10 &&
                    <span className="form-hint" style={{ color: 'var(--danger)' }}>Invalid PAN format</span>
                  }
                </div>
                <div className="form-group">
                  <label className="form-label">Aadhaar Number</label>
                  <input className="form-input" placeholder="12-digit Aadhaar" value={form.aadhaar_number} onChange={e => u('aadhaar_number', e.target.value.replace(/\D/g, ''))} maxLength={12} />
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">UAN (Universal Account Number)</label>
                  <input className="form-input" placeholder="Auto-assigned by EPFO" value={form.uan} onChange={e => u('uan', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">PF Number</label>
                  <input className="form-input" placeholder="MH/BOM/12345/000/0001234" value={form.pf_number} onChange={e => u('pf_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">ESIC Number</label>
                  <input className="form-input" placeholder="If applicable (gross ≤ ₹21,000)" value={form.esic_number} onChange={e => u('esic_number', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Bank & Salary */}
        {step === 4 && (
          <div className="card animate-fade-in">
            <div className="card-header"><span className="card-title">🏦 Bank Details & CTC</span></div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Bank Name</label>
                  <input className="form-input" placeholder="e.g., State Bank of India" value={form.bank_name} onChange={e => u('bank_name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Number</label>
                  <input className="form-input" placeholder="Account number" value={form.account_number} onChange={e => u('account_number', e.target.value)} />
                </div>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">IFSC Code</label>
                  <input className="form-input" placeholder="e.g., SBIN0001234" value={form.ifsc_code} onChange={e => u('ifsc_code', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Branch Name</label>
                  <input className="form-input" placeholder="Branch" value={form.branch_name} onChange={e => u('branch_name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select className="form-select" value={form.payment_mode} onChange={e => u('payment_mode', e.target.value)}>
                    <option>Bank Transfer</option><option>Cash</option><option>Cheque</option>
                  </select>
                </div>
              </div>

              <hr style={{ margin: '24px 0', border: 'none', borderTop: '2px solid var(--gray-100)' }} />

              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>💰 Salary Structure</h3>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  { v: 'auto', label: '⚡ Auto-Breakdown', hint: `From CTC using template (Basic ${template.basic_pct}% of Gross)` },
                  { v: 'manual', label: '✏️ Manual Entry', hint: 'Enter each component amount yourself' },
                ].map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setSalaryMode(opt.v)}
                    style={{
                      flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                      border: `2px solid ${salaryMode === opt.v ? 'var(--primary)' : 'var(--border-light)'}`,
                      background: salaryMode === opt.v ? 'var(--primary-50, #eef5fa)' : 'white',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{opt.hint}</div>
                  </button>
                ))}
              </div>

              {salaryMode === 'auto' ? (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Annual CTC (₹)</label>
                    <input type="number" className="form-input" placeholder="e.g., 600000" value={form.ctc_annual}
                      onChange={e => u('ctc_annual', e.target.value)} style={{ fontSize: 18, fontWeight: 700 }} />
                    <span className="form-hint">Monthly: ₹{form.ctc_annual ? Math.round(parseFloat(form.ctc_annual) / 12).toLocaleString('en-IN') : '0'}</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Computed Breakdown</label>
                    {form.ctc_annual > 0 && (() => {
                      const monthly = Math.round(parseFloat(form.ctc_annual) / 12);
                      const basic = Math.round(monthly * (template.basic_pct / 100));
                      const hra = Math.round(basic * (template.hra_pct / 100));
                      const conv = template.conv;
                      const med = template.med;
                      const special = Math.max(monthly - basic - hra - conv - med, 0);
                      return (
                        <div style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Basic ({template.basic_pct}%)</span><span className="font-bold">₹{basic.toLocaleString('en-IN')}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>HRA ({template.hra_pct}% of Basic)</span><span>₹{hra.toLocaleString('en-IN')}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Conveyance</span><span>₹{conv.toLocaleString('en-IN')}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Medical</span><span>₹{med.toLocaleString('en-IN')}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--gray-200)', paddingTop: 4 }}><span>Special Allowance</span><span>₹{special.toLocaleString('en-IN')}</span></div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="alert alert-info" style={{ marginBottom: 12, fontSize: 12 }}>
                    Enter monthly amount for each component. Annual CTC auto-calculates as monthly total × 12.
                  </div>
                  <table>
                    <thead>
                      <tr><th>Component</th><th style={{ textAlign: 'right' }}>Monthly (₹)</th><th style={{ textAlign: 'right' }}>Annual (₹)</th></tr>
                    </thead>
                    <tbody>
                      {[
                        ['BASIC', 'Basic Salary'],
                        ['HRA', 'House Rent Allowance'],
                        ['CONV', 'Conveyance'],
                        ['MED', 'Medical'],
                        ['SPL', 'Special Allowance'],
                      ].map(([code, label]) => {
                        const v = manualComponents[code];
                        const annual = (Number(v) || 0) * 12;
                        return (
                          <tr key={code}>
                            <td><strong>{label}</strong></td>
                            <td style={{ textAlign: 'right' }}>
                              <input type="number" className="form-input" min={0} style={{ width: 140, textAlign: 'right' }}
                                value={v}
                                onChange={e => setManualComponents(p => ({ ...p, [code]: e.target.value }))} />
                            </td>
                            <td className="currency text-right" style={{ color: 'var(--text-tertiary)' }}>
                              ₹{annual.toLocaleString('en-IN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const monthly = Object.values(manualComponents).reduce((s, v) => s + (Number(v) || 0), 0);
                        return (
                          <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                            <td>TOTAL CTC</td>
                            <td className="currency text-right">₹{monthly.toLocaleString('en-IN')}</td>
                            <td className="currency text-right text-success">₹{(monthly * 12).toLocaleString('en-IN')}</td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button type="button" className="btn btn-outline" onClick={() => step > 1 ? setStep(step - 1) : router.back()}>
            {step > 1 ? '← Previous' : '← Cancel'}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            {step < 4 && (
              <button type="button" className="btn btn-primary" onClick={() => canNext() ? setStep(step + 1) : toast.error('Please fill in required fields')} disabled={!canNext()}>
                Next Step →
              </button>
            )}
            {step === 4 && (
              <button type="submit" className="btn btn-success" disabled={saving} style={{ minWidth: 200 }}>
                {saving ? '⏳ Creating...' : '✅ Create Employee'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
