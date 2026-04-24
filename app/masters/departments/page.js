'use client';

import { useState, useEffect } from 'react';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empCounts, setEmpCounts] = useState({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/departments?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}`).then(r => r.json()),
      fetch(`/api/employees?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}&status=active`).then(r => r.json()),
    ]).then(([deptData, empData]) => {
      setDepartments(deptData.departments || []);
      const counts = {};
      (empData.employees || []).forEach(e => {
        counts[e.department_id] = (counts[e.department_id] || 0) + 1;
      });
      setEmpCounts(counts);
      setLoading(false);
    });
  }, []);

  const COLORS = ['#1B4D6E','#2A6F97','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6'];

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">🏢 Departments</h1>
          <p className="page-subtitle">Department master for UA BIOTECH</p>
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {departments.map((dept, i) => (
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
                    {empCounts[dept.id] || 0}
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {empCounts[dept.id] || 0} employee{(empCounts[dept.id] || 0) !== 1 ? 's' : ''}
                </div>
                {dept.head_id && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Head: {dept.head_id}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
