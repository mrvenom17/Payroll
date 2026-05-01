'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'var(--danger)', desc: 'Full system access' },
  { value: 'admin', label: 'Admin', color: 'var(--primary)', desc: 'Manage payroll & employees' },
  { value: 'hr', label: 'HR', color: 'var(--info)', desc: 'View & manage employees' },
  { value: 'viewer', label: 'Viewer', color: 'var(--text-tertiary)', desc: 'Read-only access' },
];

function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'; }

export default function UsersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'admin' });
  const [saving, setSaving] = useState(false);
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = () => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(loadUsers, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.password) return toast.error('Fill in all fields');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success('User created successfully');
        setShowForm(false);
        setForm({ full_name: '', email: '', password: '', role: 'admin' });
        loadUsers();
      } else {
        toast.error(d.error || 'Failed to create user');
      }
    } catch (err) {
      toast.error('Network error');
    }
    setSaving(false);
  };

  const toggleActive = async (user) => {
    const action = user.is_active ? 'deactivate' : 'reactivate';
    const ok = await confirm({
      title: `${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} User?`,
      message: `${action === 'deactivate' ? 'This will prevent' : 'This will allow'} ${user.full_name} (${user.email}) from logging in.`,
      confirmText: action === 'deactivate' ? 'Yes, Deactivate' : 'Yes, Reactivate',
      variant: action === 'deactivate' ? 'danger' : 'success',
    });
    if (!ok) return;

    const res = await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, action: 'toggle_active' }),
    });
    if (res.ok) {
      toast.success(`User ${action}d`);
      loadUsers();
    } else {
      toast.error('Failed to update user');
    }
  };

  const changeRole = async (userId, role) => {
    const res = await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, action: 'update_role', role }),
    });
    if (res.ok) {
      toast.success('Role updated');
      loadUsers();
    }
  };

  const resetPassword = async (userId) => {
    if (!newPassword || newPassword.length < 6) return toast.error('Min 6 characters');
    const res = await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, action: 'reset_password', new_password: newPassword }),
    });
    if (res.ok) {
      toast.success('Password reset successfully');
      setResetId(null);
      setNewPassword('');
    }
  };

  if (loading) return <div className="page-loader"><div className="spinner"></div></div>;

  const activeCount = users.filter(u => u.is_active).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">👥 User Management</h1>
          <p className="page-subtitle">Manage login accounts, roles, and access control</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '➕ Add User'}
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card stat-card--primary">
          <div><div className="stat-value">{users.length}</div><div className="stat-label">Total Users</div></div>
          <div className="stat-icon">👥</div>
        </div>
        <div className="stat-card stat-card--success">
          <div><div className="stat-value">{activeCount}</div><div className="stat-label">Active</div></div>
          <div className="stat-icon">✅</div>
        </div>
        <div className="stat-card stat-card--warning">
          <div><div className="stat-value">{users.length - activeCount}</div><div className="stat-label">Deactivated</div></div>
          <div className="stat-icon">🚫</div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: 24 }}>
          <div className="card-header"><span className="card-title">➕ New User</span></div>
          <div className="card-body">
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label form-label-required">Full Name</label>
                  <input className="form-input" placeholder="e.g., Rajesh Sharma" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Email</label>
                  <input type="email" className="form-input" placeholder="user@company.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label form-label-required">Password</label>
                  <input type="password" className="form-input" placeholder="Min 6 characters" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-success" disabled={saving}>
                {saving ? '⏳ Creating...' : '✅ Create User'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {users.length === 0 ? (
            <div className="table-empty">
              <div className="table-empty-icon">👤</div>
              <p>No users found</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => {
                    const roleInfo = ROLES.find(r => r.value === user.role) || ROLES[1];
                    return (
                      <tr key={user.id} style={{ opacity: user.is_active ? 1 : 0.55 }}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{user.full_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{user.email}</div>
                        </td>
                        <td>
                          <select
                            className="form-select"
                            value={user.role}
                            onChange={e => changeRole(user.id, e.target.value)}
                            style={{ width: 150, fontSize: 12, padding: '4px 8px', borderColor: roleInfo.color, color: roleInfo.color, fontWeight: 700 }}
                          >
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <span className={`badge ${user.is_active ? 'badge-success' : 'badge-danger'}`}>
                            {user.is_active ? '● Active' : '● Inactive'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatDate(user.last_login)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatDate(user.created_at)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {resetId === user.id ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                  type="password"
                                  className="form-input"
                                  style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
                                  placeholder="New password"
                                  value={newPassword}
                                  onChange={e => setNewPassword(e.target.value)}
                                  autoFocus
                                />
                                <button className="btn btn-success btn-sm" onClick={() => resetPassword(user.id)}>✓</button>
                                <button className="btn btn-outline btn-sm" onClick={() => { setResetId(null); setNewPassword(''); }}>✕</button>
                              </div>
                            ) : (
                              <>
                                <button className="btn btn-outline btn-sm" onClick={() => setResetId(user.id)} title="Reset Password">🔑</button>
                                <button
                                  className={`btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-success'}`}
                                  onClick={() => toggleActive(user)}
                                  title={user.is_active ? 'Deactivate' : 'Reactivate'}
                                >
                                  {user.is_active ? '🚫' : '✅'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
