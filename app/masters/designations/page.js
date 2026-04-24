'use client';

import { useState, useEffect } from 'react';

export default function DesignationsPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/employees?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}&status=active`)
      .then(r => r.json())
      .then(d => { setEmployees(d.employees || []); setLoading(false); });
  }, []);

  const designations = {};
  employees.forEach(e => {
    const d = e.designation || 'Unassigned';
    if (!designations[d]) designations[d] = { count: 0, employees: [] };
    designations[d].count++;
    designations[d].employees.push(e);
  });

  const sorted = Object.entries(designations).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📋 Designations</h1>
          <p className="page-subtitle">All active designations across the organization</p>
        </div>
        <span className="badge badge-primary" style={{ fontSize: 14, padding: '6px 12px' }}>{sorted.length} Designations</span>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
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
              {sorted.map(([designation, data], i) => (
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
                        <div style={{ height: '100%', width: `${(data.count / employees.length) * 100}%`, background: 'var(--primary)', borderRadius: 3 }}></div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{((data.count / employees.length) * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
