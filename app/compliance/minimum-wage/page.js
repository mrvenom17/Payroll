'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/Toast';

const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const DEFAULT_RATES = {
  'Unskilled': { daily: 399.25, monthly: 10381 },
  'Semi-skilled': { daily: 436.25, monthly: 11343 },
  'Skilled': { daily: 473.25, monthly: 12305 },
  'Highly Skilled': { daily: 530.25, monthly: 13787 },
};

const SLAB_KEY = 'min_wage_rates_mp';
const NOTE_KEY = 'min_wage_note_mp';

export default function MinWageCheckPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [note, setNote] = useState('Apr 2026 Gazette');
  const [editing, setEditing] = useState(false);
  const [draftRates, setDraftRates] = useState(DEFAULT_RATES);
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      fetch(`/api/employees?company=${localStorage.getItem('active_company') || ''}&status=active`).then(r => r.json()),
      fetch('/api/settings/integrations').then(r => r.json()),
    ]).then(([empData, settings]) => {
      setEmployees(empData.employees || []);
      const s = settings.settings || {};
      if (s[SLAB_KEY]) {
        try { setRates(JSON.parse(s[SLAB_KEY])); } catch {}
      }
      if (s[NOTE_KEY]) setNote(s[NOTE_KEY]);
      setLoading(false);
    });
  }, []);

  const startEdit = () => {
    setDraftRates(JSON.parse(JSON.stringify(rates)));
    setDraftNote(note);
    setEditing(true);
  };

  const saveRates = async () => {
    setSaving(true);
    const res = await fetch('/api/settings/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [SLAB_KEY]: JSON.stringify(draftRates),
        [NOTE_KEY]: draftNote,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setRates(draftRates);
      setNote(draftNote);
      setEditing(false);
      toast.success('Minimum wage slabs updated');
    } else {
      toast.error('Save failed');
    }
  };

  const resetToGazette = () => {
    setDraftRates(JSON.parse(JSON.stringify(DEFAULT_RATES)));
    toast.info('Reset to baseline rates — review and click Save to persist');
  };

  const updateDraft = (cat, field, val) => {
    setDraftRates(prev => ({
      ...prev,
      [cat]: { ...prev[cat], [field]: parseFloat(val) || 0 },
    }));
  };

  const results = employees.map(emp => {
    const category = emp.skill_category || 'Unskilled';
    const rate = rates[category] || rates['Unskilled'];
    const monthly = emp.ctc_monthly || 0;
    const compliant = monthly >= rate.monthly;
    const shortfall = compliant ? 0 : rate.monthly - monthly;
    return { ...emp, category, minWage: rate.monthly, compliant, shortfall };
  });

  const compliantCount = results.filter(r => r.compliant).length;
  const nonCompliantCount = results.filter(r => !r.compliant).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">✅ Minimum Wage Check</h1>
          <p className="page-subtitle">Validate employee wages against Madhya Pradesh minimum wage rates ({note})</p>
        </div>
        {!editing ? (
          <button className="btn btn-outline" onClick={startEdit}>✏️ Modify Slabs</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={resetToGazette}>↺ Reset to baseline</button>
            <button className="btn btn-outline" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-success" onClick={saveRates} disabled={saving}>{saving ? '⏳ Saving…' : '💾 Save Slabs'}</button>
          </div>
        )}
      </div>

      {/* Rate Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">📋 MP Minimum Wage Rates {editing ? '(editing)' : `(${note})`}</span>
        </div>
        <div className="card-body">
          {editing ? (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Notification / Period Note</label>
                <input className="form-input" value={draftNote} onChange={e => setDraftNote(e.target.value)} placeholder="e.g. Oct 2026 Gazette" style={{ maxWidth: 400 }} />
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Skill Category</th>
                    <th style={{ textAlign: 'right' }}>Daily Rate (₹)</th>
                    <th style={{ textAlign: 'right' }}>Monthly Rate (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(draftRates).map(([cat, rate]) => (
                    <tr key={cat}>
                      <td><strong>{cat}</strong></td>
                      <td style={{ textAlign: 'right' }}>
                        <input type="number" step="0.25" className="form-input" value={rate.daily}
                          onChange={e => updateDraft(cat, 'daily', e.target.value)}
                          style={{ width: 140, textAlign: 'right' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input type="number" className="form-input" value={rate.monthly}
                          onChange={e => updateDraft(cat, 'monthly', e.target.value)}
                          style={{ width: 140, textAlign: 'right' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
                💡 Update both daily and monthly columns when the gazette changes. The monthly value is what's checked against employee CTC.
              </p>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {Object.entries(rates).map(([cat, rate]) => (
                <div key={cat} style={{ padding: 16, background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{cat}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{fmt(rate.monthly)}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-tertiary)' }}>/mo</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{fmt(rate.daily)}/day</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="stat-card stat-card--primary"><div><div className="stat-value">{results.length}</div><div className="stat-label">Total Employees</div></div></div>
        <div className="stat-card stat-card--success"><div><div className="stat-value">{compliantCount}</div><div className="stat-label">Compliant</div></div><div className="stat-icon stat-icon--success">✅</div></div>
        <div className="stat-card stat-card--danger"><div><div className="stat-value">{nonCompliantCount}</div><div className="stat-label">Non-Compliant</div></div><div className="stat-icon stat-icon--danger">⚠️</div></div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>
      ) : (
        <div className="table-container">
          <div className="table-toolbar">
            <span className="card-title">Employee-wise Validation</span>
            {nonCompliantCount > 0 && (
              <div className="alert alert-danger" style={{ margin: 0, padding: '6px 12px' }}>⚠️ {nonCompliantCount} employees below minimum wage!</div>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Skill Category</th>
                <th style={{ textAlign: 'right' }}>Current CTC/mo</th>
                <th style={{ textAlign: 'right' }}>Minimum Required</th>
                <th style={{ textAlign: 'right' }}>Shortfall</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} style={!r.compliant ? { background: 'var(--danger-bg)' } : {}}>
                  <td>
                    <div><strong>{r.full_name}</strong></div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.employee_code} • {r.designation}</div>
                  </td>
                  <td><span className="badge badge-primary">{r.category}</span></td>
                  <td className="currency text-right font-bold">{fmt(r.ctc_monthly)}</td>
                  <td className="currency text-right">{fmt(r.minWage)}</td>
                  <td className="currency text-right" style={{ color: r.shortfall > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                    {r.shortfall > 0 ? `- ${fmt(r.shortfall)}` : '—'}
                  </td>
                  <td>
                    <span className={`badge ${r.compliant ? 'badge-success' : 'badge-danger'}`}>
                      {r.compliant ? '✅ Compliant' : '⚠️ Below Minimum'}
                    </span>
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
