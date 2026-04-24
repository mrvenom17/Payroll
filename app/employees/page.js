'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const COLORS = ['#1B4D6E','#2A6F97','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#FF6B35'];

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';
}

function formatCurrency(amount) {
  if (!amount) return '—';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');

  useEffect(() => {
    fetch(`/api/departments?company=${localStorage.getItem('active_company') || 'comp_uabiotech'}`)
      .then(r => r.json())
      .then(d => setDepartments(d.departments || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      company: localStorage.getItem('active_company') || 'comp_uabiotech',
      status: statusFilter,
    });
    if (search) params.set('search', search);
    if (deptFilter) params.set('department', deptFilter);

    fetch(`/api/employees?${params}`)
      .then(r => r.json())
      .then(d => { setEmployees(d.employees || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, statusFilter, deptFilter]);

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Manage your workforce</p>
        </div>
        <div className="page-actions">
          <Link href="/employees/new" className="btn btn-primary">
            ➕ Add Employee
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="table-container">
        <div className="table-toolbar">
          <div className="table-search">
            <span className="table-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by name, code, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: 140, padding: '8px 12px' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Exited</option>
            </select>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: 160, padding: '8px 12px' }}
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="page-loader"><div className="spinner"></div></div>
        ) : employees.length === 0 ? (
          <div className="table-empty">
            <div className="table-empty-icon">👥</div>
            <p>No employees found</p>
          </div>
        ) : (
          <table id="employees-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Location</th>
                <th>Type</th>
                <th>CTC (Annual)</th>
                <th>Joined</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, i) => (
                <tr key={emp.id}>
                  <td>
                    <Link href={`/employees/${emp.id}`} style={{ textDecoration: 'none' }}>
                      <div className="employee-info">
                        <div className="employee-avatar" style={{ background: COLORS[i % COLORS.length] }}>
                          {getInitials(emp.full_name)}
                        </div>
                        <div>
                          <div className="employee-name">{emp.full_name}</div>
                          <div className="employee-code">{emp.employee_code}</div>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td>{emp.department_name || '—'}</td>
                  <td>{emp.designation || '—'}</td>
                  <td>{emp.work_location || '—'}</td>
                  <td>
                    <span className={`badge ${
                      emp.employment_type === 'Permanent' ? 'badge-success' :
                      emp.employment_type === 'Contract' ? 'badge-warning' : 'badge-info'
                    }`}>
                      {emp.employment_type}
                    </span>
                  </td>
                  <td className="currency">{formatCurrency(emp.ctc_annual)}</td>
                  <td>{formatDate(emp.joining_date)}</td>
                  <td>
                    <span className={`badge ${emp.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {emp.is_active ? 'Active' : 'Exited'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link href={`/employees/${emp.id}`} className="btn btn-ghost btn-sm">👁️</Link>
                      <Link href={`/employees/${emp.id}/edit`} className="btn btn-ghost btn-sm">✏️</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="table-pagination">
          <span>Showing {employees.length} employee{employees.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
