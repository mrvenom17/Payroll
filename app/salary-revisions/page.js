'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function formatCurrency(amt) { return '₹' + Number(amt || 0).toLocaleString('en-IN'); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

export default function SalaryRevisionsPage() {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const company = localStorage.getItem('active_company') || '';
    fetch(`/api/salary-revisions?company=${company}`)
      .then(r => r.json())
      .then(d => { setRevisions(d.revisions || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loader"><div className="spinner"></div></div>;

  // Stats
  const totalRevisions = revisions.length;
  const avgIncrement = totalRevisions > 0
    ? (revisions.filter(r => r.increment_pct !== '—').reduce((s, r) => s + parseFloat(r.increment_pct), 0) / revisions.filter(r => r.increment_pct !== '—').length).toFixed(1)
    : 0;
  const thisYear = revisions.filter(r => new Date(r.created_at).getFullYear() === new Date().getFullYear()).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📈 Salary Revisions</h1>
          <p className="page-subtitle">Track all CTC changes and increments across employees</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card stat-card--primary">
          <div>
            <div className="stat-value">{totalRevisions}</div>
            <div className="stat-label">Total Revisions</div>
          </div>
          <div className="stat-icon">📊</div>
        </div>
        <div className="stat-card stat-card--success">
          <div>
            <div className="stat-value">{avgIncrement}%</div>
            <div className="stat-label">Avg. Increment</div>
          </div>
          <div className="stat-icon">📈</div>
        </div>
        <div className="stat-card stat-card--info">
          <div>
            <div className="stat-value">{thisYear}</div>
            <div className="stat-label">This Year</div>
          </div>
          <div className="stat-icon">📅</div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Revision History</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {revisions.length === 0 ? (
            <div className="table-empty">
              <div className="table-empty-icon">📈</div>
              <p>No salary revisions recorded yet</p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>
                Revisions are automatically recorded when you update a salary structure
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th style={{ textAlign: 'right' }}>Old CTC</th>
                    <th style={{ textAlign: 'right' }}>New CTC</th>
                    <th style={{ textAlign: 'right' }}>Increment</th>
                    <th>Effective From</th>
                    <th>Reason</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.map(rev => {
                    const inc = parseFloat(rev.increment_pct);
                    const isPositive = !isNaN(inc) && inc > 0;
                    const isNeg = !isNaN(inc) && inc < 0;
                    return (
                      <tr key={rev.id}>
                        <td>
                          <Link href={`/employees/${rev.employee_id}`} style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                            {rev.full_name}
                          </Link>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rev.employee_code}</div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{rev.department_name || '—'}</td>
                        <td className="currency text-right" style={{ color: 'var(--text-tertiary)' }}>{formatCurrency(rev.old_ctc)}</td>
                        <td className="currency text-right font-bold">{formatCurrency(rev.new_ctc)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`badge ${isPositive ? 'badge-success' : isNeg ? 'badge-danger' : 'badge-info'}`}>
                            {isPositive ? '↑' : isNeg ? '↓' : ''} {rev.increment_pct}%
                          </span>
                        </td>
                        <td>{formatDate(rev.effective_from)}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rev.reason || '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatDate(rev.created_at)}</td>
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
