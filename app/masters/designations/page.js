'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

export default function DesignationsPage() {
  const [designations, setDesignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const reload = () => {
    setLoading(true);
    const company = localStorage.getItem('active_company') || '';
    Promise.all([
      fetch(`/api/designations?company=${company}`).then(r => r.json()),
      fetch(`/api/employees?company=${company}&status=active`).then(r => r.json()),
    ]).then(([desigData, empData]) => {
      setDesignations(desigData.designations || []);
      setEmployees(empData.employees || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(reload, []);

  // Employees grouped by their designation name.
  const usage = {};
  employees.forEach(e => {
    const d = e.designation || 'Unassigned';
    if (!usage[d]) usage[d] = { count: 0, employees: [] };
    usage[d].count++;
    usage[d].employees.push(e);
  });

  const countFor = (nm) => usage[nm]?.count || 0;
  const total = employees.length;

  const openNew = () => { setEditing(null); setName(''); setShowModal(true); };
  const openEdit = (d) => { setEditing(d); setName(d.name); setShowModal(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editing
        ? await fetch('/api/designations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editing.id, name }),
          })
        : await fetch('/api/designations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_id: localStorage.getItem('active_company') || '', name }),
          });
      const data = await res.json();
      if (res.ok) {
        toast.success(editing ? 'Designation updated' : 'Designation added');
        setShowModal(false);
        reload();
      } else {
        toast.error(data.error || 'Save failed');
      }
    } catch (err) {
      toast.error('Network error');
    }
    setSaving(false);
  };

  const remove = async (d) => {
    const headCount = countFor(d.name);
    if (headCount > 0) {
      toast.error(`Cannot delete — ${headCount} employee${headCount === 1 ? '' : 's'} still assigned`);
      return;
    }
    const ok = await confirm({
      title: 'Delete Designation?',
      message: `Remove "${d.name}"? This cannot be undone.`,
      confirmText: 'Yes, Delete',
      variant: 'danger',
      icon: '🗑️',
    });
    if (!ok) return;
    const res = await fetch(`/api/designations?id=${d.id}&company=${localStorage.getItem('active_company') || ''}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('Designation deleted'); reload(); }
    else toast.error(data.error || 'Delete failed');
  };

  // Designations that employees hold but which aren't in the master list yet.
  const known = new Set(designations.map(d => d.name));
  const orphans = Object.keys(usage).filter(nm => nm !== 'Unassigned' && !known.has(nm));

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📋 Designations</h1>
          <p className="page-subtitle">Designation master — {designations.length} total · add, rename &amp; delete right here</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ Add Designation</button>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
        <>
          {/* Master list */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">📘 Available Designations (shown when creating / editing employees)</span>
              <span className="badge badge-info">{designations.length}</span>
            </div>
            <div className="card-body">
              {designations.length === 0 ? (
                <div className="table-empty">
                  <div className="table-empty-icon">📋</div>
                  <p>No designations yet</p>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={openNew}>➕ Add your first designation</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {designations.map(d => {
                    const count = countFor(d.name);
                    return (
                      <span
                        key={d.id}
                        className={`badge ${count > 0 ? 'badge-success' : 'badge-neutral'}`}
                        style={{ fontSize: 13, padding: '6px 6px 6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        title={count > 0 ? `In use (${count} employee${count !== 1 ? 's' : ''})` : 'Available — not yet assigned'}
                      >
                        {d.name}{count > 0 ? ` · ${count}` : ''}
                        <button
                          onClick={() => openEdit(d)}
                          title="Rename"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 2px', fontSize: 12 }}
                        >✏️</button>
                        <button
                          onClick={() => remove(d)}
                          title={count > 0 ? 'Reassign employees before deleting' : 'Delete'}
                          disabled={count > 0}
                          style={{ border: 'none', background: 'transparent', cursor: count > 0 ? 'not-allowed' : 'pointer', padding: '0 2px', fontSize: 12, opacity: count > 0 ? 0.35 : 1 }}
                        >🗑️</button>
                      </span>
                    );
                  })}
                </div>
              )}

              {orphans.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                    ℹ️ {orphans.length} designation{orphans.length === 1 ? '' : 's'} in use by employees but not in the master list — click to add:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {orphans.map(nm => (
                      <button
                        key={nm}
                        className="badge badge-warning"
                        style={{ fontSize: 12, padding: '6px 10px', border: 'none', cursor: 'pointer' }}
                        title="Add to master list"
                        onClick={async () => {
                          const res = await fetch('/api/designations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ company_id: localStorage.getItem('active_company') || '', name: nm }),
                          });
                          if (res.ok) { toast.success(`Added "${nm}"`); reload(); }
                          else { const dd = await res.json(); toast.error(dd.error || 'Failed'); }
                        }}
                      >➕ {nm} · {countFor(nm)}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Distribution across employees */}
          {total > 0 && (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Designation</th>
                    <th>Employees</th>
                    <th>Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usage).sort((a, b) => b[1].count - a[1].count).map(([designation, data], i) => (
                    <tr key={designation}>
                      <td>{i + 1}</td>
                      <td><strong>{designation}</strong></td>
                      <td>
                        <span className="badge badge-info">{data.count}</span>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                          {data.employees.map(e => e.full_name).join(', ')}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, maxWidth: 200, height: 6, background: 'var(--gray-100)', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${(data.count / total) * 100}%`, background: 'var(--primary)', borderRadius: 3 }}></div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{((data.count / total) * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '✏️ Rename Designation' : '➕ Add Designation'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label form-label-required">Designation Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Regional Sales Manager"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={255}
                    required
                    autoFocus
                  />
                  {editing && countFor(editing.name) > 0 && (
                    <span className="form-hint">Renaming will update {countFor(editing.name)} assigned employee{countFor(editing.name) === 1 ? '' : 's'} too.</span>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '⏳ Saving…' : (editing ? '💾 Save Changes' : '➕ Add Designation')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
