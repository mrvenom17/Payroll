'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';

export default function SalaryComponentsPage() {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const reload = () => {
    setLoading(true);
    fetch('/api/salary-components')
      .then(r => r.json())
      .then(d => { setComponents(d.components || []); setLoading(false); });
  };

  useEffect(reload, []);

  const startEdit = (c) => {
    setEditingId(c.id);
    setDraft({
      name: c.name || '',
      percent_of: c.percent_of || '',
      default_percent: c.default_percent ?? '',
      default_amount: c.default_amount ?? '',
      is_taxable: !!c.is_taxable,
      contributes_to_pf: !!c.contributes_to_pf,
      contributes_to_esic: !!c.contributes_to_esic,
      tax_deductible: !!c.tax_deductible,
      display_order: c.display_order ?? 0,
      description: c.description || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setDraft({}); };

  const save = async (id) => {
    setSaving(true);
    const res = await fetch('/api/salary-components', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...draft }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.component) {
      toast.success('Component updated');
      setEditingId(null);
      reload();
    } else {
      toast.error(data.error || 'Save failed');
    }
  };

  const earnings = components.filter(c => c.type === 'EARNING');
  const deductions = components.filter(c => c.type === 'DEDUCTION');

  const renderRow = (c, type) => {
    if (editingId === c.id) {
      return (
        <tr key={c.id} style={{ background: 'var(--primary-50, #eef5fa)' }}>
          <td colSpan={5}>
            <div style={{ padding: '12px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <strong style={{ minWidth: 60 }}>Code:</strong>
                <span className="badge badge-neutral font-mono">{c.code}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {c.is_statutory ? 'Statutory · code/type fixed' : 'Custom component'}
                </span>
              </div>
              <div className="form-row" style={{ marginBottom: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Display Name</label>
                  <input className="form-input" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Display Order</label>
                  <input type="number" className="form-input" value={draft.display_order} onChange={e => setDraft(p => ({ ...p, display_order: parseInt(e.target.value) || 0 }))} style={{ maxWidth: 100 }} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">% of (component code)</label>
                  <input className="form-input font-mono" placeholder="e.g. BASIC, GROSS, or blank" value={draft.percent_of} onChange={e => setDraft(p => ({ ...p, percent_of: e.target.value.toUpperCase() }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Default %</label>
                  <input type="number" step="0.01" className="form-input" value={draft.default_percent ?? ''} onChange={e => setDraft(p => ({ ...p, default_percent: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Default fixed (₹)</label>
                  <input type="number" className="form-input" value={draft.default_amount ?? ''} onChange={e => setDraft(p => ({ ...p, default_amount: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label">Description</label>
                <input className="form-input" value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                {type === 'EARNING' ? (
                  <>
                    <label className="form-check"><input type="checkbox" checked={draft.is_taxable} onChange={e => setDraft(p => ({ ...p, is_taxable: e.target.checked }))} /> Taxable</label>
                    <label className="form-check"><input type="checkbox" checked={draft.contributes_to_pf} onChange={e => setDraft(p => ({ ...p, contributes_to_pf: e.target.checked }))} /> Contributes to PF</label>
                    <label className="form-check"><input type="checkbox" checked={draft.contributes_to_esic} onChange={e => setDraft(p => ({ ...p, contributes_to_esic: e.target.checked }))} /> Contributes to ESIC</label>
                  </>
                ) : (
                  <label className="form-check"><input type="checkbox" checked={draft.tax_deductible} onChange={e => setDraft(p => ({ ...p, tax_deductible: e.target.checked }))} /> 80C / Tax Deductible</label>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-success btn-sm" onClick={() => save(c.id)} disabled={saving}>{saving ? '⏳' : '💾 Save'}</button>
                <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr key={c.id}>
        <td>{c.display_order}</td>
        <td>
          <strong>{c.name}</strong>
          {c.description && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.description}</div>}
        </td>
        <td><span className="badge badge-neutral font-mono">{c.code}</span></td>
        <td style={{ fontSize: 12 }}>
          {c.percent_of ? `${c.default_percent}% of ${c.percent_of}` : c.default_amount ? `₹${Number(c.default_amount).toLocaleString('en-IN')}` : 'Variable'}
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {type === 'EARNING' ? (
              <>
                {c.is_taxable ? <span className="badge badge-warning" style={{ fontSize: 10 }}>Taxable</span> : null}
                {c.is_statutory ? <span className="badge badge-info" style={{ fontSize: 10 }}>Statutory</span> : null}
                {c.contributes_to_pf ? <span className="badge badge-primary" style={{ fontSize: 10 }}>PF</span> : null}
                {c.contributes_to_esic ? <span className="badge badge-primary" style={{ fontSize: 10 }}>ESIC</span> : null}
              </>
            ) : (
              <>
                {c.is_statutory ? <span className="badge badge-info" style={{ fontSize: 10 }}>Statutory</span> : null}
                {c.tax_deductible ? <span className="badge badge-success" style={{ fontSize: 10 }}>80C</span> : null}
              </>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => startEdit(c)} title="Edit">✏️</button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">⚙️ Salary Components</h1>
          <p className="page-subtitle">Master list of all earning and deduction components · click ✏️ to modify</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-success" style={{ fontSize: 13, padding: '6px 12px' }}>📈 {earnings.length} Earnings</span>
          <span className="badge badge-danger" style={{ fontSize: 13, padding: '6px 12px' }}>📉 {deductions.length} Deductions</span>
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
        <div className="dashboard-grid">
          <div className="card">
            <div className="card-header" style={{ background: 'var(--success-bg)', borderBottom: '2px solid var(--success-border)' }}>
              <span className="card-title" style={{ color: 'var(--success)' }}>📈 Earnings</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr><th>#</th><th>Component</th><th>Code</th><th>Calculation</th><th>Flags / Edit</th></tr>
                </thead>
                <tbody>{earnings.map(c => renderRow(c, 'EARNING'))}</tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ background: 'var(--danger-bg)', borderBottom: '2px solid var(--danger-border)' }}>
              <span className="card-title" style={{ color: 'var(--danger)' }}>📉 Deductions</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr><th>#</th><th>Component</th><th>Code</th><th>Calculation</th><th>Flags / Edit</th></tr>
                </thead>
                <tbody>{deductions.map(c => renderRow(c, 'DEDUCTION'))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
