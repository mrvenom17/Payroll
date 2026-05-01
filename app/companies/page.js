'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

const EMPTY_FORM = { name: '', code: '', address: '', pan: '', tan: '', gstin: '', pf_registration: '', esic_registration: '' };

const writeCookie = (k, v) => {
  document.cookie = `${k}=${encodeURIComponent(v)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
};

const setActiveCompany = (id) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('active_company', id);
  writeCookie('active_company', id);
};

export default function CompaniesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState('');

  const fetchData = () => {
    setLoading(true);
    fetch('/api/companies')
      .then(r => r.json())
      .then(d => {
        setCompanies(d.companies || []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
    setActiveId(localStorage.getItem('active_company') || '');
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name || '',
      code: c.code || '',
      address: c.address || '',
      pan: c.pan || '',
      tan: c.tan || '',
      gstin: c.gstin || '',
      pf_registration: c.pf_registration || '',
      esic_registration: c.esic_registration || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isFirst = companies.length === 0;
      const res = editing
        ? await fetch('/api/companies', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editing.id, ...form }),
          })
        : await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          });
      const data = await res.json();
      if (res.ok) {
        toast.success(editing ? 'Company updated' : 'Company registered successfully!');
        setShowModal(false);
        setForm(EMPTY_FORM);

        // First-ever company OR no active set → auto-activate this one
        if (!editing) {
          const newId = data?.company?.id;
          if (newId && (isFirst || !localStorage.getItem('active_company'))) {
            setActiveCompany(newId);
            toast.info(`Switched to "${data.company.name}"`);
            // Reload so the rest of the app picks up the new active company
            setTimeout(() => window.location.reload(), 600);
            return;
          }
        }
        fetchData();
      } else {
        toast.error(data.error || 'Failed to save company');
      }
    } catch (err) {
      toast.error('Network error');
    }
    setSaving(false);
  };

  const switchTo = (c) => {
    setActiveCompany(c.id);
    toast.success(`Switched to ${c.name}`);
    setTimeout(() => window.location.reload(), 400);
  };

  const remove = async (c) => {
    const ok = await confirm({
      title: 'Delete Company?',
      message: `Permanently remove "${c.name}" (${c.code})? This is only allowed if it has no employees or departments.`,
      confirmText: 'Yes, Delete',
      variant: 'danger',
      icon: '🗑️',
    });
    if (!ok) return;
    const res = await fetch(`/api/companies?id=${c.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      toast.success('Company deleted');
      if (localStorage.getItem('active_company') === c.id) {
        localStorage.removeItem('active_company');
        writeCookie('active_company', '');
      }
      fetchData();
    } else {
      toast.error(data.error || 'Delete failed');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏢 Company Management</h1>
          <p className="page-subtitle">Each company has fully isolated employees, departments, payroll & reports.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openNew}>+ Register New Company</button>
        </div>
      </div>

      {loading ? <div className="page-loader"><div className="spinner"></div></div> : (
        <div className="card">
          <div className="card-body">
            {companies.length === 0 ? (
              <div className="table-empty">
                <div className="table-empty-icon">🏢</div>
                <p>No companies found.</p>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={openNew}>
                  ➕ Register your first company
                </button>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Active</th>
                    <th>Company Name</th>
                    <th>Code</th>
                    <th>PAN / TAN</th>
                    <th>PF Register</th>
                    <th>ESIC Register</th>
                    <th style={{ width: 220 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => {
                    const isActive = c.id === activeId;
                    return (
                      <tr key={c.id} style={isActive ? { background: 'var(--primary-50, #eef6ff)' } : undefined}>
                        <td>
                          {isActive
                            ? <span className="badge badge-success">● Active</span>
                            : <button className="btn btn-ghost btn-sm" onClick={() => switchTo(c)}>Switch</button>}
                        </td>
                        <td><strong>{c.name}</strong></td>
                        <td><span className="badge badge-info">{c.code}</span></td>
                        <td>{c.pan || '—'} / {c.tan || '—'}</td>
                        <td>{c.pf_registration || '—'}</td>
                        <td>{c.esic_registration || '—'}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ Edit</button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => remove(c)}
                            title="Delete (only if empty)"
                          >🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '✏️ Edit Company' : 'Register New Company'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Company Name</label>
                    <input type="text" className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">Company Code</label>
                    <input type="text" className="form-input" value={form.code} onChange={e => setForm({...form, code: e.target.value})} required placeholder="e.g. ACME" style={{ textTransform: 'uppercase' }} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea className="form-input" rows={2} value={form.address} onChange={e => setForm({...form, address: e.target.value})}></textarea>
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">PAN</label>
                    <input type="text" className="form-input font-mono" value={form.pan} onChange={e => setForm({...form, pan: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">TAN</label>
                    <input type="text" className="form-input font-mono" value={form.tan} onChange={e => setForm({...form, tan: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">GSTIN</label>
                    <input type="text" className="form-input font-mono" value={form.gstin} onChange={e => setForm({...form, gstin: e.target.value})} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">PF Registration No.</label>
                    <input type="text" className="form-input font-mono" value={form.pf_registration} onChange={e => setForm({...form, pf_registration: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ESIC Registration No.</label>
                    <input type="text" className="form-input font-mono" value={form.esic_registration} onChange={e => setForm({...form, esic_registration: e.target.value})} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '⏳ Saving…' : (editing ? '💾 Save Changes' : 'Save Company')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
