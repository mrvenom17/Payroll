'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';

export default function Topbar() {
  const router = useRouter();
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompany] = useState('');

  useEffect(() => {
    // Determine active company
    const stored = localStorage.getItem('active_company') || 'comp_uabiotech';
    setActiveCompany(stored);

    // Fetch Notifications
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => {
        if(d.notifications) setNotifications(d.notifications);
        if(d.unreadCount !== undefined) setUnreadCount(d.unreadCount);
      }).catch(console.error);
      
    // Fetch Companies
    fetch('/api/companies')
      .then(r => r.json())
      .then(d => {
        if(d.companies) setCompanies(d.companies);
      }).catch(console.error);
  }, []);

  const handleCompanyChange = (e) => {
    const newComp = e.target.value;
    localStorage.setItem('active_company', newComp);
    window.location.reload();
  };

  const markRead = async () => {
    if(unreadCount === 0) return;
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' })
      });
      setUnreadCount(0);
    } catch(e) {}
  };

  const handleToggle = () => {
    setShowDropdown(!showDropdown);
    if (!showDropdown) markRead();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
      toast.info('Signed out successfully');
      router.push('/login');
    } catch (e) {
      toast.error('Failed to sign out');
    }
  };

  return (
    <header className="topbar" id="main-topbar">
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <a href="/">HOME</a>
          <span className="topbar-breadcrumb-sep">/</span>
          <span className="topbar-breadcrumb-current" id="breadcrumb-current">DASHBOARD</span>
        </div>
      </div>

      <div className="topbar-right">
        <select className="topbar-company-select" id="company-select" value={activeCompany} onChange={handleCompanyChange}>
          {companies.length > 0 ? companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          )) : (
            <option value="comp_uabiotech">UA BIOTECH</option>
          )}
        </select>

        <div style={{ position: 'relative', marginLeft: 16 }}>
          <button className="btn btn-ghost" onClick={handleToggle} style={{ padding: 8, fontSize: 18, position: 'relative' }}>
            🔔
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--danger)', color: 'white', fontSize: 10, borderRadius: '10px', padding: '2px 6px', fontWeight: 'bold' }}>
                {unreadCount}
              </span>
            )}
          </button>
          
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', right: 0, width: 340, background: 'white', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)', zIndex: 100, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--gray-50)' }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Notifications</h3>
              </div>
              <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No notifications</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-100)', fontSize: 13, background: n.is_read ? 'white' : 'var(--primary-50)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span>{n.type === 'success' ? '✅' : n.type === 'error' ? '❌' : n.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                        <div>
                          <div style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.message}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{new Date(n.created_at).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="topbar-user" style={{ position: 'relative', cursor: 'default', marginLeft: 16 }}>
          <div className="topbar-avatar">HR</div>
          <div className="topbar-user-info">
            <span className="topbar-user-name">HR Admin</span>
            <span className="topbar-user-role">Administrator</span>
          </div>
          <button 
            onClick={handleLogout} 
            className="btn btn-ghost btn-sm" 
            style={{ marginLeft: 8, padding: '4px 8px', color: 'var(--danger)' }}
            title="Sign Out"
          >
            🚪
          </button>
        </div>
      </div>
    </header>
  );
}
