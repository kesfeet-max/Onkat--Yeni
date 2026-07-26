/**
 * Enterprise Toast Container — Global bildirim sistemi
 * Ağ kopmaları, yeniden denemeler ve işlem sonuçları için
 */
import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, RefreshCw, X, WifiOff } from 'lucide-react';
import { toast, Toast, ToastType } from '../lib/toast';

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertCircle className="w-5 h-5 text-amber-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
  retry: <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />,
};

const bgMap: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-amber-50 border-amber-200',
  info: 'bg-blue-50 border-blue-200',
  retry: 'bg-orange-50 border-orange-200',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe(setToasts);
    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 p-3 rounded-xl border shadow-lg backdrop-blur-sm animate-in slide-in-from-right ${bgMap[t.type]}`}
        >
          <div className="shrink-0 mt-0.5">{iconMap[t.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{t.title}</p>
            {t.message && (
              <p className="text-xs text-gray-600 mt-0.5">{t.message}</p>
            )}
          </div>
          {t.dismissible !== false && (
            <button
              onClick={() => toast.dismiss(t.id)}
              className="shrink-0 p-1 rounded-lg hover:bg-black/5"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}