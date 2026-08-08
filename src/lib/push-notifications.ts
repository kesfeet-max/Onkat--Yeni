import { supabase } from './supabase';

// VAPID Public Key - Web Push sunucu push için gerekli
// Bu key ile tarayıcı PushManager.subscribe() yaparak endpoint oluşturur
// Sunucu tarafındaki Edge Function aynı key pair'in private kısmıyla imzalar
const VAPID_PUBLIC_KEY = 'BIxuUF2hX4othdNdGzQ1tq5UMUuaIDE7lIiLUtELBqkR0qVipkEPlL8YM442ilG-TsSgCwJeCTvvFoFUauMHApE';

/**
 * Tarayıcı bildirim desteğini kontrol et
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;
}

/**
 * Mevcut bildirim izin durumunu döndür
 */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/**
 * Bildirim izni iste
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  
  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Service Worker'ı kaydet ve push subscription oluştur
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    if (!isPushSupported()) return null;

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.ready;
    
    // Mevcut subscription varsa döndür
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription && VAPID_PUBLIC_KEY) {
      // Yeni subscription oluştur (VAPID key varsa)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    return subscription;
  } catch (error) {
    console.warn('Push subscription hatası:', error);
    return null;
  }
}

/**
 * Push subscription'ı Supabase'e kaydet
 */
export async function saveSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('push_abonelik_kaydet', {
      p_subscription: JSON.stringify(subscription.toJSON()),
      p_endpoint: subscription.endpoint,
    });
    
    return !error && (data as any)?.success;
  } catch {
    return false;
  }
}

/**
 * Lokal push bildirim gönder (Service Worker üzerinden)
 * Bu, sunucu push olmadan da çalışır - PWA local notification
 */
export async function sendLocalNotification(title: string, options: {
  body?: string;
  tag?: string;
  url?: string;
  campaign_id?: string;
}): Promise<boolean> {
  try {
    if (Notification.permission !== 'granted') return false;
    
    const registration = await navigator.serviceWorker.ready;
    
    await registration.showNotification(title, {
      body: options.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [200, 100, 200, 100, 200],
      tag: options.tag || 'onkati-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      silent: false,
      data: {
        url: options.url || '/dashboard',
        campaign_id: options.campaign_id || null,
        timestamp: Date.now()
      },
    });
    
    return true;
  } catch (error) {
    console.warn('Local notification hatası:', error);
    return false;
  }
}

/**
 * Tüm aktif müşterilere kampanya bildirimi gönder
 * (Esnaf panelinden kampanya oluşturulduğunda çağrılır)
 * Gerçek Web Push: Supabase Edge Function üzerinden VAPID imzalı HTTP push
 */
export async function triggerCampaignNotification(campaignTitle: string, campaignId: string, storeName: string): Promise<{ sent: number; failed: number; total: number } | null> {
  try {
    // Önce local push bildirim gönder (kendi cihazımızda test için)
    await sendLocalNotification(`🎉 ${storeName} - Yeni Kampanya!`, {
      body: campaignTitle,
      tag: `campaign-${campaignId}`,
      url: '/dashboard',
      campaign_id: campaignId,
    });

    // Sunucu tarafı gerçek Web Push gönderimi (Edge Function)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

    const response = await fetch(`${supabaseUrl}/functions/v1/push-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        title: `🎉 ${storeName} - Yeni Kampanya!`,
        message: campaignTitle,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Push] Sunucu push sonucu:', result);
      return { sent: result.sent || 0, failed: result.failed || 0, total: result.total || 0 };
    } else {
      const err = await response.text();
      console.warn('[Push] Edge Function hatası:', response.status, err);
      return null;
    }
  } catch (error) {
    console.warn('[Push] Kampanya push tetikleme hatası:', error);
    return null;
  }
}

/**
 * Base64 URL string'i Uint8Array'e çevir (VAPID key için)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}