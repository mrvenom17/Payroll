'use client';

import { useState, createContext, useContext, useCallback } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setState({
        title: options.title || 'Confirm Action',
        message: options.message || 'Are you sure?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        variant: options.variant || 'primary', // primary, danger, warning, success
        icon: options.icon || '⚠️',
        resolve,
      });
    });
  }, []);

  const handleClose = (result) => {
    state?.resolve(result);
    setState(null);
  };

  const variantColors = {
    primary: 'var(--primary)', danger: 'var(--danger)',
    warning: 'var(--warning)', success: 'var(--success)',
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-overlay" onClick={() => handleClose(false)} style={{ zIndex: 10000 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, animation: 'fadeIn 0.2s ease' }}>
            <div className="modal-body" style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                background: `${variantColors[state.variant]}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}>
                {state.icon}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{state.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{state.message}</p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center', gap: 12 }}>
              <button className="btn btn-outline" onClick={() => handleClose(false)} style={{ minWidth: 100 }}>
                {state.cancelText}
              </button>
              <button
                className={`btn btn-${state.variant}`}
                onClick={() => handleClose(true)}
                style={{ minWidth: 100 }}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context;
}
