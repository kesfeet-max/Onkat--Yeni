import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  History,
  CheckCircle,
  X,
  Loader2,
  LogOut,
  Store,
  QrCode,
  AlertCircle,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  Building2,
  Camera,
  ShieldCheck,
  ArrowLeft,
  SwitchCamera,
  User,
  Save,
  Bell,
  Megaphone,
  CalendarDays,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { scrollWindowToTop } from '../components/ScrollToTop';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { formatCurrency, formatDate } from '../lib/utils';
import { QREngine, CameraFacing, getSavedCameraPreference } from '../lib/qr-engine';
import { PHONE_LENGTH, normalizePhoneInput, validatePhone } from '../lib/validation';
import QRCode from 'qrcode';

type TabType = 'qr' | 'esnaflar' | 'gecmis' | 'duyurular' | 'profilim';

interface StoreBalance {
  id: string;
  merchant_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  last_transaction_at: string | null;
  store_name?: string;
}

interface TransactionRecord {
  id: string;
  merchant_id: string;
  type: 'earn' | 'spend' | 'cancel';
  amount: number;
  points: number;
  status: string;
  created_at: string;
  store_name?: string;
}

interface NotificationItem {
  id: string;
  type: 'earn' | 'spend';
  store_name: string;
  points: number;
  new_balance: number;
  timestamp: string;
}

interface CashierAssignment {
  cashier_id: string;
  merchant_id: string;
  store_name: string;
  merchant_store_id: number;
  is_active: boolean;
}

export function CustomerPanel() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('qr');
  // Alt menüden sekme değiştirildiğinde içerik her zaman en üstten başlar
  useEffect(() => {
    scrollWindowToTop();
  }, [activeTab]);
  const [dataLoading, setDataLoading] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [storeBalances, setStoreBalances] = useState<StoreBalance[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [latestNotification, setLatestNotification] = useState<NotificationItem | null>(null);
  const initializedRef = useRef(false);

  // Kasiyer modu state
  const [cashierAssignments, setCashierAssignments] = useState<CashierAssignment[]>([]);
  const [cashierMode, setCashierMode] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<CashierAssignment | null>(null);
  const [cashierScanning, setCashierScanning] = useState(false);
  const [cashierCustomer, setCashierCustomer] = useState<{ id: string; name: string } | null>(null);
  const [cashierAmount, setCashierAmount] = useState('');
  const [cashierPaymentType, setCashierPaymentType] = useState<'cash' | 'card'>('cash');
  const [cashierPointsToSpend, setCashierPointsToSpend] = useState('');
  const [cashierAction, setCashierAction] = useState<'earn' | 'spend'>('earn');
  const [cashierProcessing, setCashierProcessing] = useState(false);
  const [cashierResult, setCashierResult] = useState<any>(null);
  const [cashierFacingMode, setCashierFacingMode] = useState<CameraFacing>(getSavedCameraPreference());
  const [switchingCashierCamera, setSwitchingCashierCamera] = useState(false);
  const [cashierScannerReady, setCashierScannerReady] = useState(false);
  const [cashierCameraError, setCashierCameraError] = useState<string | null>(null);
  const cashierQrEngineRef = useRef<QREngine | null>(null);

  // Duyurular State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Push Bildirim State
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );
  const [pushSubscribing, setPushSubscribing] = useState(false);

  // Müşteri Profil Düzenleme Form State
  const [customerProfileForm, setCustomerProfileForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    new_password: '',
  });
  const [savingCustomerProfile, setSavingCustomerProfile] = useState(false);
  const [customerProfileFormInitialized, setCustomerProfileFormInitialized] = useState(false);

  const customer = profile as any;

  // Auth yüklenmesini bekle, sonra veri çek
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/giris');
      return;
    }
    if (!customer?.id) {
      setDataLoading(false);
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    loadData();
  }, [authLoading, user, customer?.id, navigate]);

  // Kasiyer QR Engine cleanup — component unmount veya kasiyer modu kapatıldığında
  useEffect(() => {
    return () => {
      if (cashierQrEngineRef.current) {
        cashierQrEngineRef.current.stop();
        cashierQrEngineRef.current = null;
      }
    };
  }, []);

  // Müşteri profil formunu başlat
  useEffect(() => {
    if (!customerProfileFormInitialized && customer && user) {
      setCustomerProfileForm({
        full_name: customer.full_name || '',
        phone: customer.phone || '',
        email: user.email || '',
        new_password: '',
      });
      setCustomerProfileFormInitialized(true);
    }
  }, [customer, user, customerProfileFormInitialized]);

  const handleSaveCustomerProfile = async () => {
    // Telefon başında 0 ile tam 11 hane olmalı
    const phoneResult = validatePhone(customerProfileForm.phone);
    if (!phoneResult.valid) {
      toast.error(phoneResult.message || 'Geçersiz telefon numarası.');
      return;
    }
    const cleanedPhone = normalizePhoneInput(customerProfileForm.phone);
    setCustomerProfileForm((prev) => ({ ...prev, phone: cleanedPhone }));

    setSavingCustomerProfile(true);
    try {
      // Customers tablosunu güncelle (phone)
      if (customer?.id) {
        const { error: customerError } = await supabase
          .from('customers')
          .update({ phone: cleanedPhone })
          .eq('id', customer.id);
        if (customerError) throw customerError;
      }

      // E-posta güncelle
      if (customerProfileForm.email && customerProfileForm.email !== user!.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email: customerProfileForm.email });
        if (emailError) throw emailError;
      }

      // Şifre güncelle (opsiyonel)
      if (customerProfileForm.new_password && customerProfileForm.new_password.length >= 6) {
        const { error: passError } = await supabase.auth.updateUser({ password: customerProfileForm.new_password });
        if (passError) throw passError;
        setCustomerProfileForm(prev => ({ ...prev, new_password: '' }));
      }

      toast.success('Bilgileriniz başarıyla güncellendi');
    } catch (err: any) {
      toast.error(err.message || 'Güncelleme sırasında hata oluştu');
    } finally {
      setSavingCustomerProfile(false);
    }
  };

  const loadData = async () => {
    try {
      setDataLoading(true);
      await Promise.all([
        generateCustomerQR(),
        fetchStoreBalances(),
        fetchTransactions(),
        checkCashierAuth(),
        fetchNotifications(),
      ]);
    } catch (err) {
      console.error('CustomerPanel loadData error:', err);
    } finally {
      setDataLoading(false);
    }
  };

  // Kasiyer yetkisi kontrolü
  const checkCashierAuth = async () => {
    try {
      const { data, error } = await supabase.rpc('kasiyer_yetki_kontrol');
      if (!error && data && (data as any).success) {
        const assignments = (data as any).assignments || [];
        setCashierAssignments(assignments);
      }
    } catch {
      // RPC henüz yoksa sessizce devam
    }
  };

  // ============ DUYURU FONKSİYONLARI ============
  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const { data, error } = await supabase.rpc('musteri_bildirimleri_getir');
      const r = data as any;
      if (!error && r?.success) {
        const notifs = r.notifications || [];
        setNotifications(notifs);
        setUnreadCount(notifs.filter((n: any) => !n.is_read).length);
      }
    } catch {
      // RPC henüz yoksa sessizce devam
    }
    setLoadingNotifications(false);
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const { data, error } = await supabase.rpc('bildirim_okundu', {
        p_notification_id: notificationId,
      });
      if (!error && (data as any)?.success) {
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      // sessizce devam
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    for (const id of unreadIds) {
      await handleMarkAsRead(id);
    }
  };

  // Push Bildirim İzni İste ve Abone Ol
  const handleEnablePushNotifications = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      toast.error('Tarayıcınız push bildirimleri desteklemiyor');
      return;
    }

    setPushSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission === 'granted') {
        // Service Worker hazır olana kadar bekle
        const registration = await navigator.serviceWorker.ready;

        // Mevcut subscription varsa al, yoksa VAPID key ile yeni oluştur
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          // VAPID Public Key ile yeni push subscription oluştur
          const VAPID_PUBLIC_KEY = 'BIxuUF2hX4othdNdGzQ1tq5UMUuaIDE7lIiLUtELBqkR0qVipkEPlL8YM442ilG-TsSgCwJeCTvvFoFUauMHApE';
          const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
            const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
              outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
          };

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        // Subscription'ı sunucuya kaydet (gerçek push için endpoint gerekli)
        if (subscription) {
          const { error: subError } = await supabase.rpc('push_abonelik_kaydet', {
            p_subscription: JSON.stringify(subscription.toJSON()),
            p_endpoint: subscription.endpoint,
          });
          if (subError) {
            console.warn('[Push] Abonelik kayıt hatası:', subError);
          } else {
            console.log('[Push] Abonelik başarıyla kaydedildi:', subscription.endpoint);
          }
        }

        toast.success('Bildirimler açıldı! Artık kampanya bildirimleri alacaksınız.');

        // Test bildirimi gönder — data.url zorunlu, yoksa tarayıcı "URL kopyala" gösterir
        await registration.showNotification('🔔 Onkatı Bildirimleri Aktif!', {
          body: 'Artık esnaflardan gelen kampanya bildirimlerini anında alacaksınız.',
          icon: '/assets/onkati-pwa-192.png?v=3',
          badge: '/assets/onkati-pwa-192.png?v=3',
          vibrate: [200, 100, 200],
          tag: 'push-enabled-test',
          renotify: true,
          silent: false,
          data: {
            url: '/panel',
            openUrl: '/panel',
            timestamp: Date.now()
          },
        });
      } else if (permission === 'denied') {
        toast.error('Bildirim izni reddedildi. Tarayıcı ayarlarından izin verebilirsiniz.');
      }
    } catch (err: any) {
      toast.error('Bildirim ayarlanırken hata oluştu');
      console.warn('Push notification error:', err);
    } finally {
      setPushSubscribing(false);
    }
  };

  // Sayfa yüklendiğinde push durumunu kontrol et
  useEffect(() => {
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  // Realtime
  useEffect(() => {
    if (!customer?.id) return;

    const channel = supabase
      .channel('customer-realtime-' + customer.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_customer_balances',
          filter: `customer_id=eq.${customer.id}`,
        },
        () => {
          fetchStoreBalances();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `customer_id=eq.${customer.id}`,
        },
        (payload: any) => {
          handleNewTransaction(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customer?.id]);

  const handleNewTransaction = async (tx: any) => {
    try {
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('store_name')
        .eq('id', tx.merchant_id)
        .single();

      const { data: balanceData } = await supabase
        .from('store_customer_balances')
        .select('balance')
        .eq('customer_id', tx.customer_id)
        .eq('merchant_id', tx.merchant_id)
        .single();

      const notification: NotificationItem = {
        id: tx.id,
        type: tx.type,
        store_name: merchantData?.store_name || 'Mağaza',
        points: tx.points || 0,
        new_balance: balanceData?.balance || 0,
        timestamp: tx.created_at,
      };

      setLatestNotification(notification);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 8000);

      fetchStoreBalances();
      fetchTransactions();
    } catch (err) {
      console.error('handleNewTransaction error:', err);
    }
  };

  const generateCustomerQR = useCallback(async () => {
    if (!customer?.id) return;
    try {
      const qrData = JSON.stringify({
        type: 'customer_qr',
        customer_id: customer.id,
        name: customer.full_name || 'Müşteri',
        ts: Date.now(),
      });

      const url = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: { dark: '#1a5f4a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      setQrCodeUrl(url);
    } catch (err) {
      console.error('QR generation error:', err);
    }
  }, [customer?.id, customer?.full_name]);

  // QR kodunu her 2 dakikada bir yenile
  useEffect(() => {
    if (!customer?.id) return;
    const interval = setInterval(() => {
      generateCustomerQR();
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [customer?.id, generateCustomerQR]);

  const fetchStoreBalances = useCallback(async () => {
    try {
      if (!customer?.id) return;

      const { data: balances, error } = await supabase
        .from('store_customer_balances')
        .select('*')
        .eq('customer_id', customer.id)
        .order('last_transaction_at', { ascending: false });

      if (error) {
        console.error('Balance fetch error:', error.message);
        setStoreBalances([]);
        return;
      }

      if (balances && balances.length > 0) {
        const merchantIds = balances.map((b: any) => b.merchant_id);
        const { data: merchants } = await supabase
          .from('merchants')
          .select('id, store_name')
          .in('id', merchantIds);

        const enriched = balances.map((b: any) => ({
          ...b,
          balance: b.balance || 0,
          total_earned: b.total_earned || 0,
          total_spent: b.total_spent || 0,
          store_name: merchants?.find((m: any) => m.id === b.merchant_id)?.store_name || 'Bilinmeyen',
        }));
        setStoreBalances(enriched);
      } else {
        setStoreBalances([]);
      }
    } catch (err) {
      console.error('Error fetching balances:', err);
      setStoreBalances([]);
    }
  }, [customer?.id]);

  const fetchTransactions = useCallback(async () => {
    try {
      if (!customer?.id) return;

      const { data: txData, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', customer.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Transaction fetch error:', error.message);
        setTransactions([]);
        return;
      }

      if (txData && txData.length > 0) {
        const merchantIds = [...new Set(txData.map((t: any) => t.merchant_id))];
        const { data: merchants } = await supabase
          .from('merchants')
          .select('id, store_name')
          .in('id', merchantIds);

        const enriched = txData.map((t: any) => ({
          ...t,
          amount: t.amount || 0,
          points: t.points || 0,
          store_name: merchants?.find((m: any) => m.id === t.merchant_id)?.store_name || 'Bilinmeyen',
        }));
        setTransactions(enriched);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setTransactions([]);
    }
  }, [customer?.id]);

  // ============ KASİYER MODU FONKSİYONLARI ============

  const startCashierScanner = useCallback(async () => {
    setCashierScanning(true);
    setCashierCustomer(null);
    setCashierResult(null);
    setCashierScannerReady(false);
    setCashierCameraError(null);

    // Eski engine varsa temizle
    if (cashierQrEngineRef.current) {
      await cashierQrEngineRef.current.stop();
      cashierQrEngineRef.current = null;
    }

    // DOM element'in mount olmasını bekle (1 frame)
    await new Promise(r => requestAnimationFrame(r));

    const engine = new QREngine({
      elementId: 'cashier-qr-reader',
      fps: 15,
      qrboxSize: 250,
      onScanSuccess: (decodedText: string) => {
        // QR okundu — kamerayı hemen kapat, işlemi başlat
        engine.stop();
        setCashierScanning(false);
        setCashierScannerReady(false);
        handleCashierQRResult(decodedText);
      },
      onCameraReady: () => {
        setCashierScannerReady(true);
      },
      onCameraError: (error: string) => {
        setCashierCameraError(error);
        setCashierScannerReady(false);
      },
    });

    cashierQrEngineRef.current = engine;
    await engine.start(cashierFacingMode);
  }, [cashierFacingMode]);

  const stopCashierScanner = useCallback(async () => {
    if (cashierQrEngineRef.current) {
      await cashierQrEngineRef.current.stop();
      cashierQrEngineRef.current = null;
    }
    setCashierScanning(false);
    setCashierScannerReady(false);
    setCashierCameraError(null);
  }, []);

  const switchCashierCamera = useCallback(async () => {
    if (!cashierQrEngineRef.current || switchingCashierCamera) return;
    setSwitchingCashierCamera(true);
    setCashierScannerReady(false);
    try {
      const newFacing = await cashierQrEngineRef.current.switchCamera();
      setCashierFacingMode(newFacing);
    } catch (err) {
      console.error('Camera switch error:', err);
    } finally {
      setSwitchingCashierCamera(false);
    }
  }, [switchingCashierCamera]);

  const handleCashierQRResult = useCallback((rawValue: string) => {
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed.type === 'customer_qr' && parsed.customer_id) {
        // Timestamp kontrolü (5 dakika)
        if (parsed.ts && Date.now() - parsed.ts > 5 * 60 * 1000) {
          alert('QR kodu süresi dolmuş. Müşteriden yeni QR göstermesini isteyin.');
          return;
        }
        // Engine zaten onScanSuccess içinde stop edildi
        setCashierCustomer({ id: parsed.customer_id, name: parsed.name || 'Müşteri' });
      }
    } catch {
      // Geçersiz QR — devam
    }
  }, []);

  const handleCashierEarn = async () => {
    if (!selectedAssignment || !cashierCustomer) return;
    const amount = parseFloat(cashierAmount);
    if (!amount || amount <= 0) return;

    setCashierProcessing(true);
    setCashierResult(null);

    try {
      const { data, error } = await supabase.rpc('kasiyer_puan_yukle', {
        p_cashier_id: selectedAssignment.cashier_id,
        p_customer_id: cashierCustomer.id,
        p_amount: amount,
        p_payment_type: cashierPaymentType,
      });

      if (!error && data && (data as any).success) {
        setCashierResult(data);
        setCashierAmount('');
      } else {
        setCashierResult({ success: false, error: (data as any)?.error || error?.message || 'İşlem başarısız' });
      }
    } catch (err: any) {
      setCashierResult({ success: false, error: 'Bağlantı hatası' });
    }
    setCashierProcessing(false);
  };

  const handleCashierSpend = async () => {
    if (!selectedAssignment || !cashierCustomer) return;
    const points = parseFloat(cashierPointsToSpend);
    if (!points || points <= 0) return;

    setCashierProcessing(true);
    setCashierResult(null);

    try {
      const { data, error } = await supabase.rpc('kasiyer_puan_harca', {
        p_cashier_id: selectedAssignment.cashier_id,
        p_customer_id: cashierCustomer.id,
        p_points_to_spend: points,
      });

      if (!error && data && (data as any).success) {
        setCashierResult(data);
        setCashierPointsToSpend('');
      } else {
        setCashierResult({ success: false, error: (data as any)?.error || error?.message || 'İşlem başarısız' });
      }
    } catch (err: any) {
      setCashierResult({ success: false, error: 'Bağlantı hatası' });
    }
    setCashierProcessing(false);
  };

  const exitCashierMode = () => {
    stopCashierScanner();
    setCashierMode(false);
    setSelectedAssignment(null);
    setCashierCustomer(null);
    setCashierResult(null);
    setCashierAmount('');
    setCashierPointsToSpend('');
  };

  const totalBalance = storeBalances.reduce((sum, b) => sum + (b.balance || 0), 0);
  const totalEarned = storeBalances.reduce((sum, b) => sum + (b.total_earned || 0), 0);
  const totalSpent = storeBalances.reduce((sum, b) => sum + (b.total_spent || 0), 0);

  // Auth hâlâ yükleniyor
  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-emerald-200 rounded-full animate-pulse mx-auto" />
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 absolute top-4 left-1/2 -translate-x-1/2" />
          </div>
          <p className="mt-4 text-gray-500 text-sm font-medium">Panelin yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Profil bulunamadı
  if (!customer?.id) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Profil Bulunamadı</h2>
          <p className="text-gray-500 text-sm mb-6">
            Müşteri profiliniz yüklenemedi. Lütfen çıkış yapıp tekrar giriş yapın.
          </p>
          <button
            onClick={signOut}
            className="w-full py-3 px-4 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    );
  }

  // ============ KASİYER MODU EKRANI ============
  if (cashierMode && selectedAssignment) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-gray-50">
        {/* Kasiyer Header */}
        <header className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 text-white px-5 py-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={exitCashierMode}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider">Kasiyer Modu</p>
                <h1 className="text-lg font-bold mt-0.5">{selectedAssignment.store_name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-200" />
              <span className="text-xs text-indigo-200">{customer.full_name}</span>
            </div>
          </div>
        </header>

        <main className="p-4 pb-24 max-w-lg mx-auto space-y-4">
          {/* Müşteri QR Tarama */}
          {!cashierCustomer && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-600" />
                Müşteri QR Kodunu Okutun
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Müşterinin telefonundaki QR kodunu kameraya gösterin.
              </p>

              {cashierScanning ? (
                <div className="space-y-3">
                  {/* Üst kontrol çubuğu */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      {cashierFacingMode === 'environment' ? '📷 Arka Kamera' : '🤳 Ön Kamera'}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={switchCashierCamera}
                        disabled={switchingCashierCamera || !cashierScannerReady}
                        className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title={cashierFacingMode === 'environment' ? 'Ön kameraya geç' : 'Arka kameraya geç'}
                      >
                        {switchingCashierCamera ? (
                          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                        ) : (
                          <SwitchCamera className="w-5 h-5 text-indigo-600" />
                        )}
                      </button>
                      <button onClick={stopCashierScanner} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200">
                        <X className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                  </div>
                  {/* QR Engine container */}
                  <div id="cashier-qr-reader" className="rounded-xl overflow-hidden min-h-[280px] bg-black" />
                  {!cashierScannerReady && !cashierCameraError && (
                    <div className="flex items-center justify-center py-3">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse mr-2" />
                      <span className="text-sm text-gray-500">Kamera başlatılıyor...</span>
                    </div>
                  )}
                  {cashierCameraError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-medium text-red-700">Kamera Hatası</span>
                      </div>
                      <p className="text-xs text-red-600 mb-2">{cashierCameraError}</p>
                      <button
                        onClick={startCashierScanner}
                        className="w-full py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 flex items-center justify-center gap-1"
                      >
                        Tekrar Dene
                      </button>
                    </div>
                  )}
                  {cashierScannerReady && (
                    <div className="flex items-center justify-center py-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                      <span className="text-xs text-green-600 font-medium">Kamera aktif — QR kodu gösterin</span>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={startCashierScanner}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition flex items-center justify-center gap-2"
                >
                  <QrCode className="w-5 h-5" />
                  QR Tara
                </button>
              )}
            </div>
          )}

          {/* Müşteri Bulundu — İşlem Yap */}
          {cashierCustomer && (
            <div className="space-y-4">
              {/* Müşteri Bilgisi */}
              <div className="bg-white rounded-2xl shadow-lg p-5 border border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{cashierCustomer.name}</p>
                    <p className="text-xs text-gray-500">Müşteri doğrulandı</p>
                  </div>
                </div>
              </div>

              {/* İşlem Tipi Seçimi */}
              <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setCashierAction('earn')}
                    className={`flex-1 py-3 rounded-xl font-semibold text-sm transition ${
                      cashierAction === 'earn'
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    💰 Puan Yükle
                  </button>
                  <button
                    onClick={() => setCashierAction('spend')}
                    className={`flex-1 py-3 rounded-xl font-semibold text-sm transition ${
                      cashierAction === 'spend'
                        ? 'bg-orange-600 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    🛒 Puan Harca
                  </button>
                </div>

                {cashierAction === 'earn' ? (
                  <div className="space-y-3">
                    {/* Ödeme Tipi */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCashierPaymentType('cash')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                          cashierPaymentType === 'cash'
                            ? 'bg-green-100 text-green-800 border-2 border-green-300'
                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                      >
                        💵 Nakit
                      </button>
                      <button
                        onClick={() => setCashierPaymentType('card')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                          cashierPaymentType === 'card'
                            ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                      >
                        💳 Kart
                      </button>
                    </div>

                    {/* Tutar */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Alışveriş Tutarı (₺)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={cashierAmount}
                        onChange={(e) => setCashierAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg font-semibold text-center"
                      />
                    </div>

                    <button
                      onClick={handleCashierEarn}
                      disabled={cashierProcessing || !cashierAmount}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl font-bold text-sm hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                    >
                      {cashierProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
                      Puan Yükle
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Harcanacak Puan</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={cashierPointsToSpend}
                        onChange={(e) => setCashierPointsToSpend(e.target.value.replace(/[^0-9.,]/g, ''))}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg font-semibold text-center"
                      />
                    </div>

                    <button
                      onClick={handleCashierSpend}
                      disabled={cashierProcessing || !cashierPointsToSpend}
                      className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl font-bold text-sm hover:from-orange-700 hover:to-orange-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                    >
                      {cashierProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                      Puan Harca
                    </button>
                  </div>
                )}
              </div>

              {/* İşlem Sonucu */}
              {cashierResult && (
                <div className={`rounded-2xl p-5 border ${
                  cashierResult.success
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  {cashierResult.success ? (
                    <div className="text-center">
                      <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                      <p className="font-bold text-emerald-800">{cashierResult.message}</p>
                      {cashierResult.points && (
                        <p className="text-sm text-emerald-600 mt-1">+{cashierResult.points} puan</p>
                      )}
                      {cashierResult.new_balance !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">Yeni bakiye: {cashierResult.new_balance} puan</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center">
                      <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
                      <p className="font-bold text-red-800">{cashierResult.error}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Yeni Müşteri Tara */}
              <button
                onClick={() => {
                  setCashierCustomer(null);
                  setCashierResult(null);
                  setCashierAmount('');
                  setCashierPointsToSpend('');
                }}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition flex items-center justify-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                Yeni Müşteri Tara
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ============ NORMAL MÜŞTERİ PANELİ ============
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-gray-50">
      {/* Anlık Bildirim */}
      {showNotification && latestNotification && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-bounce">
          <div className={`rounded-2xl p-4 shadow-2xl border backdrop-blur-sm ${
            latestNotification.type === 'earn'
              ? 'bg-emerald-50/95 border-emerald-300'
              : 'bg-orange-50/95 border-orange-300'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-full ${
                latestNotification.type === 'earn' ? 'bg-emerald-200' : 'bg-orange-200'
              }`}>
                {latestNotification.type === 'earn' ? (
                  <Sparkles className="w-5 h-5 text-emerald-700" />
                ) : (
                  <Wallet className="w-5 h-5 text-orange-700" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900">
                  {latestNotification.type === 'earn'
                    ? `+${latestNotification.points.toFixed(2)} Puan Kazandınız! 🎉`
                    : `${latestNotification.points.toFixed(2)} Puan Harcandı`
                  }
                </p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {latestNotification.store_name} • Bakiye: {latestNotification.new_balance.toFixed(2)}
                </p>
              </div>
              <button onClick={() => setShowNotification(false)} className="p-1">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header — ince, zarif başlık alanı (sadece banner) */}
      <header className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-5 pt-5 pb-14 shadow-lg">
        <div className="flex items-center gap-2 sm:gap-3 max-w-lg mx-auto">
          <BrandLogo to="/" size="panel" />
          {/* Karşılama metni iki satır: üstte selamlama, altta ad soyad (taşma yok) */}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] sm:text-xs font-semibold text-white/80 leading-tight">
              Hoş geldiniz
            </p>
            <h1 className="text-[15px] sm:text-lg font-bold leading-snug break-words">
              {customer.full_name || 'Müşteri'}
            </h1>
          </div>
        </div>
      </header>

      {/* Yüzer Bakiye Kartı — yeşil banner'ın üzerine taşar */}
      <div className="px-4 -mt-10 max-w-lg mx-auto relative z-10">
        <div className="bg-white rounded-3xl p-5 border border-emerald-50 shadow-[0_12px_32px_-8px_rgba(6,78,59,0.28)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-wide">Toplam Bakiye</p>
              <p className="text-[34px] leading-none font-black text-gray-800 mt-1.5">
                {totalBalance.toFixed(2)}
                <span className="text-lg font-semibold text-gray-500 ml-1.5">Puan</span>
              </p>
              <p className="text-emerald-600 text-xs font-semibold mt-2">≈ {totalBalance.toFixed(2)} TL değerinde</p>
            </div>
            <div className="w-14 h-14 shrink-0 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200/70">
              <Wallet className="w-7 h-7 text-white" />
            </div>
          </div>
          <div className="flex gap-5 mt-4 pt-3.5 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-gray-500">Kazanılan: <strong className="text-emerald-600">{totalEarned.toFixed(0)}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs text-gray-500">Harcanan: <strong className="text-orange-600">{totalSpent.toFixed(0)}</strong></span>
            </div>
          </div>
        </div>

        {/* Kasiyer Modu Butonu — sadece yetkili müşterilere gösterilir */}
        {cashierAssignments.length > 0 && (
          <div className="mt-3">
            {cashierAssignments.length === 1 ? (
              <button
                onClick={() => {
                  setSelectedAssignment(cashierAssignments[0]);
                  setCashierMode(true);
                }}
                className="w-full py-3 bg-white border border-indigo-100 rounded-2xl text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition flex items-center justify-center gap-2 shadow-[0_10px_24px_-10px_rgba(49,46,129,0.35)]"
              >
                <Building2 className="w-4 h-4" />
                🏢 Kasiyer İşlemleri — {cashierAssignments[0].store_name}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-500 text-xs font-semibold px-1">Kasiyer Yetkileri:</p>
                {cashierAssignments.map((a) => (
                  <button
                    key={a.cashier_id}
                    onClick={() => {
                      setSelectedAssignment(a);
                      setCashierMode(true);
                    }}
                    className="w-full py-2.5 bg-white border border-indigo-100 rounded-2xl text-indigo-700 font-semibold text-sm hover:bg-indigo-50 transition flex items-center justify-center gap-2 shadow-[0_10px_24px_-10px_rgba(49,46,129,0.35)]"
                  >
                    <Building2 className="w-4 h-4" />
                    🏢 {a.store_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>



      {/* Content */}
      <main className="p-4 pb-24 max-w-lg mx-auto">
        {/* QR Kodum Tab */}
        {activeTab === 'qr' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-6 text-center border border-gray-100">
              <div className="mb-5">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 px-5 py-2.5 rounded-full text-sm font-semibold border border-emerald-100">
                  <Sparkles className="w-4 h-4" />
                  Kişisel QR Kodunuz
                </div>
              </div>

              {qrCodeUrl ? (
                <div className="flex flex-col items-center">
                  <div className="bg-white p-4 rounded-2xl border-2 border-emerald-100 shadow-inner relative">
                    <img src={qrCodeUrl} alt="Müşteri QR Kodu" className="w-60 h-60" />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                      {customer.full_name}
                    </div>
                  </div>
                  <div className="mt-6 space-y-1">
                    <p className="text-gray-700 text-sm font-semibold">
                      💳 Kasada bu kodu okutun
                    </p>
                    <p className="text-gray-400 text-xs">
                      Esnaf bu kodu okutarak size puan yükleyecek veya harcayacak
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-60">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
                  <p className="text-gray-400 text-sm">QR kodu oluşturuluyor...</p>
                </div>
              )}
            </div>

            {/* Hızlı İstatistik */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
                <p className="text-xl font-bold text-emerald-700">{storeBalances.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Mağaza</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
                <p className="text-xl font-bold text-emerald-700">{totalEarned.toFixed(0)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Kazanılan</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center shadow-sm border border-gray-100">
                <p className="text-xl font-bold text-orange-600">{totalSpent.toFixed(0)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Harcanan</p>
              </div>
            </div>
          </div>
        )}

        {/* Esnaflar Tab */}
        {activeTab === 'esnaflar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Mağaza Bakiyelerim</h2>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                {storeBalances.length} mağaza
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Her mağazada ayrı bakiyeniz bulunur. Kazandığınız puanlar sadece o mağazada geçerlidir.
            </p>

            {storeBalances.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Store className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-600 font-medium">Henüz hiçbir mağazada bakiyeniz yok</p>
                <p className="text-gray-400 text-sm mt-2">QR kodunuzu kasaya okutarak puan kazanmaya başlayın</p>
              </div>
            ) : (
              <div className="space-y-3">
                {storeBalances.map((balance) => (
                  <div key={balance.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center">
                          <Store className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{balance.store_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {balance.last_transaction_at
                              ? `Son: ${formatDate(balance.last_transaction_at)}`
                              : 'Henüz işlem yok'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-emerald-700">{balance.balance.toFixed(2)}</p>
                        <p className="text-xs text-gray-400">Puan</p>
                      </div>
                    </div>

                    {/* Detay Barı */}
                    <div className="mt-3 pt-3 border-t border-gray-50">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                          <span className="text-xs text-gray-500">Kazanılan: <strong className="text-emerald-600">{balance.total_earned.toFixed(2)}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-orange-400 rounded-full" />
                          <span className="text-xs text-gray-500">Harcanan: <strong className="text-orange-600">{balance.total_spent.toFixed(2)}</strong></span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
                          style={{ width: `${balance.total_earned > 0 ? (balance.balance / balance.total_earned) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Geçmiş Tab */}
        {activeTab === 'gecmis' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800">İşlem Geçmişi</h2>

            {transactions.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-600 font-medium">Henüz işlem geçmişiniz yok</p>
                <p className="text-gray-400 text-sm mt-2">İlk alışverişinizde burada görünecek</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          tx.type === 'earn'
                            ? 'bg-gradient-to-br from-emerald-100 to-emerald-200'
                            : 'bg-gradient-to-br from-orange-100 to-orange-200'
                        }`}>
                          {tx.type === 'earn' ? (
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <Wallet className="w-5 h-5 text-orange-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{tx.store_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.created_at)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${
                          tx.type === 'earn' ? 'text-emerald-600' : 'text-orange-600'
                        }`}>
                          {tx.type === 'earn' ? '+' : '-'}{tx.points.toFixed(2)}
                        </p>
                        {tx.type === 'earn' && tx.amount > 0 && (
                          <p className="text-xs text-gray-400">{formatCurrency(tx.amount)} alışveriş</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Duyurular Tab */}
        {activeTab === 'duyurular' && (
          <div className="space-y-4">
            {/* Push Bildirim İzin Banner'ı */}
            {pushPermission !== 'granted' && (
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-4 shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Bildirimleri Açın!</p>
                    <p className="text-xs text-white/80 mt-0.5">
                      Kampanya ve fırsatlardan anında haberdar olmak için bildirimlere izin verin.
                    </p>
                    <button
                      onClick={handleEnablePushNotifications}
                      disabled={pushSubscribing}
                      className="mt-2.5 px-4 py-2 bg-white text-purple-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {pushSubscribing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Bell className="w-3.5 h-3.5" />
                      )}
                      {pushSubscribing ? 'Ayarlanıyor...' : 'Bildirimleri Aç'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bildirimler Aktif Rozeti */}
            {pushPermission === 'granted' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-green-700">Push bildirimleri aktif — kampanyalar anında telefonunuza düşecek</span>
              </div>
            )}

            {/* Başlık ve Tümünü Okundu İşaretle */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Bell className="w-5 h-5 text-purple-600" />
                Duyurular
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} yeni
                  </span>
                )}
              </h2>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-purple-600 font-medium hover:text-purple-800 transition"
                >
                  Tümünü Okundu İşaretle
                </button>
              )}
            </div>

            {/* Bildirim Listesi */}
            {loadingNotifications ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 text-center">
                <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">Henüz bildiriminiz yok</p>
                <p className="text-xs text-gray-400 mt-1">Esnaflardan gelen kampanya ve duyurular burada görünecek</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notif: any) => (
                  <div
                    key={notif.id}
                    onClick={() => !notif.is_read && handleMarkAsRead(notif.id)}
                    className={`bg-white rounded-2xl shadow-sm p-4 border transition cursor-pointer ${
                      notif.is_read
                        ? 'border-gray-100 opacity-70'
                        : 'border-purple-200 bg-purple-50/30 shadow-md'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        notif.is_read ? 'bg-gray-100' : 'bg-purple-100'
                      }`}>
                        <Megaphone className={`w-5 h-5 ${notif.is_read ? 'text-gray-400' : 'text-purple-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                            {notif.store_name || 'Kampanya'}
                          </span>
                          {!notif.is_read && (
                            <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                          )}
                        </div>
                        <p className="font-semibold text-sm text-gray-800 mt-1">{notif.title}</p>
                        {notif.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.description}</p>
                        )}

                        {/* Kampanya Gün ve Saat Bilgisi */}
                        {(notif.starts_at || notif.ends_at) && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {notif.starts_at && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] font-medium text-emerald-700">
                                <CalendarDays className="w-3 h-3" />
                                {new Date(notif.starts_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                {' '}
                                {new Date(notif.starts_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {notif.starts_at && notif.ends_at && (
                              <span className="text-[10px] text-gray-400">→</span>
                            )}
                            {notif.ends_at && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded-lg text-[10px] font-medium text-red-700">
                                <CalendarDays className="w-3 h-3" />
                                {new Date(notif.ends_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                {' '}
                                {new Date(notif.ends_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {/* Aktif/Süresi Dolmuş Rozeti */}
                            {notif.ends_at && new Date(notif.ends_at) > new Date() ? (
                              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-bold">
                                AKTİF
                              </span>
                            ) : notif.ends_at ? (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[9px] font-bold">
                                SONA ERDİ
                              </span>
                            ) : null}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                          <CalendarDays className="w-3 h-3" />
                          <span>{new Date(notif.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Profilim Tab */}
        {activeTab === 'profilim' && (
          <div className="space-y-4">
            {/* Bilgilerim Formu */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />
                Bilgilerim
              </h3>
              <div className="space-y-4">
                {/* Ad Soyad (Salt Okunur) */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Ad Soyad</label>
                  <input
                    type="text"
                    value={customerProfileForm.full_name}
                    disabled
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-600 text-sm cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">Güvenlik gereği değiştirilemez</p>
                </div>

                {/* Telefon Numarası */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Telefon Numarası</label>
                  <input
                    type="tel"
                    value={customerProfileForm.phone}
                    onChange={(e) => setCustomerProfileForm(prev => ({ ...prev, phone: normalizePhoneInput(e.target.value) }))}
                    placeholder="05073376385"
                    inputMode="numeric"
                    maxLength={PHONE_LENGTH}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition tracking-wide"
                  />
                  <p className="text-xs text-gray-400 mt-1">Başında 0 olacak şekilde 11 hane</p>
                </div>

                {/* E-posta Adresi */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">E-posta Adresi</label>
                  <input
                    type="email"
                    value={customerProfileForm.email}
                    onChange={(e) => setCustomerProfileForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="ornek@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition"
                  />
                </div>

                {/* Yeni Şifre (Opsiyonel) */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Yeni Şifre (Opsiyonel)</label>
                  <input
                    type="password"
                    value={customerProfileForm.new_password}
                    onChange={(e) => setCustomerProfileForm(prev => ({ ...prev, new_password: e.target.value }))}
                    placeholder="En az 6 karakter"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition"
                  />
                  <p className="text-xs text-gray-400 mt-1">Değiştirmek istemiyorsanız boş bırakın</p>
                </div>

                {/* Üyelik Tarihi (Salt Okunur) */}
                <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-2">
                  <span className="text-sm text-gray-500">Üyelik Tarihi</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {customer.created_at ? new Date(customer.created_at).toLocaleDateString('tr-TR') : '—'}
                  </span>
                </div>

                {/* Kaydet Butonu */}
                <button
                  onClick={handleSaveCustomerProfile}
                  disabled={savingCustomerProfile}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingCustomerProfile ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  {savingCustomerProfile ? 'Kaydediliyor...' : 'Bilgileri Güncelle'}
                </button>
              </div>
            </div>

            {/* Çıkış Yap Butonu */}
            <button
              onClick={signOut}
              className="w-full py-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 font-semibold hover:bg-red-100 transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              Çıkış Yap
            </button>
          </div>
        )}
      </main>

      {/* Fixed Bottom Navigation — arka plan üst başlıkla aynı kurumsal yeşil */}
      <nav className="fixed bottom-0 left-0 right-0 bg-primary-600 border-t border-primary-700 shadow-[0_-4px_16px_rgba(0,0,0,0.18)] z-50">
        <div className="max-w-lg mx-auto flex">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition ${
              activeTab === 'qr' ? 'text-secondary-300' : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <QrCode className="w-5 h-5" />
            <span className="text-xs font-medium">QR Kodum</span>
          </button>
          <button
            onClick={() => setActiveTab('esnaflar')}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition ${
              activeTab === 'esnaflar' ? 'text-secondary-300' : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <Store className="w-5 h-5" />
            <span className="text-xs font-medium">Esnaflar</span>
          </button>
          <button
            onClick={() => setActiveTab('gecmis')}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition ${
              activeTab === 'gecmis' ? 'text-secondary-300' : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-xs font-medium">Geçmiş</span>
          </button>
          <button
            onClick={() => { setActiveTab('duyurular'); fetchNotifications(); }}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition relative ${
              activeTab === 'duyurular' ? 'text-secondary-300' : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-xs font-medium">Duyurular</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1/4 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('profilim')}
            className={`flex-1 py-3 flex flex-col items-center gap-1 transition ${
              activeTab === 'profilim' ? 'text-secondary-300' : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-xs font-medium">Profilim</span>
          </button>
        </div>
      </nav>
    </div>
  );
}