"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';
type Toast = { id: string; message: string; type?: ToastType };

const ToastContext = createContext<{ show: (msg: string, type?: ToastType) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 7);
    setToasts((s) => [{ id, message, type }, ...s]);
    setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      show(e.message ? `Error: ${e.message}` : 'Unexpected error', 'error');
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = (e.reason && (e.reason.message || String(e.reason))) || 'Unhandled promise rejection';
      show(`Error: ${msg}`, 'error');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [show]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type || 'info'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
