'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function formatCurrency(amount) {
  if (!amount) return '—';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

export default function SalaryPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}&status=active`).then(r => r.json()),
      fetch('/api/salary-components').then(r => r.json()),
    ]).then(([empData, compData]) => {
      setEmployees(empData.employees || []);
      setComponents(compData.components || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const earnings = components.filter(c => c.type === 'EARNING');
  const deductions = components.filter(c => c.type === 'DEDUCTION');

  if (loading) {
    return <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Salaries</h1>
          <p className="page-subtitle">Employee salary structures and CTC breakdown</p>
        </div>
      </div>

      {/* Salary Summary Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="stat-card stat-card--primary">
          <div>
            <div className="stat-value">{employees.length}</div>
            <div className="stat-label">Employees with Salary</div>
          </div>
          <div className="stat-icon stat-icon--primary">👥</div>
        </div>
        <div className="stat-card stat-card--success">
          <div>
            <div className="stat-value currency" style={{ fontSize: 22 }}>
              {formatCurrency(employees.reduce((sum, e) => sum + (e.ctc_monthly || 0), 0))}
            </div>
            <div className="stat-label">Total Monthly CTC</div>
          </div>
          <div className="stat-icon stat-icon--success">💰</div>
        </div>
        <div className="stat-card stat-card--accent">
          <div>
            <div className="stat-value currency" style={{ fontSize: 22 }}>
              {formatCurrency(employees.reduce((sum, e) => sum + (e.ctc_annual || 0), 0))}
            </div>
            <div className="stat-label">Total Annual CTC</div>
          </div>
          <div className="stat-icon stat-icon--accent">📊</div>
        </div>
      </div>

      {/* Component Master */}
      <div className="dashboard-grid" style={{ marginBottom: 28 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">📈 Earning Components</span>
            <span className="badge badge-success">{earnings.length}</span>
          </div>
          <div className="card-body">
            {earnings.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Code: {c.code}
                    {c.percent_of && ` • ${c.default_percent}% of ${c.percent_of}`}
                    {c.is_statutory ? ' • Statutory' : ''}
                  </div>
                </div>
                <span className="badge badge-success">Earning</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">📉 Deduction Components</span>
            <span className="badge badge-danger">{deductions.length}</span>
          </div>
          <div className="card-body">
            {deductions.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Code: {c.code}
                    {c.percent_of && ` • ${c.default_percent}% of ${c.percent_of}`}
                    {c.is_statutory ? ' • Statutory' : ''}
                  </div>
                </div>
                <span className="badge badge-danger">Deduction</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Employee Salary Table */}
      <div className="table-container">
        <div className="table-toolbar">
          <span className="card-title">👥 Employee-wise Salary Structure</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              <th>Designation</th>
              <th style={{ textAlign: 'right' }}>Monthly CTC</th>
              <th style={{ textAlign: 'right' }}>Annual CTC</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td>
                  <div>
                    <div style={{ fontWeight: 600 }}>{emp.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{emp.employee_code}</div>
                  </div>
                </td>
                <td>{emp.department_name || '—'}</td>
                <td>{emp.designation || '—'}</td>
                <td className="currency text-right">{formatCurrency(emp.ctc_monthly)}</td>
                <td className="currency text-right font-bold">{formatCurrency(emp.ctc_annual)}</td>
                <td>
                  <Link href={`/employees/${emp.id}`} className="btn btn-ghost btn-sm">
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
