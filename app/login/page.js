'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await res.json();
      if (res.ok) {
        // Full reload to clear cache and re-render layout with auth
        window.location.href = '/';
      } else {
        setError(data.error || 'Authentication failed');
        setLoading(false);
      }
    } catch(err) {
      setError('Network error');
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 32, borderTop: '4px solid var(--primary)', animation: 'slideUp 0.4s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28, fontWeight: 800, margin: '0 auto 16px' }}>
            P
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Welcome Back</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Sign in to Payroll Management System</p>
        </div>

        {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>⚠️ {error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" className="form-input" 
              value={email} onChange={e => setEmail(e.target.value)} 
              placeholder="admin@company.com" required 
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Password
              <a href="#" style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>Forgot?</a>
            </label>
            <input 
              type="password" className="form-input" 
              value={password} onChange={e => setPassword(e.target.value)} 
              placeholder="••••••••" required 
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 15, marginTop: 12 }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In To Dashboard'}
          </button>
        </form>
        
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <p>Default: <b>admin@payroll.local</b> / <b>Admin@123</b></p>
        </div>
      </div>
      
      {/* Hide layout components for this page */}
      <style>{`
        .sidebar, .topbar { display: none !important; }
        .main-content { margin-left: 0 !important; }
        .page-content { padding: 0 !important; }
      `}</style>
    </div>
  );
}
