'use client';

import { useState, useEffect } from 'react';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendanceReportPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance?company=${localStorage.getItem('active_company') || ''}&month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setLoading(false); });
  }, [month, year]);

  const totals = records.reduce((acc, r) => ({
    workingDays: acc.workingDays + (r.total_working_days || 0),
    present: acc.present + (r.present_days || 0),
    absent: acc.absent + (r.absent_days || 0),
    paidLeave: acc.paidLeave + (r.paid_leaves || 0),
    unpaidLeave: acc.unpaidLeave + (r.unpaid_leaves || 0),
    halfDays: acc.halfDays + (r.half_days || 0),
    ot: acc.ot + (r.overtime_hours || 0),
    lateMark: acc.lateMark + (r.late_marks || 0),
  }), { workingDays: 0, present: 0, absent: 0, paidLeave: 0, unpaidLeave: 0, halfDays: 0, ot: 0, lateMark: 0 });

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📋 Attendance Report</h1>
          <p className="page-subtitle">Monthly attendance summary for {MONTHS[month]} {year}</p>
        </div>
        <div className="page-actions">
          <select className="form-select" style={{ width: 140 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <input type="number" className="form-input" style={{ width: 90 }} value={year} onChange={e => setYear(parseInt(e.target.value))} />
        </div>
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card stat-card--primary"><div><div className="stat-value">{records.length}</div><div className="stat-label">Employees</div></div></div>
        <div className="stat-card stat-card--success"><div><div className="stat-value">{totals.present}</div><div className="stat-label">Total Present Days</div></div></div>
        <div className="stat-card stat-card--danger"><div><div className="stat-value">{totals.absent}</div><div className="stat-label">Total Absent Days</div></div></div>
        <div className="stat-card stat-card--warning"><div><div className="stat-value">{totals.ot}</div><div className="stat-label">Total OT Hours</div></div></div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : records.length === 0 ? (
        <div className="card"><div className="card-body"><div className="table-empty"><div className="table-empty-icon">📋</div><p>No attendance data for {MONTHS[month]} {year}</p></div></div></div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Sl</th><th>Employee</th><th>Department</th>
                <th>Working Days</th><th>Present</th><th>Absent</th>
                <th>Paid Leave</th><th>Unpaid Leave</th><th>Half Days</th>
                <th>OT Hours</th><th>Late Marks</th>
                <th>CL</th><th>SL</th><th>EL</th><th>Attendance %</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const pct = r.total_working_days > 0 ? ((r.present_days + r.paid_leaves) / r.total_working_days * 100).toFixed(1) : 0;
                return (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td><div><strong>{r.full_name}</strong></div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code}</div></td>
                    <td>{r.department_name || '—'}</td>
                    <td>{r.total_working_days}</td>
                    <td className="text-success font-bold">{r.present_days}</td>
                    <td className={r.absent_days > 0 ? 'text-danger font-bold' : ''}>{r.absent_days}</td>
                    <td>{r.paid_leaves}</td>
                    <td className={r.unpaid_leaves > 0 ? 'text-danger' : ''}>{r.unpaid_leaves}</td>
                    <td>{r.half_days}</td>
                    <td>{r.overtime_hours}</td>
                    <td className={r.late_marks > 2 ? 'text-warning font-bold' : ''}>{r.late_marks}</td>
                    <td><span className="badge badge-success">{r.cl_balance}</span></td>
                    <td><span className="badge badge-info">{r.sl_balance}</span></td>
                    <td><span className="badge badge-warning">{r.el_balance}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 50, height: 5, background: 'var(--gray-100)', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--danger)', borderRadius: 3 }}></div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                <td></td><td>TOTAL</td><td></td>
                <td>{totals.workingDays}</td>
                <td className="text-success">{totals.present}</td>
                <td className="text-danger">{totals.absent}</td>
                <td>{totals.paidLeave}</td>
                <td>{totals.unpaidLeave}</td>
                <td>{totals.halfDays}</td>
                <td>{totals.ot}</td>
                <td>{totals.lateMark}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
