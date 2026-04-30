'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

const COLORS = ['#1B4D6E','#2A6F97','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empCounts, setEmpCounts] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const reload = () => {
    setLoading(true);
    const company = localStorage.getItem('active_company') || '';
    Promise.all([
      fetch(`/api/departments?company=${company}`).then(r => r.json()),
      fetch(`/api/employees?company=${company}&status=active`).then(r => r.json()),
    ]).then(([deptData, empData]) => {
      setDepartments(deptData.departments || []);
      const counts = {};
      (empData.employees || []).forEach(e => {
        counts[e.department_id] = (counts[e.department_id] || 0) + 1;
      });
      setEmpCounts(counts);
      setLoading(false);
    });
  };

  useEffect(reload, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', code: '' });
    setShowModal(true);
  };

  const openEdit = (dept) => {
    setEditing(dept);
    setForm({ name: dept.name, code: dept.code });
    setShowModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editing
        ? await fetch('/api/departments', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editing.id, ...form }),
          })
        : await fetch('/api/departments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: localStorage.getItem('active_company') || '',
              ...form,
            }),
          });
      const data = await res.json();
      if (res.ok) {
        toast.success(editing ? 'Department updated' : 'Department created');
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

  const remove = async (dept) => {
    const headCount = empCounts[dept.id] || 0;
    if (headCount > 0) {
      toast.error(`Cannot delete — ${headCount} employee${headCount === 1 ? '' : 's'} still assigned`);
      return;
    }
    const ok = await confirm({
      title: 'Delete Department?',
      message: `Remove department "${dept.name}" (${dept.code})? This cannot be undone.`,
      confirmText: 'Yes, Delete',
      variant: 'danger',
      icon: '🗑️',
    });
    if (!ok) return;
    const res = await fetch(`/api/departments?id=${dept.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { toast.success('Department deleted'); reload(); }
    else toast.error(data.error || 'Delete failed');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏢 Departments</h1>
          <p className="page-subtitle">Department master — {departments.length} total</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>➕ Add Department</button>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : departments.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="table-empty">
              <div className="table-empty-icon">🏢</div>
              <p>No departments yet</p>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={openNew}>➕ Add your first department</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {departments.map((dept, i) => {
            const count = empCounts[dept.id] || 0;
            return (
              <div key={dept.id} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ height: 4, background: COLORS[i % COLORS.length] }}></div>
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{dept.name}</h3>
                      <span className="badge badge-neutral">{dept.code}</span>
                    </div>
                    <div style={{
                      width: 48, height: 48, borderRadius: 'var(--radius-md)',
                      background: `${COLORS[i % COLORS.length]}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, fontWeight: 800, color: COLORS[i % COLORS.length]
                    }}>
                      {count}
                    </div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                    {count} employee{count !== 1 ? 's' : ''}
                  </div>
                  <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(dept)} title="Rename">✏️ Edit</button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: count > 0 ? 'var(--text-tertiary)' : 'var(--danger)' }}
                      onClick={() => remove(dept)}
                      disabled={count > 0}
                      title={count > 0 ? 'Reassign employees before deleting' : 'Delete department'}
                    >🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '✏️ Edit Department' : '➕ Add Department'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={save}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label form-label-required">Department Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Human Resources"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Short Code</label>
                  <input
                    className="form-input font-mono"
                    placeholder="e.g. HR"
                    value={form.code}
                    onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    maxLength={20}
                    style={{ textTransform: 'uppercase' }}
                    required
                  />
                  <span className="form-hint">2–20 chars, A–Z / 0–9 / _ / - · used to prefix employee codes and identify the dept in reports</span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '⏳ Saving…' : (editing ? '💾 Save Changes' : '➕ Create Department')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
