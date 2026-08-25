import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  QrCode,
  History,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  LogOut,
  Camera,
  CreditCard,
  Banknote,
  Wallet,
  Settings,
  TrendingUp,
  Users,
  Store,
  ArrowDownRight,
  ArrowUpRight,
  WifiOff,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  SwitchCamera,
  UserPlus,
  Shield,
  Clock,
  ToggleLeft,
  ToggleRight,
  Phone,
  Trash2,
  Moon,
  User,
  Save,
  Megaphone,
  Bell,
  CalendarDays,
  Target,
  Pause,
  Play,
  BadgeDollarSign,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import { QREngine, CameraFacing, getSavedCameraPreference } from '../lib/qr-engine';
import { withRetry, resilientRpc, resilientQuery } from '../lib/retry';
import { toast } from '../lib/toast';
import { triggerCampaignNotification } from '../lib/push-notifications';
import { SubscriptionTab } from '../components/SubscriptionTab';
import { BrandLogo } from '../components/BrandLogo';
import { scrollWindowToTop } from '../components/ScrollToTop';
import { resolveMerchantSubscription, buildStoreCode } from '../lib/subscription';

type MerchantTab = 'islem' | 'musteriler' | 'gecmis' | 'abonelik' | 'profilim';
type ProfileSubTab = 'bilgilerim' | 'kampanyalar' | 'kasiyerler' | 'guvenlik' | 'ayarlar';

interface CustomerInfo {
  customer_id: string;
  customer_name: string;
  store_balance: number;
  store_name: string;
}

interface CustomerRecord {
  id: string;
  customer_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  last_transaction_at: string | null;
  customer_name: string;
}

interface TransactionRecord {
  id: string;
  customer_id: string;
  type: 'earn' | 'spend' | 'cancel';
  amount: number;
  points: number;
  status: string;
  created_at: string;
  payment_type?: 'cash' | 'card' | null;
  cashier_id?: string | null;
  cashier_name?: string | null;
  customer_name?: string;
}

export function MerchantPanel() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MerchantTab>('islem');
  // Alt menüden sekme değiştirildiğinde içerik her zaman en üstten başlar
  useEffect(() => {
    scrollWindowToTop();
  }, [activeTab]);
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>('bilgilerim');
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [myCustomers, setMyCustomers] = useState<CustomerRecord[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cashPointsRate, setCashPointsRate] = useState<number>(7);
  const [cardPointsRate, setCardPointsRate] = useState<number>(5);
  const [savingRate, setSavingRate] = useState(false);

  // Geçmiş Tab — Takvim/Tarih Filtresi
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // Kasiyer Yönetimi
  const [cashiers, setCashiers] = useState<any[]>([]);
  const [newCashierPhone, setNewCashierPhone] = useState('');
  const [newCashierName, setNewCashierName] = useState('');
  const [addingCashier, setAddingCashier] = useState(false);

  // Güvenlik & Mesai Ayarları
  const [storeOpen, setStoreOpen] = useState(true);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [openingHour, setOpeningHour] = useState('09:00');
  const [closingHour, setClosingHour] = useState('22:00');
  const [savingSettings, setSavingSettings] = useState(false);

  // Profil Düzenleme Form State
  const [profileForm, setProfileForm] = useState({
    store_name: '',
    full_name: '',
    phone: '',
    email: '',
    new_password: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFormInitialized, setProfileFormInitialized] = useState(false);

  // Kampanya State
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [monthlyRemaining, setMonthlyRemaining] = useState(5);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    title: '',
    description: '',
    target_audience: 'all_customers',
    starts_at: new Date().toISOString().slice(0, 16),
    ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  });
  const [publishingCampaign, setPublishingCampaign] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // QR Scanner state — Enterprise QR Engine
  const [showScanner, setShowScanner] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>(getSavedCameraPreference());
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const qrEngineRef = useRef<QREngine | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  // İşlem state
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [actionMode, setActionMode] = useState<'idle' | 'earn' | 'spend'>('idle');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'card'>('cash');
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const merchant = profile as any;
  /**
   * Abonelik durumu tek noktadan hesaplanır. subscription_status / trial_ends_at /
   * subscription_paid_until alanları boş veya okunamamış olsa bile güvenli
   * varsayılanlara düşer, böylece panel beyaz ekran vermez.
   */
  const subscription = useMemo(
    () =>
      resolveMerchantSubscription({
        is_active: merchant?.is_active,
        subscription_status: merchant?.subscription_status,
        trial_ends_at: merchant?.trial_ends_at,
        subscription_paid_until: merchant?.subscription_paid_until,
        created_at: merchant?.created_at,
      }),
    [
      merchant?.is_active,
      merchant?.subscription_status,
      merchant?.trial_ends_at,
      merchant?.subscription_paid_until,
      merchant?.created_at,
    ]
  );
  const merchantStoreCode = buildStoreCode(merchant?.store_id);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/giris');
      return;
    }
    // Önce müşterileri yükle, sonra işlemleri (isimleri eşleştirmek için)
    fetchMyCustomers().then(() => fetchTransactions());
    fetchMerchantSettings();
    fetchCashiers();
    fetchStoreSettings();
    fetchCampaigns();
  }, [authLoading, user, navigate]);

  // Profil formunu başlat
  useEffect(() => {
    if (!profileFormInitialized && merchant && profile && user) {
      setProfileForm({
        store_name: merchant.store_name || '',
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        email: user.email || '',
        new_password: '',
      });
      setProfileFormInitialized(true);
    }
  }, [merchant, profile, user, profileFormInitialized]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      // Merchants tablosunu güncelle (full_name, phone, store_name)
      if (merchant?.id) {
        const { error: merchantError } = await supabase
          .from('merchants')
          .update({
            full_name: profileForm.full_name,
            phone: profileForm.phone,
            store_name: profileForm.store_name
          })
          .eq('id', merchant.id);
        if (merchantError) throw merchantError;
      }

      // E-posta güncelle
      if (profileForm.email && profileForm.email !== user!.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email: profileForm.email });
        if (emailError) throw emailError;
      }

      // Şifre güncelle (opsiyonel)
      if (profileForm.new_password && profileForm.new_password.length >= 6) {
        const { error: passError } = await supabase.auth.updateUser({ password: profileForm.new_password });
        if (passError) throw passError;
        setProfileForm(prev => ({ ...prev, new_password: '' }));
      }

      toast.success('Bilgileriniz başarıyla güncellendi');
    } catch (err: any) {
      toast.error(err.message || 'Güncelleme sırasında hata oluştu');
    } finally {
      setSavingProfile(false);
    }
  };

  // Realtime
  useEffect(() => {
    if (!merchant?.id) return;

    const channel = supabase
      .channel('merchant-transactions-' + merchant.id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
          filter: `merchant_id=eq.${merchant.id}`,
        },
        () => {
          fetchTransactions();
          fetchMyCustomers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchant?.id]);

  // myCustomers güncellendiğinde transaction isimlerini eşleştir
  useEffect(() => {
    if (myCustomers.length === 0 || transactions.length === 0) return;
    
    const needsUpdate = transactions.some(t => t.customer_name === 'Müşteri');
    if (!needsUpdate) return;

    setTransactions(prev => prev.map(t => ({
      ...t,
      customer_name: myCustomers.find(c => c.customer_id === t.customer_id)?.customer_name || t.customer_name || 'Müşteri',
    })));
  }, [myCustomers]);

  const fetchTransactions = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Resilient query — ağ kopmasında otomatik yeniden dene
      const { data: merchantData } = await resilientQuery(() =>
        supabase
          .from('merchants')
          .select('id')
          .eq('user_id', session.user.id)
          .single()
      );

      if (!merchantData) {
        setLoading(false);
        return;
      }

      const merchantId = (merchantData as any).id;

      const { data: txData, error } = await resilientQuery(() =>
        supabase
          .from('transactions')
          .select('*')
          .eq('merchant_id', merchantId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(100)
      );

      if (!error && txData) {
        const txList = txData as any[];
        
        // Unique customer_id'leri çıkar ve her biri için isim çek
        const uniqueCustomerIds = [...new Set(txList.map(t => t.customer_id).filter(Boolean))];
        const customerNameMap: Record<string, string> = {};

        // Paralel olarak müşteri isimlerini çek (musteri_bilgi_getir RPC)
        await Promise.all(
          uniqueCustomerIds.map(async (custId) => {
            try {
              const { data: info } = await supabase.rpc('musteri_bilgi_getir', {
                p_customer_id: custId,
              });
              const r = info as any;
              if (r?.success && r.customer_name) {
                customerNameMap[custId] = r.customer_name;
              }
            } catch {
              // Tek bir müşteri çekilemezse diğerlerini engelleme
            }
          })
        );

        setTransactions(txList.map((t: any) => ({
          ...t,
          customer_name: customerNameMap[t.customer_id] || 'Bilinmeyen Müşteri',
        })));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.networkError();
      }
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyCustomers = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Önce merchant_id'yi al
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('id')
        .eq('user_id', session.user.id)
        .single();
      if (!merchantData) return;

      const merchantId = (merchantData as any).id;

      // 1. RPC dene — store_customer_balances tablosundan
      const { data: result, error } = await resilientRpc(supabase, 'esnaf_musteri_listesi', undefined, {
        onRetry: () => {
          toast.retry('Müşteri listesi yeniden yükleniyor...');
        },
      });

      const r = result as any;
      if (!error && r?.success && Array.isArray(r.customers) && r.customers.length > 0) {
        const customers = r.customers.map((c: any) => ({
          id: c.id,
          customer_id: c.customer_id,
          balance: c.balance || 0,
          total_earned: c.total_earned || 0,
          total_spent: c.total_spent || 0,
          last_transaction_at: c.last_transaction_at,
          customer_name: c.customer_name || 'Müşteri',
        }));
        setMyCustomers(customers);
        return;
      }

      // 2. RPC boş döndü veya hata verdi — transactions tablosundan distinct müşterileri çek
      console.warn('RPC boş/hata, transactions tablosundan müşteri listesi oluşturuluyor...');
      
      const { data: txData } = await supabase
        .from('transactions')
        .select('customer_id, type, points, created_at')
        .eq('merchant_id', merchantId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (!txData || txData.length === 0) {
        setMyCustomers([]);
        return;
      }

      // Unique müşterileri ve bakiyelerini hesapla
      const customerMap: Record<string, { 
        customer_id: string; 
        total_earned: number; 
        total_spent: number; 
        last_transaction_at: string;
      }> = {};

      for (const tx of txData as any[]) {
        if (!tx.customer_id) continue;
        if (!customerMap[tx.customer_id]) {
          customerMap[tx.customer_id] = {
            customer_id: tx.customer_id,
            total_earned: 0,
            total_spent: 0,
            last_transaction_at: tx.created_at,
          };
        }
        if (tx.type === 'earn') {
          customerMap[tx.customer_id].total_earned += parseFloat(tx.points) || 0;
        } else if (tx.type === 'spend') {
          customerMap[tx.customer_id].total_spent += parseFloat(tx.points) || 0;
        }
      }

      // Her müşteri için isim çek
      const customerList = await Promise.all(
        Object.values(customerMap).map(async (c) => {
          let customerName = 'Müşteri';
          try {
            const { data: info } = await supabase.rpc('musteri_bilgi_getir', {
              p_customer_id: c.customer_id,
            });
            const infoR = info as any;
            if (infoR?.success && infoR.customer_name) {
              customerName = infoR.customer_name;
            }
          } catch {
            // İsim çekilemezse "Müşteri" kalır
          }
          return {
            id: c.customer_id,
            customer_id: c.customer_id,
            balance: Math.round((c.total_earned - c.total_spent) * 100) / 100,
            total_earned: Math.round(c.total_earned * 100) / 100,
            total_spent: Math.round(c.total_spent * 100) / 100,
            last_transaction_at: c.last_transaction_at,
            customer_name: customerName,
          };
        })
      );

      setMyCustomers(customerList);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.networkError();
      }
      console.error('Error fetching customers:', err);
      setMyCustomers([]);
    }
  }, []);

  const fetchMerchantSettings = async () => {
    if (!user) return;
    try {
      // Önce RPC ile dene (migration çalışmışsa)
      const { data: rpcData, error: rpcError } = await supabase.rpc('esnaf_oran_getir');

      if (!rpcError && rpcData && (rpcData as any).success === true) {
        const r = rpcData as any;
        const dbCashRate = Number(r.cash_points_rate);
        const dbCardRate = Number(r.card_points_rate);
        // DB'den dönen değeri doğrudan kullan
        setCashPointsRate(dbCashRate);
        setCardPointsRate(dbCardRate);
        // localStorage'ı da senkronize et (offline erişim için)
        localStorage.setItem('onkati_cash_rate', String(dbCashRate));
        localStorage.setItem('onkati_card_rate', String(dbCardRate));
        console.log(`[Oran] DB'den okundu: Nakit %${dbCashRate}, Kart %${dbCardRate}`);
        return;
      }

      // RPC yoksa doğrudan tablo dene
      const { data, error } = await supabase
        .from('merchants')
        .select('cash_points_rate, card_points_rate')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        const dbCash = (data as any).cash_points_rate;
        const dbCard = (data as any).card_points_rate;
        if (dbCash != null) {
          setCashPointsRate(Number(dbCash));
          localStorage.setItem('onkati_cash_rate', String(dbCash));
        }
        if (dbCard != null) {
          setCardPointsRate(Number(dbCard));
          localStorage.setItem('onkati_card_rate', String(dbCard));
        }
        console.log(`[Oran] Tablo'dan okundu: Nakit %${dbCash}, Kart %${dbCard}`);
      } else {
        // Fallback: localStorage'dan oku (migration henüz çalışmamışsa)
        const savedCash = localStorage.getItem('onkati_cash_rate');
        const savedCard = localStorage.getItem('onkati_card_rate');
        if (savedCash) setCashPointsRate(parseFloat(savedCash));
        if (savedCard) setCardPointsRate(parseFloat(savedCard));
        console.warn('[Oran] DB okunamadı, localStorage fallback kullanılıyor');
      }
    } catch (err) {
      // Fallback: localStorage (ağ hatası durumunda)
      const savedCash = localStorage.getItem('onkati_cash_rate');
      const savedCard = localStorage.getItem('onkati_card_rate');
      if (savedCash) setCashPointsRate(parseFloat(savedCash));
      if (savedCard) setCardPointsRate(parseFloat(savedCard));
      console.error('[Oran] Ağ hatası, localStorage fallback:', err);
    }
  };

  const saveRates = async () => {
    if (!user) return;
    setSavingRate(true);
    try {
      // Önce RPC ile kaydetmeyi dene (migration çalışmışsa)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('esnaf_oran_kaydet', {
        p_cash_rate: cashPointsRate,
        p_card_rate: cardPointsRate,
      });

      if (!rpcError && rpcResult && (rpcResult as any).success === true) {
        // RPC başarılı — DB'ye yazıldı
        localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
        localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
        setMessage({ type: 'success', text: 'Puan oranları veritabanına kaydedildi!' });
        toast.success('Puan oranları başarıyla güncellendi!');
      } else if (!rpcError && rpcResult && (rpcResult as any).success === false) {
        // RPC çalıştı ama iş mantığı hatası döndü
        const errMsg = (rpcResult as any).error || 'Bilinmeyen hata';
        console.error('esnaf_oran_kaydet iş mantığı hatası:', errMsg);
        setMessage({ type: 'error', text: `Kaydetme başarısız: ${errMsg}` });
        toast.error(`Oran kaydedilemedi: ${errMsg}`);
      } else {
        // RPC yoksa veya hata döndüyse doğrudan update dene
        console.warn('esnaf_oran_kaydet RPC kullanılamıyor, doğrudan update deneniyor...', rpcError?.message);
        const { error } = await supabase
          .from('merchants')
          .update({
            cash_points_rate: cashPointsRate,
            card_points_rate: cardPointsRate,
          })
          .eq('user_id', user.id);

        if (error) {
          console.error('Puan oranı kaydetme hatası:', error);
          if (error.message.includes('column') || error.message.includes('could not find')) {
            // Kolon henüz eklenmemiş — localStorage'a kaydet, çalışmaya devam et
            localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
            localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
            setMessage({ type: 'error', text: 'Veritabanı henüz hazır değil — oranlar cihaza kaydedildi. Lütfen yöneticinize başvurun.' });
            toast.error('DB hazır değil — cihaza kaydedildi');
          } else {
            setMessage({ type: 'error', text: 'Kaydetme başarısız: ' + error.message });
            toast.error('Puan oranları kaydedilemedi!');
          }
        } else {
          localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
          localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
          setMessage({ type: 'success', text: 'Puan oranları veritabanına kaydedildi!' });
          toast.success('Puan oranları başarıyla güncellendi!');
        }
      }
    } catch (err: any) {
      console.error('Puan oranı kaydetme hatası:', err);
      setMessage({ type: 'error', text: 'Bağlantı hatası — oranlar kaydedilemedi. İnternet bağlantınızı kontrol edin.' });
      toast.error('Bağlantı hatası — oranlar kaydedilemedi!');
    }
    // Kayıt sonrası state'i DB'den taze oku — sayfa yenilenmeden yeni oran geçerli olsun
    await fetchMerchantSettings();
    setTimeout(() => setMessage(null), 4000);
    setSavingRate(false);
  };

  // ============ KASİYER YÖNETİMİ FONKSİYONLARI ============
  const fetchCashiers = async () => {
    try {
      const { data, error } = await supabase.rpc('kasiyer_listele');
      if (!error && data && (data as any).success) {
        setCashiers((data as any).cashiers || []);
      }
    } catch {
      // RPC henüz yoksa sessizce devam
    }
  };

  const addCashier = async () => {
    if (!newCashierPhone.trim()) {
      toast.error('Telefon numarası gerekli');
      return;
    }
    setAddingCashier(true);
    try {
      const { data, error } = await supabase.rpc('kasiyer_ekle', {
        p_phone: newCashierPhone.trim(),
        p_full_name: newCashierName.trim() || '',
      });
      if (!error && data && (data as any).success) {
        const customerName = (data as any).customer_name || 'Kasiyer';
        toast.success(`${customerName} kasiyer olarak eklendi!`);
        setNewCashierPhone('');
        setNewCashierName('');
        fetchCashiers();
      } else {
        const errMsg = (data as any)?.error || error?.message || 'Kasiyer eklenemedi';
        toast.error(errMsg);
      }
    } catch (err: any) {
      toast.error('Bağlantı hatası');
    }
    setAddingCashier(false);
  };

  const toggleCashier = async (cashierId: string, currentActive: boolean) => {
    try {
      const { data, error } = await supabase.rpc('kasiyer_durum_degistir', {
        p_cashier_id: cashierId,
        p_is_active: !currentActive,
      });
      if (!error && data && (data as any).success) {
        toast.success(currentActive ? 'Kasiyer pasife alındı' : 'Kasiyer aktifleştirildi');
        fetchCashiers();
      }
    } catch {
      toast.error('İşlem başarısız');
    }
  };

  // ============ GÜVENLİK & MESAİ AYARLARI ============
  const fetchStoreSettings = async () => {
    try {
      const { data, error } = await supabase.rpc('magaza_ayar_getir');
      if (!error && data && (data as any).success) {
        const s = data as any;
        setStoreOpen(s.store_open ?? true);
        setAutoSchedule(s.auto_schedule_enabled ?? false);
        if (s.opening_hour) setOpeningHour(s.opening_hour);
        if (s.closing_hour) setClosingHour(s.closing_hour);
      }
    } catch {
      // RPC henüz yoksa varsayılanlarla devam
    }
  };

  const saveStoreSettings = async () => {
    setSavingSettings(true);
    try {
      const { data, error } = await supabase.rpc('magaza_ayar_kaydet', {
        p_store_open: storeOpen,
        p_auto_schedule: autoSchedule,
        p_opening_hour: autoSchedule ? openingHour : null,
        p_closing_hour: autoSchedule ? closingHour : null,
      });
      if (!error && data && (data as any).success) {
        toast.success('Mağaza ayarları kaydedildi!');
        setMessage({ type: 'success', text: 'Güvenlik ayarları güncellendi!' });
      } else {
        toast.error('Ayarlar kaydedilemedi');
      }
    } catch {
      toast.error('Bağlantı hatası');
    }
    setTimeout(() => setMessage(null), 3000);
    setSavingSettings(false);
  };

  // ============ KAMPANYA FONKSİYONLARI ============
  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const { data, error } = await supabase.rpc('kampanya_listele');
      const r = data as any;
      if (!error && r?.success) {
        setCampaigns(r.campaigns || []);
        setMonthlyUsed(r.monthly_used || 0);
        setMonthlyRemaining(r.monthly_remaining ?? 5);
      }
    } catch {
      // RPC henüz yoksa sessizce devam
    }
    setLoadingCampaigns(false);
  }, []);

  const handlePublishCampaign = async () => {
    if (!campaignForm.title.trim()) {
      toast.error('Kampanya başlığı gerekli');
      return;
    }
    if (!campaignForm.ends_at) {
      toast.error('Bitiş tarihi gerekli');
      return;
    }
    if (monthlyRemaining <= 0) {
      toast.error('Aylık bildirim limitinize ulaştınız');
      return;
    }

    setPublishingCampaign(true);
    try {
      const { data, error } = await supabase.rpc('kampanya_olustur', {
        p_title: campaignForm.title.trim(),
        p_description: campaignForm.description.trim(),
        p_target_audience: campaignForm.target_audience,
        p_starts_at: new Date(campaignForm.starts_at).toISOString(),
        p_ends_at: new Date(campaignForm.ends_at).toISOString(),
      });

      const r = data as any;
      if (!error && r?.success) {
        toast.success('Kampanya Yayınlandı!', `${r.notifications_sent} müşteriye bildirim gönderildi`);
        setCampaignForm({
          title: '',
          description: '',
          target_audience: 'all_customers',
          starts_at: new Date().toISOString().slice(0, 16),
          ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        });
        setShowCampaignForm(false);
        fetchCampaigns();



        // Sunucu tarafı gerçek Web Push gönderimi (Edge Function ile VAPID)
        try {
          const pushResult = await triggerCampaignNotification(
            campaignForm.title,
            r.campaign_id,
            merchantProfile?.store_name || 'Mağaza'
          );
          if (pushResult && pushResult.sent > 0) {
            toast.success(`${pushResult.sent} müşteriye push bildirim gönderildi`);
          } else if (pushResult && pushResult.total === 0) {
            console.log('[Push] Aktif push aboneliği bulunamadı');
          }
        } catch (pushErr) {
          console.warn('[Push] Sunucu push hatası:', pushErr);
        }
      } else {
        const errMsg = r?.error || error?.message || 'Kampanya oluşturulamadı';
        toast.error(errMsg);
      }
    } catch (err: any) {
      toast.error('Bağlantı hatası');
    }
    setPublishingCampaign(false);
  };

  const handleToggleCampaign = async (campaignId: string, currentActive: boolean) => {
    try {
      const { data, error } = await supabase.rpc('kampanya_durum_degistir', {
        p_campaign_id: campaignId,
        p_is_active: !currentActive,
      });
      const r = data as any;
      if (!error && r?.success) {
        toast.success(currentActive ? 'Kampanya pasife alındı' : 'Kampanya aktifleştirildi');
        fetchCampaigns();
      } else {
        toast.error('İşlem başarısız');
      }
    } catch {
      toast.error('Bağlantı hatası');
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm('Bu kampanyayı silmek istediğinize emin misiniz?')) return;
    try {
      const { data, error } = await supabase.rpc('kampanya_sil', {
        p_campaign_id: campaignId,
      });
      const r = data as any;
      if (!error && r?.success) {
        toast.success('Kampanya silindi');
        fetchCampaigns();
      } else {
        toast.error('Silme başarısız');
      }
    } catch {
      toast.error('Bağlantı hatası');
    }
  };

  // QR Scanner — Enterprise: Kamera milisaniyeler içinde açılır
  const startScanner = useCallback(async () => {
    // Önce UI'ı göster — kullanıcı anında feedback alsın
    setShowScanner(true);
    setScannerReady(false);
    setCameraError(null);

    // Eski engine varsa temizle
    if (qrEngineRef.current) {
      await qrEngineRef.current.stop();
      qrEngineRef.current = null;
    }

    // Micro-delay: DOM element'in mount olmasını bekle (1 frame)
    await new Promise(r => requestAnimationFrame(r));

    const engine = new QREngine({
      elementId: 'merchant-qr-reader',
      fps: 15,
      qrboxSize: 250,
      facingMode: cameraFacing,
      onScanSuccess: (decodedText: string) => {
        // QR okundu — kamerayı hemen kapat, işlemi başlat
        engine.stop();
        setShowScanner(false);
        setScannerReady(false);
        handleQRScan(decodedText);
      },
      onCameraReady: () => {
        setScannerReady(true);
      },
      onCameraError: (error: string) => {
        setCameraError(error);
        setScannerReady(false);
        toast.error('Kamera Hatası', error);
      },
    });

    qrEngineRef.current = engine;

    // Kamerayı kayıtlı tercihle başlat — getUserMedia anında tetiklenir
    await engine.start(cameraFacing);
  }, []);

  const stopScanner = useCallback(async () => {
    if (qrEngineRef.current) {
      await qrEngineRef.current.stop();
      qrEngineRef.current = null;
    }
    setShowScanner(false);
    setScannerReady(false);
    setCameraError(null);
  }, []);

  // Cleanup: component unmount olduğunda kamerayı kapat
  useEffect(() => {
    return () => {
      if (qrEngineRef.current) {
        qrEngineRef.current.stop();
        qrEngineRef.current = null;
      }
    };
  }, []);

  const handleQRScan = async (data: string) => {
    try {
      // QR verisini parse et — stateless doğrulama (sunucuya gitmeden)
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        setMessage({ type: 'error', text: 'Geçersiz QR formatı. Lütfen Onkatı müşteri QR kodunu okutun.' });
        return;
      }

      if (parsed.type !== 'customer_qr' || !parsed.customer_id) {
        setMessage({ type: 'error', text: 'Geçersiz QR kodu. Lütfen müşteri QR kodunu okutun.' });
        return;
      }

      // Timestamp kontrolü — 5 dakikadan eski QR'lar geçersiz (replay attack önleme)
      if (parsed.ts) {
        const qrAge = Date.now() - parsed.ts;
        if (qrAge > 5 * 60 * 1000) {
          setMessage({ type: 'error', text: 'QR kodun süresi dolmuş. Müşteriden yeni QR isteyin.' });
          return;
        }
      }

      // Müşteri bilgisini al — retry mekanizmalı
      const { data: result, error } = await resilientRpc(supabase, 'musteri_bilgi_getir', {
        p_customer_id: parsed.customer_id,
      }, {
        onRetry: (attempt) => {
          toast.retry('Yeniden deneniyor...', `Deneme ${attempt + 1}`);
        },
      });

      if (error) {
        setMessage({ type: 'error', text: 'Müşteri bilgisi alınamadı: ' + error.message });
        toast.error('Bağlantı Hatası', 'Müşteri bilgisi alınamadı');
        return;
      }

      if (!result || !(result as any).success) {
        setMessage({ type: 'error', text: (result as any)?.error || 'Müşteri bulunamadı' });
        return;
      }

      const r = result as any;
      setCustomerInfo({
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        store_balance: r.store_balance,
        store_name: r.store_name,
      });
      setActionMode('idle');
      setAmount('');
      setLastResult(null);
      setMessage(null);
      toast.success('Müşteri Tanındı', r.customer_name);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.networkError();
        setMessage({ type: 'error', text: 'Bağlantı zaman aşımına uğradı. Tekrar deneyin.' });
      } else {
        setMessage({ type: 'error', text: 'QR kodu okunamadı. Lütfen tekrar deneyin.' });
      }
    }
  };

  const handlePuanYukle = async () => {
    if (!customerInfo || !amount) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setMessage({ type: 'error', text: 'Geçerli bir tutar girin' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      // Aktif kasiyer varsa bilgisini ekle
      const activeCashier = cashiers.find((c: any) => c.is_active && c.user_id === user?.id);
      if (!subscription.isActive) {
        setProcessing(false);
        setMessage({ type: 'error', text: subscription.statusMessage });
        setActiveTab('abonelik');
        return;
      }
      const { data: result, error } = await resilientRpc(supabase, 'islem_puan_yukle', {
        p_customer_id: customerInfo.customer_id,
        p_amount: numAmount,
        p_payment_type: paymentType,
        p_cashier_id: activeCashier?.id || null,
        p_cashier_name: activeCashier?.full_name || null,
      }, {
        maxAttempts: 2, // Finansal işlem — max 2 deneme (idempotency key ile güvenli)
        onRetry: (attempt) => {
          toast.retry('İşlem yeniden deneniyor...', `Deneme ${attempt + 1}`);
        },
      });

      if (error) {
        setMessage({ type: 'error', text: 'İşlem hatası: ' + error.message });
        toast.error('İşlem Başarısız', error.message);
        return;
      }
      
      const r = result as any;
      if (!r?.success) {
        setMessage({ type: 'error', text: r?.error || 'İşlem başarısız' });
        return;
      }

      setLastResult(r);
      const rateInfo = r.rate_used ? ` (%${r.rate_used} oran)` : '';
      setMessage({ type: 'success', text: `${numAmount} TL → ${r.points} puan yüklendi!${rateInfo}` });
      toast.success('Puan Yüklendi!', `${r.points} puan başarıyla eklendi${rateInfo}`);
      setCustomerInfo(prev => prev ? { ...prev, store_balance: r.new_balance } : null);
      setAmount('');
      setActionMode('idle');
      fetchTransactions();
      fetchMyCustomers();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.networkError();
        setMessage({ type: 'error', text: 'Bağlantı zaman aşımına uğradı. Tekrar deneyin.' });
      } else {
        setMessage({ type: 'error', text: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
        toast.error('Hata', 'İşlem tamamlanamadı');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handlePuanHarca = async () => {
    if (!customerInfo || !amount) return;
    const numPoints = parseFloat(amount);
    if (isNaN(numPoints) || numPoints <= 0) {
      setMessage({ type: 'error', text: 'Geçerli bir puan miktarı girin' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      // Aktif kasiyer varsa bilgisini ekle
      const activeCashier = cashiers.find((c: any) => c.is_active && c.user_id === user?.id);
      if (!subscription.isActive) {
        setProcessing(false);
        setMessage({ type: 'error', text: subscription.statusMessage });
        setActiveTab('abonelik');
        return;
      }
      const { data: result, error } = await resilientRpc(supabase, 'islem_puan_harca', {
        p_customer_id: customerInfo.customer_id,
        p_points_to_spend: numPoints,
        p_cashier_id: activeCashier?.id || null,
        p_cashier_name: activeCashier?.full_name || null,
      }, {
        maxAttempts: 2,
        onRetry: (attempt) => {
          toast.retry('İşlem yeniden deneniyor...', `Deneme ${attempt + 1}`);
        },
      });

      if (error) {
        setMessage({ type: 'error', text: 'İşlem hatası: ' + error.message });
        toast.error('İşlem Başarısız', error.message);
        return;
      }

      const r = result as any;
      if (!r?.success) {
        setMessage({ type: 'error', text: r?.error || 'İşlem başarısız' });
        return;
      }

      setLastResult(r);
      setMessage({ type: 'success', text: `${numPoints} puan harcandı. Kalan: ${r.new_balance}` });
      toast.success('Puan Harcandı!', `${numPoints} puan kullanıldı`);
      setCustomerInfo(prev => prev ? { ...prev, store_balance: r.new_balance } : null);
      setAmount('');
      setActionMode('idle');
      fetchTransactions();
      fetchMyCustomers();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.networkError();
        setMessage({ type: 'error', text: 'Bağlantı zaman aşımına uğradı. Tekrar deneyin.' });
      } else {
        setMessage({ type: 'error', text: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
        toast.error('Hata', 'İşlem tamamlanamadı');
      }
    } finally {
      setProcessing(false);
    }
  };

  const resetCustomer = () => {
    setCustomerInfo(null);
    setActionMode('idle');
    setAmount('');
    setLastResult(null);
    setMessage(null);
  };

  // Stats
  const todayEarns = transactions.filter(t =>
    t.type === 'earn' && new Date(t.created_at).toDateString() === new Date().toDateString()
  );
  const todaySpends = transactions.filter(t =>
    t.type === 'spend' && new Date(t.created_at).toDateString() === new Date().toDateString()
  );
  const todayEarnPoints = todayEarns.reduce((s, t) => s + (t.points || 0), 0);
  const todaySpendPoints = todaySpends.reduce((s, t) => s + (t.points || 0), 0);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-gray-50">
      {/* Header — müşteri paneli ile birebir aynı ince başlık alanı */}
      <header className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-5 pt-5 pb-14 shadow-lg">
        <div className="flex items-center gap-2 sm:gap-3 max-w-lg mx-auto">
          <BrandLogo to="/" size="panel" />
          {/* Karşılama metni iki satır: üstte selamlama, altta işletme adı (taşma yok) */}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] sm:text-xs font-semibold text-white/80 leading-tight">
              Hoş geldiniz
            </p>
            <h1 className="text-[15px] sm:text-lg font-bold leading-snug break-words">
              {merchant?.store_name || 'Esnaf Paneli'}
            </h1>
          </div>
        </div>
      </header>

      {/* Yüzer Özet Kartları — yeşil banner'ın üzerine taşar */}
      <div className="px-4 -mt-10 max-w-lg mx-auto relative z-10">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl p-3.5 text-center border border-emerald-50 shadow-[0_12px_32px_-8px_rgba(6,78,59,0.28)]">
            <p className="text-2xl font-black text-gray-800">{myCustomers.length}</p>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Müşteri</p>
          </div>
          <div className="bg-white rounded-2xl p-3.5 text-center border border-emerald-50 shadow-[0_12px_32px_-8px_rgba(6,78,59,0.28)]">
            <p className="text-2xl font-black text-emerald-600">+{todayEarnPoints.toFixed(0)}</p>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Bugün Yüklenen</p>
          </div>
          <div className="bg-white rounded-2xl p-3.5 text-center border border-emerald-50 shadow-[0_12px_32px_-8px_rgba(6,78,59,0.28)]">
            <p className="text-2xl font-black text-orange-500">{todaySpendPoints.toFixed(0)}</p>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Bugün Harcanan</p>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mx-4 mt-3 p-3 rounded-xl flex items-start gap-2 ${
          message.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <p className="text-sm flex-1">{message.text}</p>
          <button onClick={() => setMessage(null)}>
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Ödeme uyarı banner'ı — bilgilendirir, işlem yapmayı ASLA engellemez */}
      {subscription.warningLevel !== 'none' && !subscription.isSuspended && (
        <div className="px-4 mt-3 max-w-lg mx-auto">
          <button
            onClick={() => setActiveTab('abonelik')}
            className={`w-full text-left rounded-2xl border p-4 flex items-start gap-3 shadow-sm transition hover:shadow-md ${
              subscription.warningLevel === 'critical'
                ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-orange-300'
                : 'bg-gradient-to-r from-yellow-50 to-amber-50 border-amber-300'
            }`}
          >
            <span className="relative shrink-0 mt-0.5">
              <span className="absolute inline-flex h-9 w-9 rounded-xl bg-orange-400/40 animate-ping" />
              <span className="relative w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-white" />
              </span>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-orange-900">{subscription.warningTitle}</span>
              <span className="block text-xs text-orange-800 mt-1 leading-relaxed">
                {subscription.warningMessage}
              </span>
              <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <BadgeDollarSign className="w-3.5 h-3.5" />
                Abonelik & Ödeme sayfasına git
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Content */}
      <main className="p-4 pb-24 max-w-lg mx-auto">
        {/* İşlem Tab — YALNIZCA yönetici manuel pasife aldıysa engellenir */}
        {activeTab === 'islem' && !subscription.isActive && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center border-2 border-red-200">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-red-700 mb-2">Hesabınız Pasif Durumda</h2>
            <p className="text-sm text-gray-600 mb-5">
              Hesabınız yönetici tarafından pasife alınmıştır. Havale/EFT dekontunuzu ilettiğinizde hesabınız tekrar
              açılır ve puan işlemlerine kaldığınız yerden devam edebilirsiniz.
            </p>
            <button
              onClick={() => setActiveTab('abonelik')}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3.5 rounded-xl font-bold hover:from-emerald-700 hover:to-teal-700 transition shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
            >
              <BadgeDollarSign className="w-5 h-5" />
              Abonelik & Ödeme Sayfasına Git
            </button>
          </div>
        )}

        {activeTab === 'islem' && subscription.isActive && (
          <div className="space-y-4">
            {!customerInfo ? (
              <>
                {!showScanner ? (
                  <div className="bg-white rounded-2xl shadow-lg p-6 text-center border border-gray-100">
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Camera className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800 mb-2">Müşteri QR Kodunu Okut</h2>
                    <p className="text-gray-500 text-sm mb-5">
                      Müşterinin telefonundaki QR kodu kameranıza göstermesini isteyin
                    </p>
                    <button
                      onClick={startScanner}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-4 rounded-xl font-bold text-lg hover:from-emerald-700 hover:to-teal-700 transition shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                    >
                      <QrCode className="w-5 h-5" />
                      QR Kodu Tara
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-lg p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-gray-800">QR Tarayıcı</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!qrEngineRef.current || switchingCamera) return;
                            setSwitchingCamera(true);
                            setScannerReady(false);
                            try {
                              const newFacing = await qrEngineRef.current.switchCamera();
                              setCameraFacing(newFacing);
                            } catch (err) {
                              console.warn('Kamera değiştirme hatası:', err);
                            } finally {
                              setSwitchingCamera(false);
                            }
                          }}
                          disabled={switchingCamera || !scannerReady}
                          className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title={cameraFacing === 'environment' ? 'Ön kameraya geç' : 'Arka kameraya geç'}
                        >
                          {switchingCamera ? (
                            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                          ) : (
                            <SwitchCamera className="w-5 h-5 text-emerald-600" />
                          )}
                        </button>
                        <button onClick={stopScanner} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200">
                          <X className="w-5 h-5 text-gray-600" />
                        </button>
                      </div>
                    </div>
                    {/* Kamera etiketi */}
                    <div className="flex items-center justify-center mb-2">
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                        {cameraFacing === 'environment' ? '📷 Arka Kamera' : '🤳 Ön Kamera'}
                      </span>
                    </div>
                    <div id="merchant-qr-reader" ref={scannerContainerRef} className="rounded-xl overflow-hidden min-h-[280px] bg-black" />
                    {!scannerReady && !cameraError && (
                      <div className="flex items-center justify-center py-3">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse mr-2" />
                        <span className="text-sm text-gray-500">Kamera başlatılıyor...</span>
                      </div>
                    )}
                    {cameraError && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <span className="text-sm font-medium text-red-700">Kamera Hatası</span>
                        </div>
                        <p className="text-xs text-red-600 mb-2">{cameraError}</p>
                        <button
                          onClick={startScanner}
                          className="w-full py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Tekrar Dene
                        </button>
                      </div>
                    )}
                    {scannerReady && (
                      <div className="flex items-center justify-center py-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                        <span className="text-xs text-green-600 font-medium">Kamera aktif — QR kodu gösterin</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Müşteri Bilgisi */}
                <div className="bg-white rounded-2xl shadow-lg p-5 border-2 border-emerald-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center">
                        <Users className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{customerInfo.customer_name}</p>
                        <p className="text-sm text-gray-500">Müşteri</p>
                      </div>
                    </div>
                    <button onClick={resetCustomer} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200">
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                    <p className="text-sm text-emerald-700 font-medium">Bu dükkandaki bakiyesi:</p>
                    <p className="text-3xl font-black text-emerald-800 mt-1">
                      {customerInfo.store_balance.toFixed(2)} <span className="text-lg font-medium">Puan</span>
                    </p>
                  </div>
                </div>

                {/* İşlem Butonları */}
                {actionMode === 'idle' && !lastResult && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setActionMode('earn')}
                      className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white py-5 rounded-xl font-bold hover:from-emerald-600 hover:to-emerald-700 transition shadow-lg shadow-emerald-200 flex flex-col items-center gap-2"
                    >
                      <TrendingUp className="w-7 h-7" />
                      Puan Yükle
                    </button>
                    <button
                      onClick={() => setActionMode('spend')}
                      className="bg-gradient-to-br from-orange-400 to-orange-500 text-white py-5 rounded-xl font-bold hover:from-orange-500 hover:to-orange-600 transition shadow-lg shadow-orange-200 flex flex-col items-center gap-2"
                    >
                      <Wallet className="w-7 h-7" />
                      Puan Harca
                    </button>
                  </div>
                )}

                {/* Puan Yükleme */}
                {actionMode === 'earn' && (
                  <div className="bg-white rounded-2xl shadow-lg p-5 space-y-4 border border-gray-100">
                    <h3 className="font-bold text-gray-800 text-center text-lg">💰 Puan Yükle</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Alışveriş Tutarı (TL)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                          setAmount(val);
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="Örn: 150"
                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Ödeme Tipi</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setPaymentType('cash')}
                          className={`py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 font-medium transition ${
                            paymentType === 'cash'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 text-gray-600'
                          }`}
                        >
                          <Banknote className="w-5 h-5" /> Nakit
                        </button>
                        <button
                          onClick={() => setPaymentType('card')}
                          className={`py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 font-medium transition ${
                            paymentType === 'card'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600'
                          }`}
                        >
                          <CreditCard className="w-5 h-5" /> Kart
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        %{paymentType === 'cash' ? cashPointsRate : cardPointsRate} oran
                        {amount && ` → ${(parseFloat(amount || '0') * (paymentType === 'cash' ? cashPointsRate : cardPointsRate) / 100).toFixed(2)} puan`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActionMode('idle'); setAmount(''); }}
                        className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium hover:bg-gray-50"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handlePuanYukle}
                        disabled={processing || !amount}
                        className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                        Yükle
                      </button>
                    </div>
                  </div>
                )}

                {/* Puan Harcama */}
                {actionMode === 'spend' && (
                  <div className="bg-white rounded-2xl shadow-lg p-5 space-y-4 border border-gray-100">
                    <h3 className="font-bold text-gray-800 text-center text-lg">🛒 Puan Harca</h3>
                    <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                      <p className="text-sm text-orange-700">Kullanılabilir:</p>
                      <p className="text-2xl font-bold text-orange-800">{customerInfo.store_balance.toFixed(2)} Puan</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Harcanacak Puan</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                          setAmount(val);
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="Örn: 25"
                        className="w-full px-4 py-3.5 border border-gray-200 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                      {amount && parseFloat(amount) > customerInfo.store_balance && (
                        <p className="text-red-500 text-xs mt-1">Yetersiz bakiye!</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActionMode('idle'); setAmount(''); }}
                        className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium hover:bg-gray-50"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handlePuanHarca}
                        disabled={processing || !amount || parseFloat(amount) > customerInfo.store_balance}
                        className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                        Harca
                      </button>
                    </div>
                  </div>
                )}

                {/* İşlem Sonucu */}
                {lastResult && (
                  <div className="bg-white rounded-2xl shadow-lg p-5 text-center border border-gray-100">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h3 className="font-bold text-gray-800 mb-2 text-lg">İşlem Başarılı! ✅</h3>
                    <p className="text-gray-600 text-sm">{lastResult.message}</p>
                    <div className="mt-4 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                      <p className="text-sm text-emerald-700">Güncel bakiye:</p>
                      <p className="text-xl font-bold text-emerald-800">{lastResult.new_balance?.toFixed(2)} Puan</p>
                    </div>
                    <button
                      onClick={resetCustomer}
                      className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-200"
                    >
                      Yeni İşlem
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Müşteriler Tab */}
        {activeTab === 'musteriler' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Müşterilerim</h2>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                {myCustomers.length} müşteri
              </span>
            </div>

            {myCustomers.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-600 font-medium">Henüz müşteriniz yok</p>
                <p className="text-gray-400 text-sm mt-2">Müşteri QR kodunu okutarak ilk işlemi yapın</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myCustomers.map((cust) => (
                  <div key={cust.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{cust.customer_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {cust.last_transaction_at
                              ? `Son: ${formatDate(cust.last_transaction_at)}`
                              : 'Henüz işlem yok'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-emerald-700">{(cust.balance || 0).toFixed(2)}</p>
                        <p className="text-xs text-gray-400">Bakiye</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <ArrowDownRight className="w-3 h-3 text-emerald-500" />
                        <span className="text-gray-500">Yüklenen: <strong className="text-emerald-600">{(cust.total_earned || 0).toFixed(2)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ArrowUpRight className="w-3 h-3 text-orange-500" />
                        <span className="text-gray-500">Harcanan: <strong className="text-orange-600">{(cust.total_spent || 0).toFixed(2)}</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Geçmiş Tab */}
        {activeTab === 'gecmis' && (() => {
          // Takvim hesaplamaları
          const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
          const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
          const startDayOfWeek = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1; // Pazartesi başlangıç
          const daysInMonth = monthEnd.getDate();

          const turkishMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
          const turkishDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

          // Seçili güne ait işlemler
          const filteredTx = transactions.filter(tx => {
            const txDate = new Date(tx.created_at);
            return txDate.toDateString() === selectedDate.toDateString();
          });

          // Günlük özet
          const dailyEarnTx = filteredTx.filter(t => t.type === 'earn');
          const dailySpendTx = filteredTx.filter(t => t.type === 'spend');
          const dailyTotalCiro = dailyEarnTx.reduce((s, t) => s + (t.amount || 0), 0);
          const dailyTotalEarnPoints = dailyEarnTx.reduce((s, t) => s + (t.points || 0), 0);
          const dailyTotalSpendPoints = dailySpendTx.reduce((s, t) => s + (t.points || 0), 0);
          const dailyTxCount = filteredTx.length;

          // Hangi günlerde işlem var (takvimde nokta göstermek için)
          const daysWithTx = new Set<number>();
          transactions.forEach(tx => {
            const txDate = new Date(tx.created_at);
            if (txDate.getMonth() === calendarMonth.getMonth() && txDate.getFullYear() === calendarMonth.getFullYear()) {
              daysWithTx.add(txDate.getDate());
            }
          });

          const today = new Date();
          const isToday = (day: number) =>
            today.getDate() === day &&
            today.getMonth() === calendarMonth.getMonth() &&
            today.getFullYear() === calendarMonth.getFullYear();

          const isSelected = (day: number) =>
            selectedDate.getDate() === day &&
            selectedDate.getMonth() === calendarMonth.getMonth() &&
            selectedDate.getFullYear() === calendarMonth.getFullYear();

          const handleDayClick = (day: number) => {
            setSelectedDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
          };

          const prevMonth = () => {
            setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
          };

          const nextMonth = () => {
            const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
            if (next <= new Date()) {
              setCalendarMonth(next);
            }
          };

          const goToToday = () => {
            const now = new Date();
            setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            setSelectedDate(now);
          };

          // Takvim grid hücreleri
          const calendarCells: (number | null)[] = [];
          for (let i = 0; i < startDayOfWeek; i++) calendarCells.push(null);
          for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

          // Saat formatlayıcı
          const formatTime = (dateStr: string) => {
            const d = new Date(dateStr);
            return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
          };

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">İşlem Geçmişi</h2>
                <button
                  onClick={goToToday}
                  className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-medium hover:bg-emerald-200 transition"
                >
                  Bugün
                </button>
              </div>

              {/* Takvim */}
              <div className="bg-white rounded-2xl shadow-lg p-4 border border-gray-100">
                {/* Ay navigasyonu */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition">
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <h3 className="font-bold text-gray-800">
                    {turkishMonths[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                  </h3>
                  <button
                    onClick={nextMonth}
                    disabled={calendarMonth.getMonth() === today.getMonth() && calendarMonth.getFullYear() === today.getFullYear()}
                    className="p-2 rounded-lg hover:bg-gray-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                {/* Gün başlıkları */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {turkishDays.map(day => (
                    <div key={day} className="text-center text-xs font-medium text-gray-400 py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Gün hücreleri */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((day, idx) => (
                    <button
                      key={idx}
                      disabled={day === null}
                      onClick={() => day && handleDayClick(day)}
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm font-medium transition ${
                        day === null
                          ? 'invisible'
                          : isSelected(day)
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                            : isToday(day)
                              ? 'bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300'
                              : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {day}
                      {day && daysWithTx.has(day) && !isSelected(day) && (
                        <span className="absolute bottom-1 w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Günlük Özet Kartları */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
                  <p className="text-xs text-gray-500 mb-0.5">Toplam Ciro</p>
                  <p className="text-lg font-bold text-gray-800">{formatCurrency(dailyTotalCiro)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
                  <p className="text-xs text-gray-500 mb-0.5">İşlem Adedi</p>
                  <p className="text-lg font-bold text-gray-800">{dailyTxCount}</p>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm border border-emerald-100 text-center">
                  <p className="text-xs text-emerald-600 mb-0.5">Dağıtılan Puan</p>
                  <p className="text-lg font-bold text-emerald-700">+{dailyTotalEarnPoints.toFixed(1)}</p>
                </div>
                <div className="bg-white rounded-xl p-3 shadow-sm border border-orange-100 text-center">
                  <p className="text-xs text-orange-600 mb-0.5">Harcanan Puan</p>
                  <p className="text-lg font-bold text-orange-700">{dailyTotalSpendPoints.toFixed(1)}</p>
                </div>
              </div>

              {/* İşlem Listesi */}
              {filteredTx.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ClipboardList className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-600 font-medium">Bu tarihte işlem bulunmuyor</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-medium px-1">
                    {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} — {filteredTx.length} işlem
                  </p>
                  {filteredTx.map((tx) => {
                    const txHour = new Date(tx.created_at).getHours();
                    const isNightTransaction = txHour < 6 || txHour >= 23;
                    const payType = (tx as any).payment_type;
                    const cashierName = (tx as any).cashier_name;
                    return (
                      <div key={tx.id} className={`bg-white rounded-xl p-4 shadow-sm border ${isNightTransaction ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-gray-100'}`}>
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
                              <p className="font-semibold text-gray-900 text-sm">{tx.customer_name}</p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs text-gray-400">{formatTime(tx.created_at)}</p>
                                <span className="text-xs text-gray-300">•</span>
                                <p className="text-xs text-gray-400">{tx.type === 'earn' ? 'Yükleme' : 'Harcama'}</p>
                                {payType && (
                                  <>
                                    <span className="text-xs text-gray-300">•</span>
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${payType === 'cash' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                      {payType === 'cash' ? '💵 Nakit' : '💳 Kart'}
                                    </span>
                                  </>
                                )}
                              </div>
                              {cashierName && (
                                <p className="text-xs text-purple-500 mt-0.5 flex items-center gap-1">
                                  <UserPlus className="w-3 h-3" />
                                  Kasiyer: {cashierName}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold ${
                              tx.type === 'earn' ? 'text-emerald-600' : 'text-orange-600'
                            }`}>
                              {tx.type === 'earn' ? '+' : '-'}{(tx.points || 0).toFixed(2)}
                            </p>
                            {tx.type === 'earn' && tx.amount > 0 && (
                              <p className="text-xs text-gray-400">{formatCurrency(tx.amount)}</p>
                            )}
                            {isNightTransaction && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-1">
                                <Moon className="w-3 h-3" /> Gece
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Abonelik & Ödeme Tab (yalnızca Havale/EFT) */}
        {activeTab === 'abonelik' && (
          <SubscriptionTab
            storeCode={merchantStoreCode}
            storeName={merchant?.store_name || 'İşletmem'}
            fullName={merchant?.full_name || 'Esnaf'}
            subscription={subscription}
          />
        )}

        {activeTab === 'profilim' && (
          <div className="space-y-4">
            {/* Profil Alt Sekme Navigasyonu */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
              {([
                { key: 'bilgilerim', label: 'Bilgilerim', icon: User },
                { key: 'kampanyalar', label: 'Kampanyalar', icon: Megaphone },
                { key: 'kasiyerler', label: 'Kasiyerler', icon: UserPlus },
                { key: 'guvenlik', label: 'Güvenlik', icon: Shield },
                { key: 'ayarlar', label: 'Ayarlar', icon: Settings },
              ] as { key: ProfileSubTab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setProfileSubTab(key)}
                  className={`flex-1 min-w-[70px] py-2 px-2 rounded-lg text-[11px] font-semibold flex flex-col items-center gap-0.5 transition ${
                    profileSubTab === key
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Bilgilerim Alt Sekmesi */}
            {profileSubTab === 'bilgilerim' && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-800">Bilgilerim</h2>
                <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 space-y-4">
                  {/* Dükkan / İşletme Adı */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Dükkan / İşletme Adı</label>
                    <input
                      type="text"
                      value={profileForm.store_name}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, store_name: e.target.value }))}
                      placeholder="Mağaza adınız"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition"
                    />
                  </div>

                  {/* Yetkili Ad Soyad */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Yetkili Ad Soyad</label>
                    <input
                      type="text"
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, full_name: e.target.value }))}
                      placeholder="Ad Soyad"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition"
                    />
                  </div>

                  {/* Telefon Numarası */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Telefon Numarası</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="05XX XXX XX XX"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition"
                    />
                  </div>

                  {/* E-posta Adresi */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">E-posta Adresi</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="ornek@email.com"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition"
                    />
                  </div>

                  {/* Yeni Şifre (Opsiyonel) */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1.5 block">Yeni Şifre (Opsiyonel)</label>
                    <input
                      type="password"
                      value={profileForm.new_password}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, new_password: e.target.value }))}
                      placeholder="En az 6 karakter"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition"
                    />
                    <p className="text-xs text-gray-400 mt-1">Değiştirmek istemiyorsanız boş bırakın</p>
                  </div>

                  {/* Bilgi Satırları (Salt Okunur) */}
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Mağaza Kodu</span>
                      <span className="font-mono font-semibold text-emerald-700">{merchant?.store_code || '-'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Nakit Puan Oranı</span>
                      <span className="font-semibold">%{cashPointsRate}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Kart Puan Oranı</span>
                      <span className="font-semibold">%{cardPointsRate}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Toplam Müşteri</span>
                      <span className="font-semibold">{myCustomers.length}</span>
                    </div>
                  </div>

                  {/* Kaydet Butonu */}
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingProfile ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    {savingProfile ? 'Kaydediliyor...' : 'Bilgileri Güncelle'}
                  </button>
                </div>
              </div>
            )}

            {/* Kampanyalar Alt Sekmesi */}
            {profileSubTab === 'kampanyalar' && (
              <div className="space-y-4">
                {/* Aylık Limit Sayacı */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-5 h-5 text-purple-600" />
                      <span className="text-sm font-semibold text-purple-800">Aylık Bildirim Hakkı</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-2xl font-black ${monthlyRemaining > 0 ? 'text-purple-700' : 'text-red-600'}`}>
                        {monthlyRemaining}
                      </span>
                      <span className="text-sm text-purple-500">/ 5</span>
                    </div>
                  </div>
                  {monthlyRemaining <= 0 && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700">
                        Aylık 5 bildirim limitinize ulaştınız. Yeni hakkınız önümüzdeki ay tanımlanacaktır.
                      </p>
                    </div>
                  )}
                </div>

                {/* Yeni Kampanya Oluştur Butonu */}
                {!showCampaignForm && (
                  <button
                    onClick={() => setShowCampaignForm(true)}
                    disabled={monthlyRemaining <= 0}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-bold text-base hover:from-purple-700 hover:to-indigo-700 transition shadow-lg shadow-purple-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Megaphone className="w-5 h-5" />
                    Kampanya / Bildirim Oluştur
                  </button>
                )}

                {/* Kampanya Oluşturma Formu */}
                {showCampaignForm && (
                  <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-purple-600" />
                        Yeni Kampanya
                      </h3>
                      <button
                        onClick={() => setShowCampaignForm(false)}
                        className="p-1.5 rounded-lg hover:bg-gray-100"
                      >
                        <X className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    {/* Başlık */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">Kampanya / Duyuru Başlığı</label>
                      <input
                        type="text"
                        value={campaignForm.title}
                        onChange={(e) => setCampaignForm(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Örn: Bu Hafta Sonu Çorbalarda 2 Kat Puan!"
                        maxLength={100}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm transition"
                      />
                    </div>

                    {/* Açıklama */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1.5 block">Kampanya Detayı / Açıklama</label>
                      <textarea
                        value={campaignForm.description}
                        onChange={(e) => setCampaignForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Örn: Tüm sıcak içecek ve çorba alımlarınızda puanlarınız Onkatı hesabınıza anında yüklenecektir."
                        rows={3}
                        maxLength={500}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm transition resize-none"
                      />
                    </div>

                    {/* Tarih Seçiciler */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1.5 block flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5" /> Başlangıç
                        </label>
                        <input
                          type="datetime-local"
                          value={campaignForm.starts_at}
                          onChange={(e) => setCampaignForm(prev => ({ ...prev, starts_at: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-xs transition"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1.5 block flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5" /> Bitiş
                        </label>
                        <input
                          type="datetime-local"
                          value={campaignForm.ends_at}
                          onChange={(e) => setCampaignForm(prev => ({ ...prev, ends_at: e.target.value }))}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-xs transition"
                        />
                      </div>
                    </div>

                    {/* Hedef Kitle */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-2 block flex items-center gap-1">
                        <Target className="w-3.5 h-3.5" /> Hedef Kitle
                      </label>
                      <div className="space-y-2">
                        <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                          campaignForm.target_audience === 'all_customers'
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="target"
                            value="all_customers"
                            checked={campaignForm.target_audience === 'all_customers'}
                            onChange={() => setCampaignForm(prev => ({ ...prev, target_audience: 'all_customers' }))}
                            className="w-4 h-4 text-purple-600"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-800">Tüm Müşterilerim</p>
                            <p className="text-xs text-gray-500">Bu işletmeden alışveriş yapan tüm müşteriler</p>
                          </div>
                        </label>
                        <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                          campaignForm.target_audience === 'inactive_30_days'
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="target"
                            value="inactive_30_days"
                            checked={campaignForm.target_audience === 'inactive_30_days'}
                            onChange={() => setCampaignForm(prev => ({ ...prev, target_audience: 'inactive_30_days' }))}
                            className="w-4 h-4 text-purple-600"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-800">Son 30 Gündür Gelmeyen</p>
                            <p className="text-xs text-gray-500">Uzun süredir alışveriş yapmayan müşteriler</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Yayınla Butonu */}
                    <button
                      onClick={handlePublishCampaign}
                      disabled={publishingCampaign || !campaignForm.title.trim() || monthlyRemaining <= 0}
                      className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-200"
                    >
                      {publishingCampaign ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Bell className="w-5 h-5" />
                      )}
                      {publishingCampaign ? 'Gönderiliyor...' : 'Kampanyayı Yayınla'}
                    </button>

                    <p className="text-xs text-gray-400 text-center">
                      Bildirim sadece sizden alışveriş yapmış müşterilere gönderilecektir.
                    </p>
                  </div>
                )}

                {/* Aktif Kampanyalarım Listesi */}
                <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-purple-600" />
                    Kampanyalarım ({campaigns.length})
                  </h3>

                  {loadingCampaigns ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    </div>
                  ) : campaigns.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Henüz kampanya oluşturmadınız</p>
                      <p className="text-xs mt-1">Müşterilerinize özel kampanyalar gönderin</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {campaigns.map((camp: any) => {
                        const isExpired = new Date(camp.ends_at) < new Date();
                        const isActive = camp.is_active && !isExpired;
                        return (
                          <div
                            key={camp.id}
                            className={`p-4 rounded-xl border transition ${
                              isActive
                                ? 'bg-purple-50/50 border-purple-200'
                                : 'bg-gray-50 border-gray-200 opacity-70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    isActive
                                      ? 'bg-green-100 text-green-700'
                                      : isExpired
                                        ? 'bg-gray-100 text-gray-500'
                                        : 'bg-orange-100 text-orange-700'
                                  }`}>
                                    {isActive ? '● Aktif' : isExpired ? '● Süresi Doldu' : '● Pasif'}
                                  </span>
                                  <span className="text-[10px] text-gray-400">
                                    {camp.notification_count || 0} kişiye gönderildi
                                  </span>
                                </div>
                                <p className="font-semibold text-sm text-gray-800 truncate">{camp.title}</p>
                                {camp.description && (
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{camp.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                                  <CalendarDays className="w-3 h-3" />
                                  <span>
                                    {new Date(camp.starts_at).toLocaleDateString('tr-TR')} — {new Date(camp.ends_at).toLocaleDateString('tr-TR')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!isExpired && (
                                  <button
                                    onClick={() => handleToggleCampaign(camp.id, camp.is_active)}
                                    className="p-2 rounded-lg hover:bg-gray-100 transition"
                                    title={camp.is_active ? 'Pasife Al' : 'Aktifleştir'}
                                  >
                                    {camp.is_active ? (
                                      <Pause className="w-4 h-4 text-orange-500" />
                                    ) : (
                                      <Play className="w-4 h-4 text-green-500" />
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteCampaign(camp.id)}
                                  className="p-2 rounded-lg hover:bg-red-50 transition"
                                  title="Sil"
                                >
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bilgi Notu */}
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-purple-700">
                    Kampanyalar sadece sizden daha önce alışveriş yapmış müşterilere gönderilir. Aylık 5 bildirim hakkınız vardır.
                  </p>
                </div>
              </div>
            )}

            {/* Kasiyerler Alt Sekmesi */}
            {profileSubTab === 'kasiyerler' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Kasiyer Yönetimi</h2>

            {/* Yeni Kasiyer Ekle */}
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                Yeni Kasiyer Ekle
              </h3>
              <p className="text-xs text-gray-500 bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                💡 Sisteme kayıtlı bir müşterinin telefon numarasını girin. O müşteri kendi panelinden kasiyer işlemleri yapabilecek.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Ad Soyad (opsiyonel — boş bırakılırsa müşteri adı kullanılır)</label>
                  <input
                    type="text"
                    value={newCashierName}
                    onChange={(e) => setNewCashierName(e.target.value)}
                    placeholder="Kasiyer adı"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Telefon Numarası</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={newCashierPhone}
                        onChange={(e) => setNewCashierPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                        placeholder="05XX XXX XX XX"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                      />
                    </div>
                    <button
                      onClick={addCashier}
                      disabled={addingCashier || !newCashierPhone.trim()}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                    >
                      {addingCashier ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Ekle
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Kasiyer Listesi */}
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                Kayıtlı Kasiyerler ({cashiers.length})
              </h3>
              {cashiers.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Henüz kasiyer eklenmemiş</p>
                  <p className="text-xs mt-1">Yukarıdan telefon numarasıyla ekleyebilirsiniz</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cashiers.map((c: any) => (
                    <div key={c.id} className={`flex items-center justify-between p-3 rounded-xl border transition ${c.is_active ? 'bg-emerald-50/50 border-emerald-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-gray-800">{c.full_name || 'İsimsiz'}</p>
                        <p className="text-xs text-gray-500">{c.phone}</p>
                        {c.last_login && (
                          <p className="text-xs text-gray-400 mt-0.5">Son giriş: {formatDate(c.last_login)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleCashier(c.id, c.is_active)}
                          className="p-2 rounded-lg hover:bg-gray-100 transition"
                          title={c.is_active ? 'Pasife Al' : 'Aktifleştir'}
                        >
                          {c.is_active ? (
                            <ToggleRight className="w-6 h-6 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bilgi Notu */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Kasiyerler, sizin adınıza puan yükleme ve harcama işlemi yapabilir. Tüm işlemler kasiyer adıyla kayıt altına alınır.
              </p>
            </div>
          </div>
            )}

            {/* Güvenlik Alt Sekmesi */}
            {profileSubTab === 'guvenlik' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Güvenlik & Mesai Ayarları</h2>

            {/* Kasa Açık/Kapalı */}
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-600" />
                Kasa Durumu
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">{storeOpen ? 'Kasa Açık' : 'Kasa Kapalı'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {storeOpen ? 'İşlem kabul ediliyor' : 'İşlemler geçici olarak durduruldu'}
                  </p>
                </div>
                <button
                  onClick={() => setStoreOpen(!storeOpen)}
                  className={`relative w-14 h-7 rounded-full transition-colors ${storeOpen ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${storeOpen ? 'left-7' : 'left-0.5'}`} />
                </button>
              </div>
              {!storeOpen && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700">
                    Kasa kapalıyken müşteriler puan yükleyemez veya harcayamaz. QR tarama devre dışıdır.
                  </p>
                </div>
              )}
            </div>

            {/* Otomatik Mesai */}
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                Otomatik Mesai Saatleri
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">Zamanlı Kasa Kontrolü</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Belirlenen saatlerde kasa otomatik açılır/kapanır
                  </p>
                </div>
                <button
                  onClick={() => setAutoSchedule(!autoSchedule)}
                  className={`relative w-14 h-7 rounded-full transition-colors ${autoSchedule ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${autoSchedule ? 'left-7' : 'left-0.5'}`} />
                </button>
              </div>

              {autoSchedule && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Açılış Saati</label>
                    <input
                      type="time"
                      value={openingHour}
                      onChange={(e) => setOpeningHour(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Kapanış Saati</label>
                    <input
                      type="time"
                      value={closingHour}
                      onChange={(e) => setClosingHour(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Gece İşlem Uyarısı */}
            <div className="bg-white rounded-2xl shadow-lg p-5 border border-gray-100 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Moon className="w-4 h-4 text-indigo-600" />
                Gece İşlem Bildirimi
              </h3>
              <p className="text-xs text-gray-500">
                Mesai saatleri dışında yapılan işlemler otomatik olarak <span className="font-medium text-indigo-600">"Gece İşlemi"</span> rozeti ile işaretlenir ve geçmişte vurgulanır.
              </p>
            </div>

            {/* Kaydet Butonu */}
            <button
              onClick={saveStoreSettings}
              disabled={savingSettings}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingSettings ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Shield className="w-5 h-5" />
              )}
              Güvenlik Ayarlarını Kaydet
            </button>
          </div>
            )}

            {/* Ayarlar Alt Sekmesi */}
            {profileSubTab === 'ayarlar' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800">Puan Oranları</h2>

            <div className="bg-white rounded-2xl shadow-lg p-5 space-y-4 border border-gray-100">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  Nakit Ödeme Puan Oranı (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cashPointsRate === 0 ? '' : String(cashPointsRate)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                    if (raw === '' || raw === '.') {
                      setCashPointsRate(0);
                      return;
                    }
                    const num = parseFloat(raw);
                    if (!isNaN(num) && num <= 25) {
                      setCashPointsRate(num);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="7"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-lg"
                />
                <p className="text-xs text-gray-400 mt-1">Örn: 7 = %7 (100 TL → 7 puan)</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  Kart Ödeme Puan Oranı (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cardPointsRate === 0 ? '' : String(cardPointsRate)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                    if (raw === '' || raw === '.') {
                      setCardPointsRate(0);
                      return;
                    }
                    const num = parseFloat(raw);
                    if (!isNaN(num) && num <= 25) {
                      setCardPointsRate(num);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="5"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-lg"
                />
                <p className="text-xs text-gray-400 mt-1">Örn: 5 = %5 (100 TL → 5 puan)</p>
              </div>

              <button
                onClick={saveRates}
                disabled={savingRate}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
              >
                {savingRate ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                Kaydet
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                <strong>Not:</strong> Puan oranları 1-25 arasında olmalıdır. Nakit ödemeler genellikle daha yüksek oran alır.
              </p>
            </div>
          </div>
            )}

            {/* Çıkış Yap Butonu */}
            <div className="pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => signOut()}
                className="w-full py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl font-semibold hover:bg-red-100 transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                Çıkış Yap
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Bottom Navigation — arka plan üst başlıkla aynı kurumsal yeşil */}
      <nav className="fixed bottom-0 left-0 right-0 bg-primary-600 border-t border-primary-700 shadow-[0_-4px_16px_rgba(0,0,0,0.18)] z-50">
        <div className="flex max-w-lg mx-auto">
          <button
            onClick={() => setActiveTab('islem')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition ${
              activeTab === 'islem'
                ? 'text-secondary-300'
                : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <QrCode className="w-5 h-5" />
            <span className="text-[10px] font-semibold">İşlem</span>
          </button>
          <button
            onClick={() => setActiveTab('musteriler')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition ${
              activeTab === 'musteriler'
                ? 'text-secondary-300'
                : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Müşteriler</span>
          </button>
          <button
            onClick={() => setActiveTab('gecmis')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition ${
              activeTab === 'gecmis'
                ? 'text-secondary-300'
                : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Geçmiş</span>
          </button>
          <button
            onClick={() => setActiveTab('abonelik')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition relative ${
              activeTab === 'abonelik'
                ? 'text-secondary-300'
                : 'text-primary-100/75 hover:text-white'
            }`}
          >
            {subscription.needsPayment && (
              <span className="absolute top-0.5 right-1/4 flex items-center justify-center">
                <span className="absolute w-5 h-5 rounded-full bg-red-500/40 animate-ping" />
                <span className="relative w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black leading-none flex items-center justify-center shadow-md animate-pulse">
                  !
                </span>
              </span>
            )}
            <BadgeDollarSign className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Abonelik</span>
          </button>
          <button
            onClick={() => setActiveTab('profilim')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition ${
              activeTab === 'profilim'
                ? 'text-secondary-300'
                : 'text-primary-100/75 hover:text-white'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Profilim</span>
          </button>
        </div>
      </nav>
    </div>
  );
}