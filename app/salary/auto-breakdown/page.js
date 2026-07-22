'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmModal';

function fmt(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

const STATUS_BADGE = {
  MISSING: { label: 'No breakdown', cls: 'badge-danger' },
  MISMATCH: { label: 'Needs update', cls: 'badge-warning' },
};

// Union of component codes across current + proposed, in display order.
const ORDER = ['BASIC', 'HRA', 'CONV', 'PETROL', 'MED', 'SPL'];
function componentRows(current, proposed) {
  const cur = Object.fromEntries(current.map(c => [c.code, c]));
  const pro = Object.fromEntries(proposed.map(c => [c.code, c]));
  const codes = [...new Set([...ORDER, ...current.map(c => c.code), ...proposed.map(c => c.code)])]
    .filter(code => cur[code] || pro[code]);
  return codes.map(code => ({
    code,
    name: (pro[code] || cur[code]).name,
    current: cur[code] ? cur[code].monthly : null,
    proposed: pro[code] ? pro[code].monthly : null,
  }));
}

export default function AutoBreakdownPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    try {
      const company = localStorage.getItem('active_company') || '';
      const res = await fetch(`/api/salary-structures/auto-breakdown?company=${company}`);
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to load preview');
        setLoading(false);
        return;
      }
      setData(json);
      // Pre-select every employee that needs fixing.
      setSelected(new Set((json.candidates || []).map(c => c.employee_id)));
    } catch {
      toast.error('Network error');
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const candidates = data?.candidates || [];
  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates.map(c => c.employee_id)));
  };

  const apply = async () => {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: 'Apply auto-breakdown?',
      message: `This will permanently rewrite the salary component split for ${selected.size} employee(s). Their total CTC stays the same — only the Basic / HRA / allowances split is recalculated from the current template. This cannot be undone automatically.`,
      confirmText: `Yes, apply to ${selected.size}`,
      variant: 'danger',
    });
    if (!ok) return;

    setApplying(true);
    try {
      const company = localStorage.getItem('active_company') || '';
      const res = await fetch(`/api/salary-structures/auto-breakdown?company=${company}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_ids: [...selected] }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to apply');
      } else {
        const skipped = (json.results || []).filter(r => r.status !== 'APPLIED').length;
        toast.success(`Applied to ${json.applied} employee(s)${skipped ? `, ${skipped} skipped` : ''}.`);
        await load();
      }
    } catch {
      toast.error('Network error');
    }
    setApplying(false);
  };

  if (loading) {
    return <div className="page-loader"><div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div></div>;
  }

  if (denied) {
    return (
      <div className="animate-fade-in">
        <div className="card" style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Access restricted</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Only an <strong>Admin</strong> or <strong>Super Admin</strong> can run the salary auto-breakdown tool.
          </p>
          <Link href="/salary" className="btn btn-outline" style={{ marginTop: 20 }}>← Back to Salaries</Link>
        </div>
      </div>
    );
  }

  const t = data?.template || {};
  const s = data?.summary || {};

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Auto-Breakdown Existing Salaries</h1>
          <p className="page-subtitle">
            Recalculate the statutory component split for employees whose salary was never broken down. CTC is preserved — only the split changes.
          </p>
        </div>
        <Link href="/salary" className="btn btn-outline">← Back to Salaries</Link>
      </div>

      {/* Template being applied */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">⚙️ Template being applied</span></div>
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13 }}>
          <span><strong>Basic:</strong> {t.basic_pct}% of Gross</span>
          <span><strong>HRA:</strong> {t.hra_pct}% of Basic</span>
          <span><strong>Conveyance:</strong> {fmt(t.conv)}</span>
          <span><strong>Petrol:</strong> {fmt(t.petrol)}</span>
          <span><strong>Medical:</strong> {fmt(t.med)}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>Special Allowance = balancing amount</span>
        </div>
      </div>

      {/* Summary */}
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 20 }}>
        <div className="stat-card stat-card--primary">
          <div><div className="stat-value">{s.total_active_with_ctc ?? 0}</div><div className="stat-label">Active employees with CTC</div></div>
          <div className="stat-icon stat-icon--primary">👥</div>
        </div>
        <div className="stat-card stat-card--warning">
          <div><div className="stat-value">{s.needs_fix ?? 0}</div><div className="stat-label">Need breakdown</div></div>
          <div className="stat-icon stat-icon--warning">⚠️</div>
        </div>
        <div className="stat-card stat-card--success">
          <div><div className="stat-value">{s.already_ok ?? 0}</div><div className="stat-label">Already correct</div></div>
          <div className="stat-icon stat-icon--success">✅</div>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
          <h3 style={{ fontWeight: 700 }}>Everyone is already broken down correctly</h3>
          <p style={{ color: 'var(--text-secondary)' }}>No employee needs an auto-breakdown right now.</p>
        </div>
      ) : (
        <div className="table-container">
          <div className="table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">🔍 Review — {selected.size} of {candidates.length} selected</span>
            <button className="btn btn-primary" onClick={apply} disabled={applying || selected.size === 0}>
              {applying ? 'Applying…' : `Apply to ${selected.size} selected`}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all" />
                </th>
                <th>Employee</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Monthly CTC</th>
                <th style={{ textAlign: 'right' }}>Current split</th>
                <th style={{ textAlign: 'right' }}>Proposed split</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => {
                const badge = STATUS_BADGE[c.status] || STATUS_BADGE.MISMATCH;
                const isOpen = expanded.has(c.employee_id);
                const rows = componentRows(c.current, c.proposed);
                const currentBasic = c.current.find(x => x.code === 'BASIC')?.monthly;
                const proposedBasic = c.proposed.find(x => x.code === 'BASIC')?.monthly;
                return (
                  <Fragment key={c.employee_id}>
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(c.employee_id)}
                          onChange={() => toggle(c.employee_id)}
                        />
                      </td>
                      <td>
                        <Link href={`/employees/${c.employee_id}`} style={{ fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                          {c.full_name}
                        </Link>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.employee_code}</div>
                      </td>
                      <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                      <td className="currency text-right">{fmt(c.ctc_monthly)}</td>
                      <td className="text-right" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {c.current.length === 0 ? '—' : `Basic ${fmt(currentBasic)}`}
                      </td>
                      <td className="text-right" style={{ fontSize: 12, fontWeight: 600 }}>
                        Basic {fmt(proposedBasic)}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleExpand(c.employee_id)}>
                          {isOpen ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ background: 'var(--bg-secondary)', padding: 0 }}>
                          <table style={{ width: '100%', margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Component</th>
                                <th style={{ textAlign: 'right' }}>Current</th>
                                <th style={{ textAlign: 'right' }}>Proposed</th>
                                <th style={{ textAlign: 'right' }}>Change</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map(r => {
                                const diff = (r.proposed || 0) - (r.current || 0);
                                return (
                                  <tr key={r.code}>
                                    <td>{r.name} <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>({r.code})</span></td>
                                    <td className="text-right">{r.current == null ? '—' : fmt(r.current)}</td>
                                    <td className="text-right font-bold">{r.proposed == null ? '—' : fmt(r.proposed)}</td>
                                    <td className="text-right" style={{ color: diff === 0 ? 'var(--text-tertiary)' : diff > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                      {diff === 0 ? '—' : (diff > 0 ? '+' : '') + fmt(diff)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
