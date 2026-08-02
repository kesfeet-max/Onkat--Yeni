import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import { QREngine, CameraFacing, getSavedCameraPreference } from '../lib/qr-engine';
import { withRetry, resilientRpc, resilientQuery } from '../lib/retry';
import { toast } from '../lib/toast';

type MerchantTab = 'islem' | 'musteriler' | 'gecmis' | 'ayarlar';

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
  customer_name?: string;
}

export function MerchantPanel() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MerchantTab>('islem');
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/giris');
      return;
    }
    // Önce müşterileri yükle, sonra işlemleri (isimleri eşleştirmek için)
    fetchMyCustomers().then(() => fetchTransactions());
    fetchMerchantSettings();
  }, [authLoading, user, navigate]);

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

      if (!rpcError && rpcData && (rpcData as any).success) {
        const r = rpcData as any;
        setCashPointsRate(Number(r.cash_points_rate) || 7);
        setCardPointsRate(Number(r.card_points_rate) || 5);
        return;
      }

      // RPC yoksa doğrudan tablo dene
      const { data, error } = await supabase
        .from('merchants')
        .select('cash_points_rate, card_points_rate')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        if ((data as any).cash_points_rate != null) setCashPointsRate(Number((data as any).cash_points_rate));
        if ((data as any).card_points_rate != null) setCardPointsRate(Number((data as any).card_points_rate));
      } else {
        // Fallback: localStorage'dan oku (migration henüz çalışmamışsa)
        const savedCash = localStorage.getItem('onkati_cash_rate');
        const savedCard = localStorage.getItem('onkati_card_rate');
        if (savedCash) setCashPointsRate(parseFloat(savedCash));
        if (savedCard) setCardPointsRate(parseFloat(savedCard));
      }
    } catch {
      // Fallback: localStorage
      const savedCash = localStorage.getItem('onkati_cash_rate');
      const savedCard = localStorage.getItem('onkati_card_rate');
      if (savedCash) setCashPointsRate(parseFloat(savedCash));
      if (savedCard) setCardPointsRate(parseFloat(savedCard));
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

      if (!rpcError && rpcResult) {
        // RPC başarılı
        localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
        localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
        setMessage({ type: 'success', text: 'Puan oranları kaydedildi!' });
        toast.success('Puan oranları başarıyla güncellendi!');
      } else {
        // RPC yoksa doğrudan update dene
        const { error } = await supabase
          .from('merchants')
          .update({
            cash_points_rate: cashPointsRate,
            card_points_rate: cardPointsRate,
          })
          .eq('user_id', user.id);

        if (error) {
          // Kolon yoksa localStorage'a kaydet ve kullanıcıyı bilgilendir
          console.error('Puan oranı kaydetme hatası:', error);
          if (error.message.includes('column') || error.message.includes('could not find')) {
            // Kolon henüz eklenmemiş — localStorage'a kaydet, çalışmaya devam et
            localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
            localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
            setMessage({ type: 'success', text: 'Puan oranları cihaza kaydedildi (veritabanı güncelleniyor).' });
            toast.success('Oranlar kaydedildi', 'Cihaz hafızasına kaydedildi');
          } else {
            setMessage({ type: 'error', text: 'Kaydetme başarısız: ' + error.message });
            toast.error('Puan oranları kaydedilemedi!');
          }
        } else {
          localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
          localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
          setMessage({ type: 'success', text: 'Puan oranları kaydedildi!' });
          toast.success('Puan oranları başarıyla güncellendi!');
        }
      }
    } catch (err: any) {
      console.error('Puan oranı kaydetme hatası:', err);
      // Network hatası durumunda bile localStorage'a kaydet
      localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
      localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
      setMessage({ type: 'error', text: 'Bağlantı hatası — oranlar cihaza kaydedildi.' });
      toast.error('Bağlantı hatası!');
    }
    setTimeout(() => setMessage(null), 3000);
    setSavingRate(false);
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
      const { data: result, error } = await resilientRpc(supabase, 'islem_puan_yukle', {
        p_customer_id: customerInfo.customer_id,
        p_amount: numAmount,
        p_payment_type: paymentType,
        p_cash_rate: cashPointsRate,
        p_card_rate: cardPointsRate,
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
      setMessage({ type: 'success', text: `${numAmount} TL → ${r.points} puan yüklendi!` });
      toast.success('Puan Yüklendi!', `${r.points} puan başarıyla eklendi`);
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
      const { data: result, error } = await resilientRpc(supabase, 'islem_puan_harca', {
        p_customer_id: customerInfo.customer_id,
        p_points_to_spend: numPoints,
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
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-5 py-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider">Onkatı Esnaf</p>
            <h1 className="text-xl font-bold mt-0.5">{merchant?.store_name || 'Esnaf Paneli'}</h1>
          </div>
          <button
            onClick={signOut}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Günlük Özet */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/10">
            <p className="text-2xl font-bold">{myCustomers.length}</p>
            <p className="text-emerald-200 text-xs">Müşteri</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/10">
            <p className="text-2xl font-bold text-emerald-200">+{todayEarnPoints.toFixed(0)}</p>
            <p className="text-emerald-200 text-xs">Bugün Yüklenen</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center border border-white/10">
            <p className="text-2xl font-bold text-orange-200">{todaySpendPoints.toFixed(0)}</p>
            <p className="text-emerald-200 text-xs">Bugün Harcanan</p>
          </div>
        </div>
      </header>

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

      {/* Tab Navigation */}
      <nav className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="flex">
          <button
            onClick={() => setActiveTab('islem')}
            className={`flex-1 py-3.5 px-1 text-center text-xs font-semibold border-b-3 transition ${
              activeTab === 'islem'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500'
            }`}
          >
            <QrCode className="w-5 h-5 mx-auto mb-1" />
            İşlem
          </button>
          <button
            onClick={() => setActiveTab('musteriler')}
            className={`flex-1 py-3.5 px-1 text-center text-xs font-semibold border-b-3 transition ${
              activeTab === 'musteriler'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500'
            }`}
          >
            <Users className="w-5 h-5 mx-auto mb-1" />
            Müşteriler
          </button>
          <button
            onClick={() => setActiveTab('gecmis')}
            className={`flex-1 py-3.5 px-1 text-center text-xs font-semibold border-b-3 transition ${
              activeTab === 'gecmis'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500'
            }`}
          >
            <History className="w-5 h-5 mx-auto mb-1" />
            Geçmiş
          </button>
          <button
            onClick={() => setActiveTab('ayarlar')}
            className={`flex-1 py-3.5 px-1 text-center text-xs font-semibold border-b-3 transition ${
              activeTab === 'ayarlar'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500'
            }`}
          >
            <Settings className="w-5 h-5 mx-auto mb-1" />
            Ayarlar
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="p-4 pb-24 max-w-lg mx-auto">
        {/* İşlem Tab */}
        {activeTab === 'islem' && (
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
                  {filteredTx.map((tx) => (
                    <div key={tx.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
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
                            <p className="text-xs text-gray-400">{formatTime(tx.created_at)} • {tx.type === 'earn' ? 'Puan Yükleme' : 'Puan Harcama'}</p>
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
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Ayarlar Tab */}
        {activeTab === 'ayarlar' && (
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
      </main>
    </div>
  );
}