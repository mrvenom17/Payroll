'use client';

import { useState, useEffect } from 'react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ company: localStorage.getItem('active_company') || 'comp_uabiotech', limit: '100' });
    if (filter) params.set('action', filter);
    fetch(`/api/audit?${params}`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  const actionIcons = {
    PAYROLL_PROCESSED: '🔄', PAYROLL_APPROVED: '✅', PAYROLL_PAID: '💰',
    EMPLOYEE_CREATED: '👤', EMPLOYEE_UPDATED: '✏️', EMPLOYEE_DELETED: '🗑️',
    FNF_PROCESSED: '📝', LOAN_CREATED: '🏦', SALARY_REVISED: '💵',
    ATTENDANCE_SAVED: '📅',
  };

  const actionColors = {
    PAYROLL_PROCESSED: 'info', PAYROLL_APPROVED: 'success', PAYROLL_PAID: 'success',
    EMPLOYEE_CREATED: 'primary', EMPLOYEE_UPDATED: 'warning', EMPLOYEE_DELETED: 'danger',
    FNF_PROCESSED: 'purple', LOAN_CREATED: 'info', SALARY_REVISED: 'warning',
    ATTENDANCE_SAVED: 'info',
  };

  const formatDate = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const parseDetails = (details) => {
    try { return JSON.parse(details); } catch { return details; }
  };

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📋 Audit Logs</h1>
          <p className="page-subtitle">Track all system activities and changes</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="form-select" style={{ width: 'auto', minWidth: 180, padding: '8px 12px' }}
            value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All Actions</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>
          <span className="badge badge-info" style={{ fontSize: 13 }}>{logs.length} events</span>
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner"></div></div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>No audit logs yet</h3>
            <p style={{ color: 'var(--text-tertiary)' }}>Activities will appear here as you use the system</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: '20px 24px' }}>
            <div className="timeline">
              {logs.map(log => {
                const details = parseDetails(log.details);
                return (
                  <div key={log.id} className={`timeline-item timeline-item--${actionColors[log.action] || 'info'}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{actionIcons[log.action] || '📌'}</span>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{log.action?.replace(/_/g, ' ')}</span>
                          {log.entity_type && (
                            <span className="badge badge-info" style={{ marginLeft: 8, fontSize: 10 }}>{log.entity_type}</span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                    {details && typeof details === 'object' && (
                      <div style={{
                        marginTop: 6, padding: '8px 12px', background: 'var(--gray-50)',
                        borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-secondary)',
                      }}>
                        {Object.entries(details).map(([k, v]) => (
                          <span key={k} style={{ marginRight: 16 }}>
                            <strong>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                    {log.performed_by_name && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        by <strong>{log.performed_by_name}</strong>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
