'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { PRESET_DESIGNATIONS } from '@/lib/designations';

export default function EditEmployeePage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees/${id}`).then(r => r.json()),
      fetch(`/api/departments?company=${localStorage.getItem('active_company') || ''}`).then(r => r.json()),
      fetch(`/api/employees?company=${localStorage.getItem('active_company') || ''}&status=active`).then(r => r.json()),
    ]).then(([empData, deptData, mgrData]) => {
      setForm(empData.employee || {});
      setDepartments(deptData.departments || []);
      setManagers((mgrData.employees || []).filter(e => e.id !== id));
      setLoading(false);
    });
  }, [id]);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setSaving(false);
      if (res.ok) {
        toast.success('Employee details updated');
        router.push(`/employees/${id}`);
      } else {
        toast.error(data.error || 'Failed to update');
      }
    } catch(err) {
      toast.error('Network error');
      setSaving(false);
    }
  };

  if (loading) return <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">✏️ Edit Employee</h1>
          <p className="page-subtitle">{form.full_name} ({form.employee_code})</p>
        </div>
        <button onClick={() => router.back()} className="btn btn-outline">← Back</button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="dashboard-grid">
          {/* Personal */}
          <div className="card">
            <div className="card-header"><span className="card-title">👤 Personal Information</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label form-label-required">Full Name</label>
                <input className="form-input" value={form.full_name || ''} onChange={e => updateField('full_name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Father/Spouse Name</label>
                <input className="form-input" value={form.father_spouse_name || ''} onChange={e => updateField('father_spouse_name', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input type="date" className="form-input" value={form.date_of_birth || ''} onChange={e => updateField('date_of_birth', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select className="form-select" value={form.gender || 'Male'} onChange={e => updateField('gender', e.target.value)}>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mobile</label>
                  <input className="form-input" value={form.mobile_number || ''} onChange={e => updateField('mobile_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={form.email_id || ''} onChange={e => updateField('email_id', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Current Address</label>
                <textarea className="form-textarea" rows={2} value={form.current_address || ''} onChange={e => updateField('current_address', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Permanent Address</label>
                <textarea className="form-textarea" rows={2} value={form.permanent_address || ''} onChange={e => updateField('permanent_address', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Employment */}
          <div className="card">
            <div className="card-header"><span className="card-title">💼 Employment Details</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="form-select" value={form.department_id || ''} onChange={e => updateField('department_id', e.target.value)}>
                  <option value="">Select</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Designation</label>
                <input
                  className="form-input"
                  list="preset-designations-edit"
                  value={form.designation || ''}
                  onChange={e => updateField('designation', e.target.value)}
                />
                <datalist id="preset-designations-edit">
                  {PRESET_DESIGNATIONS.map(d => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">Reporting Manager</label>
                <select className="form-select" value={form.reporting_manager_id || ''} onChange={e => updateField('reporting_manager_id', e.target.value)}>
                  <option value="">Select</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.employee_code})</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Employment Type</label>
                  <select className="form-select" value={form.employment_type || 'Permanent'} onChange={e => updateField('employment_type', e.target.value)}>
                    <option>Permanent</option><option>Contract</option><option>Trainee</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" value={form.work_location || ''} onChange={e => updateField('work_location', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Skill Category</label>
                  <select className="form-select" value={form.skill_category || 'Unskilled'} onChange={e => updateField('skill_category', e.target.value)}>
                    <option>Unskilled</option><option>Semi-skilled</option><option>Skilled</option><option>Highly Skilled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tax Regime</label>
                  <select className="form-select" value={form.tax_regime || 'NEW'} onChange={e => updateField('tax_regime', e.target.value)}>
                    <option value="NEW">New Regime</option><option value="OLD">Old Regime</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Statutory */}
          <div className="card">
            <div className="card-header"><span className="card-title">🏛️ Statutory Details</span></div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">PAN</label>
                  <input className="form-input" value={form.pan_number || ''} onChange={e => updateField('pan_number', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Aadhaar</label>
                  <input className="form-input" value={form.aadhaar_number || ''} onChange={e => updateField('aadhaar_number', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">UAN</label>
                  <input className="form-input" value={form.uan || ''} onChange={e => updateField('uan', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">PF Number</label>
                  <input className="form-input" value={form.pf_number || ''} onChange={e => updateField('pf_number', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ESIC Number</label>
                  <input className="form-input" value={form.esic_number || ''} onChange={e => updateField('esic_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">PT State</label>
                  <input className="form-input" value={form.pt_state || ''} onChange={e => updateField('pt_state', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">PF Override Amount (₹)</label>
                  <input type="number" className="form-input" placeholder="Leave blank for default" value={form.pf_override ?? ''} onChange={e => updateField('pf_override', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">ESI Override Amount (₹)</label>
                  <input type="number" className="form-input" placeholder="Leave blank for default" value={form.esic_override ?? ''} onChange={e => updateField('esic_override', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Bank */}
          <div className="card">
            <div className="card-header"><span className="card-title">🏦 Bank Details</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Bank Name</label>
                <input className="form-input" value={form.bank_name || ''} onChange={e => updateField('bank_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Account Number</label>
                <input className="form-input" value={form.account_number || ''} onChange={e => updateField('account_number', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">IFSC Code</label>
                  <input className="form-input" value={form.ifsc_code || ''} onChange={e => updateField('ifsc_code', e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Branch</label>
                  <input className="form-input" value={form.branch_name || ''} onChange={e => updateField('branch_name', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-select" value={form.payment_mode || 'Bank Transfer'} onChange={e => updateField('payment_mode', e.target.value)}>
                  <option>Bank Transfer</option><option>Cash</option><option>Cheque</option>
                </select>
              </div>

              {/* Exit Section */}
              <div style={{ marginTop: 24, padding: 16, background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger-border)' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginBottom: 12 }}>⚠️ Employee Separation</h4>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Exit Date</label>
                    <input type="date" className="form-input" value={form.exit_date || ''} onChange={e => updateField('exit_date', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Exit Reason</label>
                    <select className="form-select" value={form.exit_reason || ''} onChange={e => updateField('exit_reason', e.target.value)}>
                      <option value="">Select</option>
                      <option>Resignation</option><option>Termination</option><option>Retirement</option><option>Abscond</option><option>Mutual Separation</option>
                    </select>
                  </div>
                </div>
                <label className="form-check" style={{ marginTop: 12 }}>
                  <input type="checkbox" checked={form.is_active === 0 || form.is_active === false} onChange={e => updateField('is_active', e.target.checked ? 0 : 1)} />
                  Mark as Exited (Inactive)
                </label>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => router.back()}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={saving}>
            {saving ? '⏳ Saving...' : '✓ Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
