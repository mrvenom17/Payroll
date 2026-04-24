'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';

export default function CompaniesPage() {
  const toast = useToast();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', address: '', pan: '', tan: '', gstin: '', pf_registration: '', esic_registration: '' });

  const fetchData = () => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(d => { setCompanies(d.companies || []); setLoading(false); });
  };

  useEffect(fetchData, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        toast.success('Company Registered Successfully!');
        setShowModal(false);
        fetchData();
        setForm({ name: '', code: '', address: '', pan: '', tan: '', gstin: '', pf_registration: '', esic_registration: '' });
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to register company');
      }
    } catch (e) {
      toast.error('Network Error');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏢 Company Management</h1>
          <p className="page-subtitle">Multi-tenancy controller for all operating entities.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Register New Company</button>
        </div>
      </div>

      {loading ? <div className="page-loader"><div className="spinner"></div></div> : (
        <div className="card">
          <div className="card-body">
            {companies.length === 0 ? (
              <div className="table-empty">
                <div className="table-empty-icon">🏢</div>
                <p>No companies found.</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Code</th>
                    <th>PAN / TAN</th>
                    <th>PF Register</th>
                    <th>ESIC Register</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td><span className="badge badge-info">{c.code}</span></td>
                      <td>{c.pan || '—'} / {c.tan || '—'}</td>
                      <td>{c.pf_registration || '—'}</td>
                      <td>{c.esic_registration || '—'}</td>
                    </tr>
                  ))}
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
              <h3 className="modal-title">Register New Company</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Company Name</label>
                    <input type="text" className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">Company Code</label>
                    <input type="text" className="form-input" value={form.code} onChange={e => setForm({...form, code: e.target.value})} required placeholder="e.g. COMP_ACME" style={{ textTransform: 'uppercase' }} />
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
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Company</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
