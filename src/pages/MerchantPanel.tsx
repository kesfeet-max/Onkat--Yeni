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
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';

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

  // QR Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<any>(null);
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
    fetchTransactions();
    fetchMyCustomers();
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

  const fetchTransactions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: merchantData } = await supabase
        .from('merchants')
        .select('id')
        .eq('user_id', session.user.id)
        .single();

      if (!merchantData) {
        setLoading(false);
        return;
      }

      const { data: txData, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('merchant_id', merchantData.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && txData) {
        const customerIds = [...new Set(txData.map((t: any) => t.customer_id))];
        let customers: any[] = [];
        if (customerIds.length > 0) {
          const { data: custData } = await supabase
            .from('customers')
            .select('id, full_name')
            .in('id', customerIds);
          customers = custData || [];
        }

        const enriched = txData.map((t: any) => ({
          ...t,
          customer_name: customers.find((c: any) => c.id === t.customer_id)?.full_name || 'Müşteri',
        }));

        setTransactions(enriched);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyCustomers = useCallback(async () => {
    try {
      if (!merchant?.id) {
        // merchant henüz yüklenmemişse session'dan al
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: merchantData } = await supabase
          .from('merchants')
          .select('id')
          .eq('user_id', session.user.id)
          .single();

        if (!merchantData) return;

        const { data: balances, error } = await supabase
          .from('store_customer_balances')
          .select('*')
          .eq('merchant_id', merchantData.id)
          .order('last_transaction_at', { ascending: false });

        if (error || !balances) {
          setMyCustomers([]);
          return;
        }

        const customerIds = balances.map((b: any) => b.customer_id);
        let customers: any[] = [];
        if (customerIds.length > 0) {
          const { data: custData } = await supabase
            .from('customers')
            .select('id, full_name')
            .in('id', customerIds);
          customers = custData || [];
        }

        const enriched = balances.map((b: any) => ({
          ...b,
          customer_name: customers.find((c: any) => c.id === b.customer_id)?.full_name || 'Müşteri',
        }));

        setMyCustomers(enriched);
      } else {
        const { data: balances, error } = await supabase
          .from('store_customer_balances')
          .select('*')
          .eq('merchant_id', merchant.id)
          .order('last_transaction_at', { ascending: false });

        if (error || !balances) {
          setMyCustomers([]);
          return;
        }

        const customerIds = balances.map((b: any) => b.customer_id);
        let customers: any[] = [];
        if (customerIds.length > 0) {
          const { data: custData } = await supabase
            .from('customers')
            .select('id, full_name')
            .in('id', customerIds);
          customers = custData || [];
        }

        const enriched = balances.map((b: any) => ({
          ...b,
          customer_name: customers.find((c: any) => c.id === b.customer_id)?.full_name || 'Müşteri',
        }));

        setMyCustomers(enriched);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
      setMyCustomers([]);
    }
  }, [merchant?.id]);

  const fetchMerchantSettings = async () => {
    const savedCash = localStorage.getItem('onkati_cash_rate');
    const savedCard = localStorage.getItem('onkati_card_rate');
    if (savedCash) setCashPointsRate(parseFloat(savedCash));
    if (savedCard) setCardPointsRate(parseFloat(savedCard));
  };

  const saveRates = async () => {
    setSavingRate(true);
    localStorage.setItem('onkati_cash_rate', cashPointsRate.toString());
    localStorage.setItem('onkati_card_rate', cardPointsRate.toString());
    setMessage({ type: 'success', text: 'Puan oranları kaydedildi!' });
    setTimeout(() => setMessage(null), 3000);
    setSavingRate(false);
  };

  // QR Scanner
  const startScanner = async () => {
    setShowScanner(true);
    setScannerReady(false);

    const { default: Html5QrcodeScanner } = await import('html5-qrcode').then(m => ({ default: m.Html5QrcodeScanner }));

    setTimeout(() => {
      if (scannerContainerRef.current) {
        const scanner = new Html5QrcodeScanner(
          'merchant-qr-reader',
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
          false
        );

        scanner.render(
          (decodedText: string) => {
            handleQRScan(decodedText);
            scanner.clear();
            setShowScanner(false);
          },
          () => {}
        );

        scannerRef.current = scanner;
        setScannerReady(true);
      }
    }, 300);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
    setShowScanner(false);
    setScannerReady(false);
  };

  const handleQRScan = async (data: string) => {
    try {
      const parsed = JSON.parse(data);

      if (parsed.type !== 'customer_qr' || !parsed.customer_id) {
        setMessage({ type: 'error', text: 'Geçersiz QR kodu. Lütfen müşteri QR kodunu okutun.' });
        return;
      }

      const { data: result, error } = await supabase.rpc('musteri_bilgi_getir', {
        p_customer_id: parsed.customer_id,
      });

      if (error) {
        setMessage({ type: 'error', text: 'Müşteri bilgisi alınamadı: ' + error.message });
        return;
      }

      if (!result.success) {
        setMessage({ type: 'error', text: result.error });
        return;
      }

      setCustomerInfo({
        customer_id: result.customer_id,
        customer_name: result.customer_name,
        store_balance: result.store_balance,
        store_name: result.store_name,
      });
      setActionMode('idle');
      setAmount('');
      setLastResult(null);
      setMessage(null);
    } catch {
      setMessage({ type: 'error', text: 'QR kodu okunamadı. Lütfen tekrar deneyin.' });
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
      const { data: result, error } = await supabase.rpc('islem_puan_yukle', {
        p_customer_id: customerInfo.customer_id,
        p_amount: numAmount,
        p_payment_type: paymentType,
        p_cash_rate: cashPointsRate,
        p_card_rate: cardPointsRate,
      });

      if (error) {
        setMessage({ type: 'error', text: 'İşlem hatası: ' + error.message });
        return;
      }
      if (!result.success) {
        setMessage({ type: 'error', text: result.error });
        return;
      }

      setLastResult(result);
      setMessage({ type: 'success', text: `${numAmount} TL → ${result.points} puan yüklendi!` });
      setCustomerInfo(prev => prev ? { ...prev, store_balance: result.new_balance } : null);
      setAmount('');
      setActionMode('idle');
      fetchTransactions();
      fetchMyCustomers();
    } catch {
      setMessage({ type: 'error', text: 'Beklenmeyen bir hata oluştu' });
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
      const { data: result, error } = await supabase.rpc('islem_puan_harca', {
        p_customer_id: customerInfo.customer_id,
        p_points_to_spend: numPoints,
      });

      if (error) {
        setMessage({ type: 'error', text: 'İşlem hatası: ' + error.message });
        return;
      }
      if (!result.success) {
        setMessage({ type: 'error', text: result.error });
        return;
      }

      setLastResult(result);
      setMessage({ type: 'success', text: `${numPoints} puan harcandı. Kalan: ${result.new_balance}` });
      setCustomerInfo(prev => prev ? { ...prev, store_balance: result.new_balance } : null);
      setAmount('');
      setActionMode('idle');
      fetchTransactions();
      fetchMyCustomers();
    } catch {
      setMessage({ type: 'error', text: 'Beklenmeyen bir hata oluştu' });
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
                      <button onClick={stopScanner} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200">
                        <X className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                    <div id="merchant-qr-reader" ref={scannerContainerRef} className="rounded-xl overflow-hidden" />
                    {!scannerReady && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                        <span className="ml-2 text-sm text-gray-500">Kamera açılıyor...</span>
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
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
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
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Örn: 25"
                        max={customerInfo.store_balance}
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
        {activeTab === 'gecmis' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-800">İşlem Geçmişi</h2>

            {transactions.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-600 font-medium">Henüz işlem geçmişi yok</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
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
                          <p className="text-xs text-gray-400">{formatDate(tx.created_at)}</p>
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
        )}

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
                  type="number"
                  value={cashPointsRate}
                  onChange={(e) => setCashPointsRate(parseFloat(e.target.value) || 0)}
                  min={1}
                  max={25}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-gray-400 mt-1">Örn: 7 = %7 (100 TL → 7 puan)</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  Kart Ödeme Puan Oranı (%)
                </label>
                <input
                  type="number"
                  value={cardPointsRate}
                  onChange={(e) => setCardPointsRate(parseFloat(e.target.value) || 0)}
                  min={1}
                  max={25}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
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