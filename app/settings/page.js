'use client';

import { useState, useEffect } from 'react';
import CompanyManager from '@/components/CompanyManager';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company');
  const [company, setCompany] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [integrations, setIntegrations] = useState({
    razorpay_key_id: '', razorpay_key_secret: '',
    default_payment_mode: 'NEFT',
    payer_bank_name: '', payer_account_number: '', payer_ifsc: '',
    next_cheque_number: '000001',
    // Salary structure template (auto-breakdown defaults)
    template_basic_pct: 50,
    template_hra_pct: 40,
    template_conv_amount: 1600,
    template_petrol_amount: 0,
    template_med_amount: 1250,
  });
  const [editingTemplate, setEditingTemplate] = useState(false);

  useEffect(() => {
    const companyId = localStorage.getItem('active_company') || '';
    if (companyId) {
      fetch(`/api/companies`)
        .then(r => r.json())
        .then(d => {
          const found = (d.companies || []).find(c => c.id === companyId);
          if (found) {
            setCompany({
              id: found.id,
              name: found.name || '',
              code: found.code || '',
              legal_name: found.name || '',
              cin: '',
              pan: found.pan || '',
              tan: found.tan || '',
              gstin: found.gstin || '',
              address: found.address || '',
              phone: '',
              email: '',
              website: '',
              pf_establishment_code: found.pf_registration || '',
              esic_code: found.esic_registration || '',
              pt_registration: '',
              lwf_number: '',
              payroll_day: 3,
              leave_year_start: 'January',
              financial_year: '2025-2026',
              working_days_per_week: 5,
            });
          } else {
            setCompany({ name: '', code: '', legal_name: '', cin: '', pan: '', tan: '', gstin: '', address: '', phone: '', email: '', website: '', pf_establishment_code: '', esic_code: '', pt_registration: '', lwf_number: '', payroll_day: 3, leave_year_start: 'January', financial_year: '2025-2026', working_days_per_week: 5 });
          }
        })
        .catch(() => setCompany({ name: '', code: '', legal_name: '', cin: '', pan: '', tan: '', gstin: '', address: '', phone: '', email: '', website: '', pf_establishment_code: '', esic_code: '', pt_registration: '', lwf_number: '', payroll_day: 3, leave_year_start: 'January', financial_year: '2025-2026', working_days_per_week: 5 }));
    } else {
      setCompany({ name: '', code: '', legal_name: '', cin: '', pan: '', tan: '', gstin: '', address: '', phone: '', email: '', website: '', pf_establishment_code: '', esic_code: '', pt_registration: '', lwf_number: '', payroll_day: 3, leave_year_start: 'January', financial_year: '2025-2026', working_days_per_week: 5 });
    }

    fetch('/api/settings/integrations')
      .then(r => r.json())
      .then(d => {
        if (d.settings) {
          setIntegrations(prev => ({ ...prev, ...d.settings }));
        }
      });
  }, []);

  const save = async () => {
    setSaving(true);
    
    // Save company profile to DB if company exists
    const companyId = localStorage.getItem('active_company') || '';
    if (companyId && company) {
      try {
        await fetch('/api/companies', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: companyId,
            name: company.name,
            code: company.code,
            address: company.address,
            gstin: company.gstin,
            pan: company.pan,
            tan: company.tan,
            pf_registration: company.pf_establishment_code,
            esic_registration: company.esic_code,
          }),
        });
      } catch(e) { console.error('Company save error:', e); }
    }

    // Save Integrations
    try {
      await fetch('/api/settings/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(integrations)
      });
    } catch(e) {}

    setTimeout(() => {
      setSaving(false);
      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
    }, 400);
  };

  const tabs = [
    { id: 'companies', label: 'Companies', icon: '🏢' },
    { id: 'company', label: 'Company Profile', icon: '📇' },
    { id: 'statutory', label: 'Statutory', icon: '🏛️' },
    { id: 'payroll', label: 'Payroll Config', icon: '⚙️' },
    { id: 'payments', label: 'Payments & Banking', icon: '💳' },
    { id: 'leave', label: 'Leave Policy', icon: '📋' },
    { id: 'integrations', label: 'Integrations & API', icon: '🔌' },
  ];

  if (!company) return <div className="page-loader"><div className="spinner"></div></div>;

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">⚙️ Settings</h1>
          <p className="page-subtitle">Configure system, company, and compliance settings</p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '⏳ Saving...' : '💾 Save Settings'}
        </button>
      </div>

      {message && <div className="alert alert-success" style={{ marginBottom: 16 }}>✅ {message}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id}
            className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab(t.id)}
            style={{ borderRadius: 'var(--radius-full)' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Companies Tab — manage all operating entities */}
      {activeTab === 'companies' && (
        <div className="card animate-fade-in">
          <div className="card-header"><span className="card-title">🏢 Company Management</span></div>
          <div className="card-body">
            <CompanyManager />
          </div>
        </div>
      )}

      {/* Company Tab */}
      {activeTab === 'company' && (
        <div className="card animate-fade-in">
          <div className="card-header"><span className="card-title">🏢 Company Information</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input className="form-input" value={company.name} onChange={e => setCompany(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Legal Name</label>
                <input className="form-input" value={company.legal_name} onChange={e => setCompany(prev => ({ ...prev, legal_name: e.target.value }))} />
              </div>
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">CIN</label>
                <input className="form-input" value={company.cin} onChange={e => setCompany(prev => ({ ...prev, cin: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">PAN</label>
                <input className="form-input" value={company.pan} onChange={e => setCompany(prev => ({ ...prev, pan: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">TAN</label>
                <input className="form-input" value={company.tan} onChange={e => setCompany(prev => ({ ...prev, tan: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input className="form-input" value={company.gstin} onChange={e => setCompany(prev => ({ ...prev, gstin: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={company.phone} onChange={e => setCompany(prev => ({ ...prev, phone: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Registered Address</label>
              <textarea className="form-textarea" rows={2} value={company.address} onChange={e => setCompany(prev => ({ ...prev, address: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" value={company.email} onChange={e => setCompany(prev => ({ ...prev, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Website</label>
                <input className="form-input" value={company.website} onChange={e => setCompany(prev => ({ ...prev, website: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statutory Tab */}
      {activeTab === 'statutory' && (
        <div className="card animate-fade-in">
          <div className="card-header"><span className="card-title">🏛️ Statutory Registration Numbers</span></div>
          <div className="card-body">
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
              These registration numbers are used in statutory reports (PF ECR, ESIC Challans, PT returns).
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">PF Establishment Code</label>
                <input className="form-input" value={company.pf_establishment_code} onChange={e => setCompany(prev => ({ ...prev, pf_establishment_code: e.target.value }))} />
                <span className="form-hint">Format: MPJBP0012345</span>
              </div>
              <div className="form-group">
                <label className="form-label">ESIC Code</label>
                <input className="form-input" value={company.esic_code} onChange={e => setCompany(prev => ({ ...prev, esic_code: e.target.value }))} />
                <span className="form-hint">17-digit ESIC employer code</span>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">PT Registration (Madhya Pradesh)</label>
                <input className="form-input" value={company.pt_registration} onChange={e => setCompany(prev => ({ ...prev, pt_registration: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">LWF Number</label>
                <input className="form-input" value={company.lwf_number} onChange={e => setCompany(prev => ({ ...prev, lwf_number: e.target.value }))} />
              </div>
            </div>

            <hr style={{ margin: '20px 0', border: 'none', borderTop: '2px solid var(--gray-100)' }} />
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📊 Current Statutory Rates</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'PF Employee', value: '12%', sub: 'of Basic (max ₹15,000)' },
                { label: 'PF Employer', value: '12%', sub: '3.67% PF + 8.33% EPS' },
                { label: 'ESIC Employee', value: '0.75%', sub: 'if Gross ≤ ₹21,000' },
                { label: 'ESIC Employer', value: '3.25%', sub: 'if Gross ≤ ₹21,000' },
                { label: 'PT (MP)', value: 'Slab', sub: '₹0 to ₹208/month' },
                { label: 'LWF (MP)', value: '₹20+₹40', sub: 'Half yearly June & Dec' },
              ].map((r, i) => (
                <div key={i} style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{r.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Payroll Config Tab */}
      {activeTab === 'payroll' && (
        <div className="card animate-fade-in">
          <div className="card-header"><span className="card-title">⚙️ Payroll Configuration</span></div>
          <div className="card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Payroll Processing Day</label>
                <select className="form-select" value={company.payroll_day} onChange={e => setCompany(prev => ({ ...prev, payroll_day: parseInt(e.target.value) }))}>
                  <option value={3}>3rd of month</option>
                  <option value={4}>4th of month</option>
                </select>
                <span className="form-hint">Day of month when payroll is processed</span>
              </div>
              <div className="form-group">
                <label className="form-label">Financial Year</label>
                <select className="form-select" value={company.financial_year} onChange={e => setCompany(prev => ({ ...prev, financial_year: e.target.value }))}>
                  <option>2024-2025</option>
                  <option>2025-2026</option>
                  <option>2026-2027</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Working Days / Week</label>
                <select className="form-select" value={company.working_days_per_week} onChange={e => setCompany(prev => ({ ...prev, working_days_per_week: parseInt(e.target.value) }))}>
                  <option value={5}>5 days / week</option>
                  <option value={6}>6 days / week</option>
                </select>
                <span className="form-hint">5-day week → ~22 working days/month · 6-day week → ~26</span>
              </div>
            </div>

            <hr style={{ margin: '20px 0', border: 'none', borderTop: '2px solid var(--gray-100)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>💰 Salary Structure Template (auto-breakdown defaults)</h4>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setEditingTemplate(v => !v)}>
                {editingTemplate ? '✓ Done' : '✏️ Modify'}
              </button>
            </div>
            {editingTemplate ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Basic — % of Gross</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" className="form-input" min={0} max={100} value={integrations.template_basic_pct}
                      onChange={e => setIntegrations(p => ({ ...p, template_basic_pct: parseFloat(e.target.value) || 0 }))} />
                    <span>%</span>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">HRA — % of Basic</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" className="form-input" min={0} max={100} value={integrations.template_hra_pct}
                      onChange={e => setIntegrations(p => ({ ...p, template_hra_pct: parseFloat(e.target.value) || 0 }))} />
                    <span>%</span>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Conveyance — fixed (₹/mo) <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>(excl. PF/ESI)</span></label>
                  <input type="number" className="form-input" min={0} value={integrations.template_conv_amount}
                    onChange={e => setIntegrations(p => ({ ...p, template_conv_amount: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Petrol Allowance — fixed (₹/mo) <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>(excl. PF/ESI)</span></label>
                  <input type="number" className="form-input" min={0} value={integrations.template_petrol_amount}
                    onChange={e => setIntegrations(p => ({ ...p, template_petrol_amount: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Medical — fixed (₹/mo)</label>
                  <input type="number" className="form-input" min={0} value={integrations.template_med_amount}
                    onChange={e => setIntegrations(p => ({ ...p, template_med_amount: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-tertiary)' }}>
                  💡 Special Allowance is the balancing component (Gross − Basic − HRA − Conv − Petrol − Med). Click "Save Settings" above to persist.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {[
                  { component: 'Basic', formula: `${integrations.template_basic_pct}% of Gross` },
                  { component: 'HRA', formula: `${integrations.template_hra_pct}% of Basic` },
                  { component: 'Conveyance', formula: `₹${Number(integrations.template_conv_amount).toLocaleString('en-IN')} fixed (excl. PF/ESI)` },
                  { component: 'Petrol Allowance', formula: `₹${Number(integrations.template_petrol_amount).toLocaleString('en-IN')} fixed (excl. PF/ESI)` },
                  { component: 'Medical', formula: `₹${Number(integrations.template_med_amount).toLocaleString('en-IN')} fixed` },
                  { component: 'Special Allowance', formula: 'Gross − Others (balancing)' },
                ].map((c, i) => (
                  <div key={i} style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.component}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.formula}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payments & Banking Tab */}
      {activeTab === 'payments' && (
        <div className="card animate-fade-in">
          <div className="card-header"><span className="card-title">💳 Payment Disbursement Defaults</span></div>
          <div className="card-body">
            <div className="alert alert-info" style={{ marginBottom: 20, fontSize: 13 }}>
              These defaults are used when paying out monthly payroll and FNF settlements. NEFT is the default — manual cheques are tracked individually with cheque number, drawee bank, and date.
            </div>

            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Default Payment Mode</h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
              {[
                { v: 'NEFT', label: 'NEFT', hint: 'Bank transfer (most common)' },
                { v: 'IMPS', label: 'IMPS', hint: 'Instant transfer' },
                { v: 'RTGS', label: 'RTGS', hint: 'High-value transfer' },
                { v: 'CHEQUE', label: 'Cheque', hint: 'Manual, individually tracked' },
                { v: 'UPI', label: 'UPI', hint: 'For small payments' },
                { v: 'CASH', label: 'Cash', hint: 'Discouraged for salary' },
              ].map(opt => (
                <label key={opt.v} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, border: `2px solid ${integrations.default_payment_mode === opt.v ? 'var(--primary)' : 'var(--border-light)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', minWidth: 160, background: integrations.default_payment_mode === opt.v ? 'var(--primary-50, #eef5fa)' : 'white' }}>
                  <input type="radio" name="default_payment_mode" value={opt.v} checked={integrations.default_payment_mode === opt.v} onChange={e => setIntegrations(p => ({ ...p, default_payment_mode: e.target.value }))} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>

            <hr style={{ margin: '8px 0 20px', border: 'none', borderTop: '2px solid var(--gray-100)' }} />

            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🏦 Payer Bank Account (used as "From" for NEFT / source of cheques)</h4>
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Bank Name</label>
                <input className="form-input" placeholder="e.g. State Bank of India" value={integrations.payer_bank_name} onChange={e => setIntegrations(p => ({ ...p, payer_bank_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Account Number</label>
                <input className="form-input font-mono" placeholder="Salary disbursement A/C" value={integrations.payer_account_number} onChange={e => setIntegrations(p => ({ ...p, payer_account_number: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">IFSC</label>
                <input className="form-input font-mono" placeholder="e.g. SBIN0001234" value={integrations.payer_ifsc} onChange={e => setIntegrations(p => ({ ...p, payer_ifsc: e.target.value.toUpperCase() }))} style={{ textTransform: 'uppercase' }} />
              </div>
            </div>

            <hr style={{ margin: '20px 0', border: 'none', borderTop: '2px solid var(--gray-100)' }} />

            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📃 Cheque Numbering</h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Next Cheque Number</label>
                <input className="form-input font-mono" placeholder="e.g. 000123" value={integrations.next_cheque_number} onChange={e => setIntegrations(p => ({ ...p, next_cheque_number: e.target.value }))} style={{ maxWidth: 200 }} />
                <span className="form-hint">Auto-suggested when issuing the next cheque (auto-increments after each manual cheque payment).</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Policy Tab */}
      {activeTab === 'leave' && (
        <div className="card animate-fade-in">
          <div className="card-header"><span className="card-title">📋 Leave Policy</span></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { type: 'Casual Leave (CL)', days: 12, carry: 'No', color: 'var(--info)' },
                { type: 'Sick Leave (SL)', days: 12, carry: 'No', color: 'var(--warning)' },
                { type: 'Earned Leave (EL)', days: 15, carry: 'Yes (max 30)', color: 'var(--success)' },
              ].map((l, i) => (
                <div key={i} className="card" style={{ border: `2px solid ${l.color}20` }}>
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 36, fontWeight: 800, color: l.color, marginBottom: 4 }}>{l.days}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{l.type}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Per Year · Carry Forward: {l.carry}</div>
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                      <input type="number" className="form-input" defaultValue={l.days} style={{ width: 80, textAlign: 'center', fontWeight: 700 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📅 Holidays ({new Date().getFullYear()})</h4>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th><th>Holiday</th><th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['26 Jan', 'Republic Day', 'National'],
                      ['14 Apr', 'Dr. Ambedkar Jayanti', 'National'],
                      ['01 May', 'May Day', 'State'],
                      ['15 Aug', 'Independence Day', 'National'],
                      ['02 Oct', 'Gandhi Jayanti', 'National'],
                      ['24 Oct', 'Dussehra', 'Festival'],
                      ['12 Nov', 'Diwali', 'Festival'],
                      ['25 Dec', 'Christmas', 'Festival'],
                    ].map(([date, name, type], i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{date}</td>
                        <td>{name}</td>
                        <td><span className={`badge ${type === 'National' ? 'badge-primary' : type === 'Festival' ? 'badge-success' : 'badge-info'}`}>{type}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="card animate-fade-in">
          <div className="card-header"><span className="card-title">🔌 Integrations & API Settings</span></div>
          <div className="card-body">
            <div className="alert alert-warning" style={{ marginBottom: 24, fontSize: 13 }}>
              <strong>Security Notice:</strong> The credentials stored below are used to automate core services. Do not share your Razorpay Live Secret keys. Since this app runs locally, they are stored securely on your machine's database.
            </div>
            
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>RazorpayX Payouts</h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label form-label-required">Key ID</label>
                <input 
                  type="text" 
                  className="form-input font-mono" 
                  placeholder="rzp_test_..." 
                  value={integrations.razorpay_key_id} 
                  onChange={e => setIntegrations(p => ({ ...p, razorpay_key_id: e.target.value }))} 
                />
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Key Secret</label>
                <input 
                  type="password" 
                  className="form-input font-mono" 
                  placeholder="•••••••••••••••••" 
                  value={integrations.razorpay_key_secret} 
                  onChange={e => setIntegrations(p => ({ ...p, razorpay_key_secret: e.target.value }))} 
                />
              </div>
            </div>
            
            <hr style={{ margin: '24px 0', border: 'none', borderTop: '2px solid var(--gray-100)' }} />
            
            <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Email / SMTP Server (Coming Soon)</h4>
            <div className="form-row-3" style={{ opacity: 0.5, pointerEvents: 'none' }}>
              <div className="form-group">
                <label className="form-label">SMTP Host</label>
                <input type="text" className="form-input" placeholder="smtp.sendgrid.net" />
              </div>
              <div className="form-group">
                <label className="form-label">Port</label>
                <input type="text" className="form-input" placeholder="587" />
              </div>
              <div className="form-group">
                <label className="form-label">API Key</label>
                <input type="password" className="form-input" placeholder="••••••••" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
