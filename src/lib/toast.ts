/**
 * Enterprise Toast Notification System
 * Kullanıcıya net geri bildirimler sağlar:
 * - Ağ kopmaları
 * - Yeniden deneme durumları
 * - İşlem sonuçları
 * - Hata bildirimleri
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'retry';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
}

type ToastListener = (toasts: Toast[]) => void;

class ToastManager {
  private toasts: Toast[] = [];
  private listeners: Set<ToastListener> = new Set();
  private maxToasts = 5;

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l([...this.toasts]));
  }

  show(toast: Omit<Toast, 'id'>): string {
    const id = crypto.randomUUID();
    const newToast: Toast = { ...toast, id };

    // Eski toast'ları temizle
    if (this.toasts.length >= this.maxToasts) {
      this.toasts = this.toasts.slice(-this.maxToasts + 1);
    }

    this.toasts.push(newToast);
    this.notify();

    // Otomatik kaldırma
    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3000);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  }

  dismissAll() {
    this.toasts = [];
    this.notify();
  }

  // Kısayollar
  success(title: string, message?: string) {
    return this.show({ type: 'success', title, message });
  }

  error(title: string, message?: string) {
    return this.show({ type: 'error', title, message, duration: 5000 });
  }

  warning(title: string, message?: string) {
    return this.show({ type: 'warning', title, message, duration: 4000 });
  }

  info(title: string, message?: string) {
    return this.show({ type: 'info', title, message });
  }

  retry(title: string, message?: string) {
    return this.show({ type: 'retry', title, message, duration: 2000 });
  }

  networkError() {
    return this.error(
      'Bağlantı Hatası',
      'İnternet bağlantınızı kontrol edin. Otomatik yeniden denenecek.'
    );
  }

  serverError() {
    return this.error(
      'Sunucu Hatası',
      'Sunucu geçici olarak yanıt vermiyor. Lütfen biraz bekleyin.'
    );
  }
}

export const toast = new ToastManager();