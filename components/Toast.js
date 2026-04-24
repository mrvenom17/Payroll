'use client';

import { useState, createContext, useContext, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const toast = useCallback({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 6000),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info'),
  }, [addToast]);

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const colors = {
    success: { bg: 'var(--success-bg)', border: 'var(--success-border)', color: 'var(--success)' },
    error: { bg: 'var(--danger-bg)', border: 'var(--danger-border)', color: 'var(--danger)' },
    warning: { bg: 'var(--warning-bg)', border: 'var(--warning-border)', color: 'var(--warning)' },
    info: { bg: 'var(--info-bg)', border: 'var(--info-border)', color: 'var(--info)' },
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', top: 20, right: 20, zIndex: 10001,
        display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 20px', borderRadius: 'var(--radius-md)',
            background: colors[t.type].bg, border: `1px solid ${colors[t.type].border}`,
            color: colors[t.type].color, fontWeight: 600, fontSize: 14,
            boxShadow: 'var(--shadow-lg)', pointerEvents: 'auto',
            animation: 'slideInRight 0.3s ease', display: 'flex', alignItems: 'center', gap: 10, minWidth: 280,
          }}>
            <span style={{ fontSize: 18 }}>{icons[t.type]}</span>
            <span>{t.message}</span>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.6, color: 'inherit' }}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
