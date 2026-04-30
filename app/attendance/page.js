'use client';

import { useState, useEffect } from 'react';

const MONTHS = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendancePage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState([]);
  const [withoutAttendance, setWithoutAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState({});
  const [msg, setMsg] = useState('');

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/attendance?company=${localStorage.getItem('active_company') || ''}&month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => {
        setRecords(d.records || []);
        setWithoutAttendance(d.withoutAttendance || []);
        // Init editing state
        const editMap = {};
        (d.records || []).forEach(r => {
          editMap[r.employee_id] = { ...r };
        });
        (d.withoutAttendance || []).forEach(e => {
          editMap[e.id] = {
            employee_id: e.id, month, year, full_name: e.full_name,
            employee_code: e.employee_code, total_working_days: 26,
            present_days: 26, absent_days: 0, paid_leaves: 0,
            unpaid_leaves: 0, overtime_hours: 0, late_marks: 0,
            half_days: 0, cl_balance: 6, sl_balance: 4, el_balance: 12,
          };
        });
        setEditing(editMap);
        setLoading(false);
      });
  };

  useEffect(fetchData, [month, year]);

  const updateField = (empId, field, value) => {
    setEditing(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: parseFloat(value) || 0 }
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    setMsg('');
    const entries = Object.values(editing).map(e => ({
      employee_id: e.employee_id, month, year,
      total_working_days: e.total_working_days,
      present_days: e.present_days, absent_days: e.absent_days,
      paid_leaves: e.paid_leaves, unpaid_leaves: e.unpaid_leaves,
      overtime_hours: e.overtime_hours, late_marks: e.late_marks,
      half_days: e.half_days, cl_balance: e.cl_balance,
      sl_balance: e.sl_balance, el_balance: e.el_balance,
    }));

    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulk: true, entries }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setMsg(`✅ Saved attendance for ${data.count} employees`);
      fetchData();
    } else {
      setMsg(`❌ Error: ${data.error}`);
    }
  };

  const allEmployees = [
    ...records.map(r => ({ ...r, hasRecord: true })),
    ...withoutAttendance.map(e => ({ ...e, employee_id: e.id, hasRecord: false })),
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">📅 Attendance</h1>
          <p className="page-subtitle">Monthly attendance management for {MONTHS[month]} {year}</p>
        </div>
        <div className="page-actions">
          <select className="form-select" style={{ width: 140 }} value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <input type="number" className="form-input" style={{ width: 90 }} value={year} onChange={e => setYear(parseInt(e.target.value))} />
          <button className="btn btn-success" onClick={saveAll} disabled={saving}>
            {saving ? '⏳ Saving...' : '💾 Save All'}
          </button>
        </div>
      </div>

      {msg && <div className={`alert ${msg.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>{msg}</div>}

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 20 }}>
        {[
          { label: 'Total Employees', value: allEmployees.length, cls: 'primary' },
          { label: 'Total Present', value: Object.values(editing).reduce((s, e) => s + (e.present_days || 0), 0), cls: 'success' },
          { label: 'Total Absent', value: Object.values(editing).reduce((s, e) => s + (e.absent_days || 0), 0), cls: 'danger' },
          { label: 'Total Leaves', value: Object.values(editing).reduce((s, e) => s + (e.paid_leaves || 0), 0), cls: 'info' },
          { label: 'Total OT Hours', value: Object.values(editing).reduce((s, e) => s + (e.overtime_hours || 0), 0), cls: 'warning' },
        ].map(s => (
          <div key={s.label} className={`stat-card stat-card--${s.cls}`}>
            <div><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
        <div className="table-container">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', zIndex: 2 }}>Employee</th>
                  <th>Working Days</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Paid Leave</th>
                  <th>Unpaid Leave</th>
                  <th>Half Days</th>
                  <th>OT Hours</th>
                  <th>Late Marks</th>
                  <th>CL Bal</th>
                  <th>SL Bal</th>
                  <th>EL Bal</th>
                </tr>
              </thead>
              <tbody>
                {allEmployees.map(emp => {
                  const empId = emp.employee_id || emp.id;
                  const e = editing[empId] || {};
                  return (
                    <tr key={empId}>
                      <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1, minWidth: 180 }}>
                        <div><strong>{emp.full_name}</strong></div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{emp.employee_code}</div>
                      </td>
                      {['total_working_days','present_days','absent_days','paid_leaves','unpaid_leaves','half_days','overtime_hours','late_marks','cl_balance','sl_balance','el_balance'].map(field => (
                        <td key={field}>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: 60, padding: '4px 6px', fontSize: 13, textAlign: 'center' }}
                            value={e[field] || 0}
                            onChange={ev => updateField(empId, field, ev.target.value)}
                            min={0}
                            step={field === 'overtime_hours' || field === 'half_days' ? 0.5 : 1}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
