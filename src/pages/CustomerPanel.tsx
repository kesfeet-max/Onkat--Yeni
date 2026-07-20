import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Handshake,
  Wallet,
  History,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  LogOut,
  Store,
  Send,
  Clock,
  MapPin,
  LayoutDashboard,
  Camera,
  Keyboard,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import type { TransactionWithDetails } from '../types';

type TabType = 'panel' | 'magazalar' | 'gecmis';

interface VisitedStore {
  merchant_id: string;
  store_name: string;
  store_id: number;
  visit_count: number;
  last_visit: string;
  total_earned: number;
}

export function CustomerPanel() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('panel');
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeCode, setStoreCode] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [visitedStores, setVisitedStores] = useState<VisitedStore[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  const customer = profile as any;

  useEffect(() => {
    if (!user) {
      navigate('/giris');
      return;
    }
    fetchTransactions();
    fetchPendingRequests();
  }, [user, navigate]);

  useEffect(() => {
    if (transactions.length > 0) {
      calculateVisitedStores();
    }
  }, [transactions]);

  // QR Scanner cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const fetchTransactions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transactions`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (response.ok) {
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/requests`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (response.ok) {
        setPendingRequests((data.requests || []).filter((r: any) => r.status === 'pending'));
      }
    } catch (err) {
      console.error('Error fetching requests:', err);
    }
  };

  const calculateVisitedStores = () => {
    const storeMap: Record<string, VisitedStore> = {};

    transactions.forEach((tx) => {
      const merchantId = tx.merchant_id;
      const storeName = (tx as any).merchants?.store_name || 'Mağaza';
      const storeId = (tx as any).merchants?.store_id || 0;

      if (!storeMap[merchantId]) {
        storeMap[merchantId] = {
          merchant_id: merchantId,
          store_name: storeName,
          store_id: storeId,
          visit_count: 0,
          last_visit: tx.created_at,
          total_earned: 0,
        };
      }

      storeMap[merchantId].visit_count += 1;
      if (tx.type === 'earn') {
        storeMap[merchantId].total_earned += tx.points;
      }
      if (new Date(tx.created_at) > new Date(storeMap[merchantId].last_visit)) {
        storeMap[merchantId].last_visit = tx.created_at;
      }
    });

    const sorted = Object.values(storeMap).sort((a, b) => b.visit_count - a.visit_count);
    setVisitedStores(sorted);
  };

  const startScanner = useCallback(async () => {
    setShowQRScanner(true);
    setScannerReady(false);

    // Wait for DOM to render the container
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scannerId = 'qr-reader';

        // Make sure container exists
        const container = document.getElementById(scannerId);
        if (!container) {
          setMessage({ type: 'error', text: 'QR tarayıcı başlatılamadı. Lütfen tekrar deneyin.' });
          setShowQRScanner(false);
          return;
        }

        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText: string) => {
            // QR code successfully scanned
            handleQRResult(decodedText);
            stopScanner();
          },
          () => {
            // QR scan error (no code found yet) - ignore
          }
        );

        setScannerReady(true);
      } catch (err: any) {
        console.error('Scanner error:', err);
        let errorMsg = 'Kamera açılamadı.';
        if (err?.message?.includes('NotAllowedError') || err?.name === 'NotAllowedError') {
          errorMsg = 'Kamera izni reddedildi. Lütfen tarayıcı ayarlarından kamera iznini verin.';
        } else if (err?.message?.includes('NotFoundError') || err?.name === 'NotFoundError') {
          errorMsg = 'Kamera bulunamadı. Lütfen cihazınızda kamera olduğundan emin olun.';
        }
        setMessage({ type: 'error', text: errorMsg });
        setShowQRScanner(false);
      }
    }, 300);
  }, []);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        scannerRef.current.stop().then(() => {
          scannerRef.current.clear();
          scannerRef.current = null;
        }).catch(() => {
          scannerRef.current = null;
        });
      } catch {
        scannerRef.current = null;
      }
    }
    setShowQRScanner(false);
    setScannerReady(false);
  }, []);

  const handleQRResult = (decodedText: string) => {
    let extractedCode = '';

    try {
      // Try parsing as JSON (merchant QR format: { store_id: "123456", type: "merchant_qr" })
      const parsed = JSON.parse(decodedText);
      if (parsed.store_id) {
        extractedCode = String(parsed.store_id);
      } else if (parsed.id) {
        extractedCode = String(parsed.id);
      } else if (parsed.merchant_id) {
        extractedCode = String(parsed.merchant_id);
      }
    } catch {
      // Not JSON - treat as plain text store code
      extractedCode = decodedText.trim();
    }

    if (extractedCode) {
      setStoreCode(extractedCode);
      setMessage({ type: 'success', text: `QR kod okundu! Mağaza kodu: ${extractedCode}` });

      // Auto-submit after a short delay
      setTimeout(() => {
        handleSendPointRequestWithCode(extractedCode);
      }, 500);
    } else {
      setMessage({ type: 'error', text: 'QR koddan mağaza bilgisi okunamadı.' });
    }
  };

  const handleSendPointRequestWithCode = async (code: string) => {
    if (!code.trim()) {
      setMessage({ type: 'error', text: 'Lütfen mağaza kodunu girin' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessage({ type: 'error', text: 'Oturum bulunamadı, lütfen tekrar giriş yapın' });
        setProcessing(false);
        return;
      }

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };
      const cleanCode = code.trim();

      // Step 1: Find merchant via merchant-get
      let merchantId: string | null = null;
      let merchantName: string | null = null;

      try {
        const merchantGetUrl = `${baseUrl}/functions/v1/merchant-get?store_id=${encodeURIComponent(cleanCode)}`;
        const merchantRes = await fetch(merchantGetUrl, { method: 'GET', headers });
        const merchantData = await merchantRes.json();

        if (merchantRes.ok && merchantData.success && merchantData.merchant) {
          merchantId = merchantData.merchant.id;
          merchantName = merchantData.merchant.store_name;
        }
      } catch (e) {
        console.warn('merchant-get fallback failed:', e);
      }

      // Step 2: Send request
      const requestUrl = `${baseUrl}/functions/v1/requests?action=create`;
      const requestBody: any = {
        payment_type: 'cash',
      };

      if (merchantId) {
        requestBody.merchant_id = merchantId;
        requestBody.store_id = cleanCode;
      } else {
        requestBody.store_id = cleanCode;
      }

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const name = data.merchant_name || merchantName || 'Mağaza';
        setMessage({ type: 'success', text: `Puan talebi "${name}" mağazasına gönderildi! Esnaf onayını bekleyin.` });
        setStoreCode('');
        fetchPendingRequests();
        refreshProfile();
      } else {
        let errorText = data.error || 'Talep gönderilemedi';
        if (errorText.includes('bulunamadi') || errorText.includes('Gecersiz magaza')) {
          errorText = 'Bu mağaza kodu bulunamadı. Lütfen esnaftan doğru kodu alın.';
        } else if (errorText.includes('15 dakika')) {
          errorText = 'Aynı mağazaya 15 dakika içinde tekrar talep gönderemezsiniz.';
        } else if (errorText.includes('askiya')) {
          errorText = 'Hesabınız geçici olarak askıya alındı.';
        }
        setMessage({ type: 'error', text: errorText });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Bağlantı hatası. Lütfen tekrar deneyin.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendPointRequest = async () => {
    await handleSendPointRequestWithCode(storeCode);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  const totalEarned = transactions.filter(t => t.type === 'earn').reduce((sum, t) => sum + t.points, 0);
  const totalSpent = transactions.filter(t => t.type === 'spend').reduce((sum, t) => sum + t.points, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Handshake className="w-8 h-8 text-secondary-400" />
            <span className="text-xl font-heading font-bold">Onkatı</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-primary-100 text-sm hidden sm:block">{customer?.full_name}</span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-primary-100 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('panel')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'panel'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Panel
            </button>
            <button
              onClick={() => setActiveTab('magazalar')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'magazalar'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Store className="w-4 h-4" />
              Mağazalar
            </button>
            <button
              onClick={() => setActiveTab('gecmis')}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'gecmis'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <History className="w-4 h-4" />
              Geçmiş
            </button>
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* PANEL TAB */}
        {activeTab === 'panel' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary-600" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-1">Puan Bakiyeniz</p>
                <p className="text-2xl font-heading font-bold text-primary-600">
                  {customer?.points_balance || 0} <span className="text-sm font-normal">TL</span>
                </p>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                    <History className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-1">Toplam Kazanılan</p>
                <p className="text-2xl font-heading font-bold text-green-600">
                  {totalEarned} <span className="text-sm font-normal">TL</span>
                </p>
              </div>
            </div>

            {/* Puan Talebi Gönder - MANUEL KOD + QR TARAMA */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                  <Send className="w-5 h-5 text-secondary-600" />
                </div>
                <div>
                  <h2 className="font-heading font-semibold text-gray-900">Puan Talebi Gönder</h2>
                  <p className="text-xs text-gray-500">Kod girin veya QR okutun</p>
                </div>
              </div>

              {/* QR Scanner Modal */}
              {showQRScanner && (
                <div className="mb-5">
                  <div className="relative bg-black rounded-2xl overflow-hidden">
                    <div id="qr-reader" ref={scannerContainerRef} className="w-full" style={{ minHeight: '300px' }}></div>
                    {!scannerReady && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                        <div className="text-center text-white">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                          <p className="text-sm">Kamera açılıyor...</p>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={stopScanner}
                      className="absolute top-3 right-3 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors z-10"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Esnafın kasasındaki QR kodu kameraya gösterin
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {/* Two method buttons */}
                {!showQRScanner && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={startScanner}
                      disabled={processing}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50 hover:bg-primary-100 hover:border-primary-400 transition-all"
                    >
                      <Camera className="w-8 h-8 text-primary-600" />
                      <span className="text-sm font-semibold text-primary-700">QR Kod Okut</span>
                      <span className="text-xs text-primary-500">Kamerayı aç</span>
                    </button>
                    <div className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
                      <Keyboard className="w-8 h-8 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-700">Manuel Giriş</span>
                      <span className="text-xs text-gray-500">Kodu yaz</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mağaza Kodu</label>
                  <input
                    type="text"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value)}
                    className="w-full px-4 py-4 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-2xl text-center tracking-[0.3em] font-mono font-bold"
                    placeholder="• • •"
                    maxLength={36}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && storeCode.trim()) {
                        handleSendPointRequest();
                      }
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Alışveriş yaptığınız esnaftan mağaza kodunu isteyin veya QR kodunu okutun
                  </p>
                </div>

                <button
                  onClick={handleSendPointRequest}
                  disabled={processing || !storeCode.trim()}
                  className="w-full py-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Puan Talebi Gönder
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  <h3 className="font-semibold text-yellow-800">Bekleyen Talepler</h3>
                  <span className="ml-auto bg-yellow-200 text-yellow-800 text-xs font-bold px-2 py-1 rounded-full">
                    {pendingRequests.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {pendingRequests.map((req: any) => (
                    <div key={req.id} className="bg-white rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {req.merchants?.store_name || 'Mağaza'}
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(req.created_at)}</p>
                      </div>
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">
                        Onay Bekliyor
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Transactions */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-heading font-semibold text-gray-900">Son İşlemler</h2>
                <button
                  onClick={() => setActiveTab('gecmis')}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Tümünü Gör →
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {transactions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p>Henüz işlem yok</p>
                    <p className="text-sm mt-1">İlk puan talebinizi gönderin!</p>
                  </div>
                ) : (
                  transactions.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {(tx as any).merchants?.store_name || 'Mağaza'}
                          </p>
                          <p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${
                            tx.type === 'earn' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {tx.type === 'earn' ? '+' : '-'}{tx.points} TL
                          </p>
                          {tx.amount > 0 && (
                            <p className="text-xs text-gray-500">{formatCurrency(tx.amount)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* MAĞAZALAR TAB */}
        {activeTab === 'magazalar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading font-semibold text-gray-900 text-lg">Sık Gittiğiniz Mağazalar</h2>
              <span className="text-sm text-gray-500">{visitedStores.length} mağaza</span>
            </div>

            {visitedStores.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Henüz ziyaret ettiğiniz mağaza yok</p>
                <p className="text-sm text-gray-400 mt-1">İlk puan talebinizi gönderin!</p>
              </div>
            ) : (
              visitedStores.map((store) => (
                <div key={store.merchant_id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <Store className="w-6 h-6 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{store.store_name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            Kod: {store.store_id}
                          </span>
                          <span className="text-xs text-gray-500">
                            {store.visit_count} ziyaret
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Son ziyaret: {formatDate(store.last_visit)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">+{store.total_earned}</p>
                      <p className="text-xs text-gray-500">TL kazanıldı</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* GEÇMİŞ TAB */}
        {activeTab === 'gecmis' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading font-semibold text-gray-900 text-lg">Tüm İşlem Geçmişi</h2>
              <span className="text-sm text-gray-500">{transactions.length} işlem</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
                <p className="text-lg font-bold text-gray-900">{transactions.length}</p>
                <p className="text-xs text-gray-500">Toplam</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
                <p className="text-lg font-bold text-green-600">+{totalEarned}</p>
                <p className="text-xs text-gray-500">Kazanılan</p>
              </div>
              <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
                <p className="text-lg font-bold text-red-600">-{totalSpent}</p>
                <p className="text-xs text-gray-500">Harcanan</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="font-medium">Henüz işlem yok</p>
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div key={tx.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                            tx.type === 'earn' ? 'bg-green-100' : 'bg-red-100'
                          }`}>
                            {tx.type === 'earn' ? (
                              <span className="text-green-600 text-sm font-bold">+</span>
                            ) : (
                              <span className="text-red-600 text-sm font-bold">−</span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {(tx as any).merchants?.store_name || 'Mağaza'}
                            </p>
                            <p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${
                            tx.type === 'earn' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {tx.type === 'earn' ? '+' : '-'}{tx.points} TL
                          </p>
                          {tx.amount > 0 && (
                            <p className="text-xs text-gray-500">{formatCurrency(tx.amount)}</p>
                          )}
                        </div>
                      </div>
                      {tx.status === 'cancelled' && (
                        <div className="mt-2 ml-12">
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">İptal Edildi</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}