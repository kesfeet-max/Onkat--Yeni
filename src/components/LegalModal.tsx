import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface LegalModalProps {
  open: boolean;
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Yasal metinleri aynı sayfa üzerinde, ortalanmış ve kaydırılabilir bir kutuda gösterir.
 * ESC tuşu, arka plana tıklama, sağ üstteki çarpı veya "Anladım" butonu ile kapanır.
 */
export function LegalModal({ open, title, icon, onClose, children }: LegalModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <h2
            id="legal-modal-title"
            className="flex-1 text-base sm:text-lg font-heading font-bold text-primary-700 leading-snug"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 text-sm [&_h2]:text-base">
          {children}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="w-full bg-primary-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-primary-700 transition-colors shadow"
          >
            Anladım
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
