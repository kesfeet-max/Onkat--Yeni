import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';

type MerchantTab = 'islem' | 'gecmis' | 'ayarlar';

interface CustomerInfo {
  customer_id: string;
  customer_name: string;
  store_balance: number;
  store_name: string;
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
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MerchantTab>('islem');
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
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
    if (!user) {
      navigate('/giris');
      return;
    }
    fetchTransactions();
    fetchMerchantSettings();
  }, [user, navigate]);

  // Realtime: yeni işlemleri dinle
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
        // Müşteri isimlerini getir
        const customerIds = [...new Set(txData.map((t: any) => t.customer_id))];
        const { data: customers } = await supabase
          .from('customers')
          .select('id, full_name')
          .in('id', customerIds);

        const enriched = txData.map((t: any) => ({
          ...t,
          customer_name: customers?.find((c: any) => c.id === t.customer_id)?.full_name || 'Müşteri',
        }));

        setTransactions(enriched);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMerchantSettings = async () => {
    // Mevcut oranları localStorage'dan al (veya DB'den)
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

    // Dinamik import
    const { default: Html5QrcodeScanner } = await import('html5-qrcode').then(m => ({ default: m.Html5QrcodeScanner }));

    setTimeout(() => {
      if (scannerContainerRef.current) {
        const scanner = new Html5QrcodeScanner(
          'merchant-qr-reader',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          false
        );

        scanner.render(
          (decodedText: string) => {
            handleQRScan(decodedText);
            scanner.clear();
            setShowScanner(false);
          },
          (error: any) => {
            // Scan error - ignore
          }
        );

        scannerRef.current = scanner;
        setScannerReady(true);
      }
    }, 300);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (e) {
        // ignore
      }
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

      // Müşteri bilgilerini getir (telefon GİZLİ - RPC kullanılıyor)
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
    } catch (err) {
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
      setMessage({
        type: 'success',
        text: `Başarılı! ${numAmount} TL alışverişten ${result.points} puan yüklendi.`,
      });

      // Müşteri bilgisini güncelle
      setCustomerInfo(prev => prev ? { ...prev, store_balance: result.new_balance } : null);
      setAmount('');
      setActionMode('idle');
      fetchTransactions();
    } catch (err) {
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
      setMessage({
        type: 'success',
        text: `${numPoints} puan harcandı. Kalan bakiye: ${result.new_balance}`,
      });

      // Müşteri bilgisini güncelle
      setCustomerInfo(prev => prev ? { ...prev, store_balance: result.new_balance } : null);
      setAmount('');
      setActionMode('idle');
      fetchTransactions();
    } catch (err) {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{merchant?.store_name || 'Esnaf Paneli'}</h1>
            <p className="text-emerald-100 text-sm">Onkatı Esnaf Yönetimi</p>
          </div>
          <button
            onClick={signOut}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
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
      <nav className="bg-white border-b sticky top-0 z-40">
        <div className="flex">
          <button
            onClick={() => setActiveTab('islem')}
            className={`flex-1 py-3 px-2 text-center text-sm font-medium border-b-2 transition ${
              activeTab === 'islem'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <QrCode className="w-4 h-4 mx-auto mb-1" />
            İşlem
          </button>
          <button
            onClick={() => setActiveTab('gecmis')}
            className={`flex-1 py-3 px-2 text-center text-sm font-medium border-b-2 transition ${
              activeTab === 'gecmis'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4 mx-auto mb-1" />
            Geçmiş
          </button>
          <button
            onClick={() => setActiveTab('ayarlar')}
            className={`flex-1 py-3 px-2 text-center text-sm font-medium border-b-2 transition ${
              activeTab === 'ayarlar'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="w-4 h-4 mx-auto mb-1" />
            Ayarlar
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="p-4 pb-20 max-w-lg mx-auto">
        {/* İşlem Tab */}
        {activeTab === 'islem' && (
          <div className="space-y-4">
            {/* QR Scanner veya Müşteri Bilgisi */}
            {!customerInfo ? (
              <>
                {/* QR Okut Butonu */}
                {!showScanner ? (
                  <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-2">Müşteri QR Kodunu Okut</h2>
                    <p className="text-gray-500 text-sm mb-5">
                      Müşterinin telefonundaki QR kodu kameranıza göstermesini isteyin
                    </p>
                    <button
                      onClick={startScanner}
                      className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                    >
                      <QrCode className="w-5 h-5" />
                      QR Kodu Tara
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-md p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-800">QR Tarayıcı</h3>
                      <button
                        onClick={stopScanner}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                      >
                        <X className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                    <div
                      id="merchant-qr-reader"
                      ref={scannerContainerRef}
                      className="rounded-xl overflow-hidden"
                    />
                    {!scannerReady && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                        <span className="ml-2 text-sm text-gray-500">Kamera açılıyor...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Bugünkü Özet */}
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Bugünkü Özet
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-700">
                        {transactions.filter(t =>
                          t.type === 'earn' &&
                          new Date(t.created_at).toDateString() === new Date().toDateString()
                        ).length}
                      </p>
                      <p className="text-xs text-emerald-600">Puan Yükleme</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-orange-700">
                        {transactions.filter(t =>
                          t.type === 'spend' &&
                          new Date(t.created_at).toDateString() === new Date().toDateString()
                        ).length}
                      </p>
                      <p className="text-xs text-orange-600">Puan Harcama</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Müşteri Bilgisi Kartı */}
                <div className="bg-white rounded-2xl shadow-md p-5 border-2 border-emerald-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{customerInfo.customer_name}</p>
                        <p className="text-sm text-gray-500">Müşteri</p>
                      </div>
                    </div>
                    <button
                      onClick={resetCustomer}
                      className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="bg-emerald-50 rounded-xl p-4">
                    <p className="text-sm text-emerald-700">Bu dükkandaki bakiyesi:</p>
                    <p className="text-3xl font-bold text-emerald-800 mt-1">
                      {customerInfo.store_balance.toFixed(2)} <span className="text-lg">Puan</span>
                    </p>
                  </div>
                </div>

                {/* İşlem Seçimi */}
                {actionMode === 'idle' && !lastResult && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setActionMode('earn')}
                      className="bg-emerald-600 text-white py-4 rounded-xl font-semibold hover:bg-emerald-700 transition flex flex-col items-center gap-2"
                    >
                      <TrendingUp className="w-6 h-6" />
                      Puan Yükle
                    </button>
                    <button
                      onClick={() => setActionMode('spend')}
                      className="bg-orange-500 text-white py-4 rounded-xl font-semibold hover:bg-orange-600 transition flex flex-col items-center gap-2"
                    >
                      <Wallet className="w-6 h-6" />
                      Puan Harca
                    </button>
                  </div>
                )}

                {/* Puan Yükleme Formu */}
                {actionMode === 'earn' && (
                  <div className="bg-white rounded-2xl shadow-md p-5 space-y-4">
                    <h3 className="font-semibold text-gray-800 text-center">Puan Yükle</h3>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Alışveriş Tutarı (TL)
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Örn: 150"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>

                    {/* Ödeme Tipi Seçimi */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ödeme Tipi
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setPaymentType('cash')}
                          className={`py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 font-medium transition ${
                            paymentType === 'cash'
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <Banknote className="w-5 h-5" />
                          Nakit
                        </button>
                        <button
                          onClick={() => setPaymentType('card')}
                          className={`py-3 px-4 rounded-xl border-2 flex items-center justify-center gap-2 font-medium transition ${
                            paymentType === 'card'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <CreditCard className="w-5 h-5" />
                          Kart
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        {paymentType === 'cash'
                          ? `Nakit oran: %${cashPointsRate}`
                          : `Kart oranı: %${cardPointsRate}`
                        }
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
                        className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                        Yükle
                      </button>
                    </div>
                  </div>
                )}

                {/* Puan Harcama Formu */}
                {actionMode === 'spend' && (
                  <div className="bg-white rounded-2xl shadow-md p-5 space-y-4">
                    <h3 className="font-semibold text-gray-800 text-center">Puan Harca</h3>

                    <div className="bg-orange-50 rounded-xl p-3 text-center">
                      <p className="text-sm text-orange-700">Kullanılabilir bakiye:</p>
                      <p className="text-2xl font-bold text-orange-800">{customerInfo.store_balance.toFixed(2)} Puan</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Harcanacak Puan
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Örn: 25"
                        max={customerInfo.store_balance}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
                        className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                        Harca
                      </button>
                    </div>
                  </div>
                )}

                {/* İşlem Sonucu */}
                {lastResult && (
                  <div className="bg-white rounded-2xl shadow-md p-5 text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-2">İşlem Başarılı!</h3>
                    <p className="text-gray-600 text-sm">{lastResult.message}</p>
                    <div className="mt-4 bg-gray-50 rounded-xl p-3">
                      <p className="text-sm text-gray-500">Güncel bakiye:</p>
                      <p className="text-xl font-bold text-emerald-700">{lastResult.new_balance?.toFixed(2)} Puan</p>
                    </div>
                    <button
                      onClick={resetCustomer}
                      className="mt-4 w-full py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                    >
                      Yeni İşlem
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Geçmiş Tab */}
        {activeTab === 'gecmis' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">İşlem Geçmişi</h2>

            {transactions.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Henüz işlem geçmişi yok</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        tx.type === 'earn' ? 'bg-emerald-100' : 'bg-orange-100'
                      }`}>
                        {tx.type === 'earn' ? (
                          <TrendingUp className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Wallet className="w-4 h-4 text-orange-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{tx.customer_name}</p>
                        <p className="text-xs text-gray-400">{formatDate(tx.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${
                        tx.type === 'earn' ? 'text-emerald-600' : 'text-orange-600'
                      }`}>
                        {tx.type === 'earn' ? '+' : '-'}{tx.points.toFixed(2)} Puan
                      </p>
                      {tx.type === 'earn' && (
                        <p className="text-xs text-gray-400">{formatCurrency(tx.amount)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Ayarlar Tab */}
        {activeTab === 'ayarlar' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Puan Oranları</h2>

            <div className="bg-white rounded-2xl shadow-md p-5 space-y-4">
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-gray-400 mt-1">Örn: 7 = %7 (100 TL alışverişte 7 puan)</p>
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Örn: 5 = %5 (100 TL alışverişte 5 puan)</p>
              </div>

              <button
                onClick={saveRates}
                disabled={savingRate}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingRate ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                Kaydet
              </button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-sm text-yellow-800">
                <strong>Not:</strong> Puan oranları 1-25 arasında olmalıdır. Nakit ödemeler genellikle daha yüksek oran alır.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}