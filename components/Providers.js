'use client';

import { ConfirmProvider } from '@/components/ConfirmModal';
import { ToastProvider } from '@/components/Toast';

export default function Providers({ children }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
      </ConfirmProvider>
    </ToastProvider>
  );
}
