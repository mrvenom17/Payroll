'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COLORS = ['#1B4D6E', '#2A6F97', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#FF6B35'];

function formatCurrency(amount) {
  if (!amount) return '₹0';
  if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1) + 'L';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function formatCurrencyFull(amount) {
  if (!amount) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';
}

// Simple bar chart component
function BarChart({ data, maxValue, colorFn, height = 120 }) {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'end', gap: 6, height, paddingTop: 8 }}>
      {data.map((item, i) => {
        const h = (item.value / max) * (height - 20);
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
              {item.value > 0 ? (item.value >= 1000 ? formatCurrency(item.value) : item.value) : ''}
            </span>
            <div style={{
              width: '100%', maxWidth: 32, height: Math.max(h, 3),
              background: colorFn ? colorFn(i) : `linear-gradient(180deg, ${COLORS[i % COLORS.length]}, ${COLORS[i % COLORS.length]}99)`,
              borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease',
            }}
            title={`${item.label}: ${item.value}`}
            />
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Donut chart component
function DonutChart({ segments, size = 140, strokeWidth = 18 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--gray-100)" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const value = total > 0 ? (seg.value / total) * circumference : 0;
          const offset = circumference - accumulated;
          accumulated += value;
          return (
            <circle key={i} cx={size/2} cy={size/2} r={radius} fill="none"
              stroke={seg.color} strokeWidth={strokeWidth}
              strokeDasharray={`${value} ${circumference - value}`}
              strokeDashoffset={offset}
              style={{ transition: 'all 0.6s ease' }}
            />
          );
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{total}</span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>Total</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payrollData, setPayrollData] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/dashboard?company=${localStorage.getItem('active_company') || ''}`).then(r => r.json()),
      fetch(`/api/payroll?company=${localStorage.getItem('active_company') || ''}&month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`).then(r => r.json()),
    ]).then(([dashData, payroll]) => {
      setData(dashData);
      setPayrollData(payroll);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div>
      </div>
    );
  }

  if (!data) return <div className="alert alert-danger">Failed to load dashboard data</div>;

  const monthName = MONTHS[data.currentMonth] || '';
  const summary = payrollData?.summary || {};

  // Quick action cards
  const quickActions = [
    { icon: '📅', label: 'Mark Attendance', href: '/attendance', color: 'var(--info)' },
    { icon: '🔄', label: 'Run Payroll', href: '/payroll', color: 'var(--success)' },
    { icon: '➕', label: 'Add Employee', href: '/employees/new', color: 'var(--primary)' },
    { icon: '🧾', label: 'View Payslips', href: '/payslip', color: 'var(--accent)' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Welcome back! Here's your payroll overview for {monthName} {data.currentYear}</p>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card stat-card--primary">
          <div>
            <div className="stat-value">{data.totalActive}</div>
            <div className="stat-label">Active Employees</div>
          </div>
          <div className="stat-icon stat-icon--primary">👥</div>
        </div>
        <div className="stat-card stat-card--success">
          <div>
            <div className="stat-value">{data.attendance?.present || 0}</div>
            <div className="stat-label">Present Today</div>
          </div>
          <div className="stat-icon stat-icon--success">✓</div>
        </div>
        <div className="stat-card stat-card--danger">
          <div>
            <div className="stat-value">{data.attendance?.absent || 0}</div>
            <div className="stat-label">Absent</div>
          </div>
          <div className="stat-icon stat-icon--danger">✗</div>
        </div>
        <div className="stat-card stat-card--accent">
          <div>
            <div className="stat-value currency">{formatCurrency(summary.totalNet || data.payroll?.totalPaid || 0)}</div>
            <div className="stat-label">Net Payable</div>
          </div>
          <div className="stat-icon stat-icon--accent">💰</div>
        </div>
        <div className="stat-card stat-card--purple">
          <div>
            <div className="stat-value currency">{formatCurrency(data.salary?.totalMonthlyCTC)}</div>
            <div className="stat-label">Monthly CTC</div>
          </div>
          <div className="stat-icon stat-icon--purple">📊</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {quickActions.map((action, i) => (
          <Link key={i} href={action.href} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}>
              <div className="card-body" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 24, width: 44, height: 44, borderRadius: 'var(--radius-md)', background: `${action.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {action.icon}
                </div>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{action.label}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 16 }}>→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts Row */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 24 }}>
        {/* Department Donut */}
        <div className="card">
          <div className="card-header"><span className="card-title">🏢 Department Distribution</span></div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <DonutChart
              segments={(data.departmentWise || []).map((d, i) => ({
                value: d.count,
                color: COLORS[i % COLORS.length],
              }))}
            />
            <div style={{ flex: 1 }}>
              {data.departmentWise?.map((dept, i) => (
                <div key={dept.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }}></div>
                  <span style={{ flex: 1, fontWeight: 500 }}>{dept.name}</span>
                  <span style={{ fontWeight: 700 }}>{dept.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Salary Distribution Bar */}
        <div className="card">
          <div className="card-header"><span className="card-title">💰 Payroll Breakdown ({monthName})</span></div>
          <div className="card-body">
            {summary.totalGross > 0 ? (
              <>
                <BarChart
                  data={[
                    { label: 'Gross', value: summary.totalGross },
                    { label: 'PF', value: summary.totalPF },
                    { label: 'ESIC', value: summary.totalESIC },
                    { label: 'PT', value: summary.totalPT },
                    { label: 'TDS', value: summary.totalTDS },
                    { label: 'Net', value: summary.totalNet },
                  ]}
                  colorFn={(i) => [
                    'var(--success)', 'var(--info)', 'var(--primary)',
                    'var(--warning)', 'var(--danger)', 'var(--primary-dark)',
                  ][i]}
                />
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Employer PF + ESIC:</span>
                    <strong>{formatCurrencyFull((summary.employerPF || 0) + (summary.employerESIC || 0))}</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="table-empty" style={{ padding: '30px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                <p style={{ fontSize: 13 }}>Process payroll to see breakdown</p>
              </div>
            )}
          </div>
        </div>

        {/* Employment Type */}
        <div className="card">
          <div className="card-header"><span className="card-title">📋 Employment Type</span></div>
          <div className="card-body">
            {data.employmentTypes?.map((type, i) => {
              const percentage = data.totalActive > 0 ? Math.round((type.count / data.totalActive) * 100) : 0;
              const color = type.employment_type === 'Permanent' ? 'var(--success)' : type.employment_type === 'Contract' ? 'var(--warning)' : 'var(--info)';
              return (
                <div key={type.employment_type} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{type.employment_type}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{type.count} ({percentage}%)</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percentage}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }}></div>
                  </div>
                </div>
              );
            })}

            {data.totalInactive > 0 && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger-border)', fontSize: 12, fontWeight: 600, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠️ {data.totalInactive} Exited Employee{data.totalInactive > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Probation + Payroll Status Row */}
      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        {/* Payroll Status */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">💵 Payroll Status — {monthName} {data.currentYear}</span>
            <Link href="/payroll" className="btn btn-sm btn-outline">Go to Payroll →</Link>
          </div>
          <div className="card-body">
            {(summary.draftCount + summary.approvedCount + summary.paidCount) > 0 ? (
              <>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  {[
                    { label: 'Draft', count: summary.draftCount, color: 'var(--warning)', bg: 'var(--warning-bg)' },
                    { label: 'Approved', count: summary.approvedCount, color: 'var(--info)', bg: 'var(--info-bg)' },
                    { label: 'Paid', count: summary.paidCount, color: 'var(--success)', bg: 'var(--success-bg)' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, padding: '12px 16px', background: s.bg, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.count}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: s.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--gray-100)' }}>
                  {summary.paidCount > 0 && <div style={{ flex: summary.paidCount, background: 'var(--success)', transition: 'flex 0.4s' }}></div>}
                  {summary.approvedCount > 0 && <div style={{ flex: summary.approvedCount, background: 'var(--info)', transition: 'flex 0.4s' }}></div>}
                  {summary.draftCount > 0 && <div style={{ flex: summary.draftCount, background: 'var(--warning)', transition: 'flex 0.4s' }}></div>}
                </div>
              </>
            ) : (
              <div className="table-empty" style={{ padding: '30px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔄</div>
                <p style={{ fontSize: 13 }}>Payroll not processed yet</p>
                <Link href="/payroll" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Process Payroll</Link>
              </div>
            )}
          </div>
        </div>

        {/* Probation */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🛡️ On Probation</span>
            <span className="badge badge-warning">{data.onProbation?.length || 0}</span>
          </div>
          <div className="card-body">
            {data.onProbation?.length > 0 ? (
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: 10 }}>Employee</th>
                    <th style={{ fontSize: 10 }}>Probation Ends</th>
                    <th style={{ fontSize: 10 }}>Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {data.onProbation.map(emp => {
                    const daysLeft = emp.probation_end_date
                      ? Math.max(0, Math.ceil((new Date(emp.probation_end_date) - new Date()) / (1000 * 60 * 60 * 24)))
                      : '—';
                    return (
                      <tr key={emp.id}>
                        <td>
                          <Link href={`/employees/${emp.id}`} style={{ textDecoration: 'none', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {emp.full_name}
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>{emp.employee_code}</div>
                          </Link>
                        </td>
                        <td>{formatDate(emp.probation_end_date)}</td>
                        <td>
                          <span className={`badge ${daysLeft <= 15 ? 'badge-danger' : daysLeft <= 30 ? 'badge-warning' : 'badge-info'}`}>
                            {daysLeft} days
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="table-empty" style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                <p style={{ fontSize: 13 }}>No employees on probation</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Widgets */}
      <div className="widget-grid-3">
        {/* Birthdays */}
        <div className="card">
          <div className="card-header"><span className="card-title">🎂 Birthdays</span></div>
          <div className="card-body">
            {data.todayBirthdays?.length > 0 ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Today</div>
                {data.todayBirthdays.map(emp => (
                  <div key={emp.id} className="employee-info" style={{ marginBottom: 8 }}>
                    <div className="employee-avatar" style={{ background: COLORS[2], width: 32, height: 32, fontSize: 12 }}>
                      {getInitials(emp.full_name)}
                    </div>
                    <div>
                      <div className="employee-name">{emp.full_name} 🎉</div>
                      <div className="employee-code">{emp.designation}</div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="table-empty" style={{ padding: '12px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No birthdays today</p>
              </div>
            )}
            {data.upcomingBirthdays?.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginTop: 12, marginBottom: 8 }}>Upcoming</div>
                {data.upcomingBirthdays.slice(0, 3).map(emp => (
                  <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                    <span style={{ fontWeight: 500 }}>{emp.full_name}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Work Anniversaries */}
        <div className="card">
          <div className="card-header"><span className="card-title">🏆 Work Anniversaries</span></div>
          <div className="card-body">
            {data.anniversaries?.length > 0 ? (
              data.anniversaries.map(emp => (
                <div key={emp.id} className="employee-info" style={{ marginBottom: 10 }}>
                  <div className="employee-avatar" style={{ background: COLORS[5], width: 32, height: 32, fontSize: 12 }}>
                    {getInitials(emp.full_name)}
                  </div>
                  <div>
                    <div className="employee-name">{emp.full_name}</div>
                    <div className="employee-code">{emp.years} year{emp.years > 1 ? 's' : ''} • {formatDate(emp.joining_date)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="table-empty" style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🏆</div>
                <p style={{ fontSize: 13 }}>No anniversaries this month</p>
              </div>
            )}
          </div>
        </div>

        {/* Statutory Summary */}
        <div className="card">
          <div className="card-header"><span className="card-title">🏛️ Statutory Summary</span></div>
          <div className="card-body">
            {summary.totalGross > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'PF (Employee)', value: summary.totalPF, color: 'var(--info)' },
                  { label: 'PF (Employer)', value: summary.employerPF, color: 'var(--info)' },
                  { label: 'ESIC Total', value: (summary.totalESIC || 0) + (summary.employerESIC || 0), color: 'var(--success)' },
                  { label: 'Prof. Tax', value: summary.totalPT, color: 'var(--warning)' },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${item.color}` }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{formatCurrencyFull(item.value)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-empty" style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🏛️</div>
                <p style={{ fontSize: 13 }}>Process payroll first</p>
              </div>
            )}
            <Link href="/reports/pf-esic" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12, fontWeight: 600 }}>
              View Full Report →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
