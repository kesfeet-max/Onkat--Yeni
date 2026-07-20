import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { generateIdempotencyKey, getCurrentLocation, formatCurrency, formatDate } from '../lib/utils';
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
  const [requestAmount, setRequestAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [visitedStores, setVisitedStores] = useState<VisitedStore[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

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

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/requests?status=pending`;
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (response.ok) {
        setPendingRequests(data.requests || []);
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

  const handleSendPointRequest = async () => {
    if (!storeCode.trim()) {
      setMessage({ type: 'error', text: 'Lütfen mağaza kodunu girin' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // First find the merchant by store code
      const merchantUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merchant-get?store_id=${storeCode.trim()}`;
      const merchantResponse = await fetch(merchantUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });

      const merchantData = await merchantResponse.json();

      if (!merchantResponse.ok || !merchantData.success) {
        setMessage({ type: 'error', text: merchantData.error || 'Geçersiz mağaza kodu' });
        setProcessing(false);
        return;
      }

      const location = await getCurrentLocation();
      const idempotencyKey = generateIdempotencyKey();

      // Send point request to the merchant
      const requestUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/requests`;
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: merchantData.merchant.id,
          store_id: merchantData.merchant.store_id,
          amount: parseFloat(requestAmount) || 0,
          location: location || undefined,
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: `Puan talebi "${merchantData.merchant.store_name}" mağazasına gönderildi! Esnaf onayını bekleyin.` });
        setStoreCode('');
        setRequestAmount('');
        fetchPendingRequests();
      } else {
        setMessage({ type: 'error', text: data.error || 'Talep gönderilemedi' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'İşlem sırasında hata oluştu' });
    } finally {
      setProcessing(false);
    }
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

            {/* Puan Talebi Gönder */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                  <Send className="w-5 h-5 text-secondary-600" />
                </div>
                <div>
                  <h2 className="font-heading font-semibold text-gray-900">Puan Talebi Gönder</h2>
                  <p className="text-xs text-gray-500">Esnafın size söylediği 3 haneli kodu girin</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mağaza Kodu</label>
                  <input
                    type="text"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-lg text-center tracking-widest font-mono"
                    placeholder="• • •"
                    maxLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Alışveriş Tutarı (TL)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={requestAmount}
                      onChange={(e) => setRequestAmount(e.target.value)}
                      className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₺</span>
                  </div>
                </div>

                <button
                  onClick={handleSendPointRequest}
                  disabled={processing || !storeCode.trim()}
                  className="w-full py-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                        <p className="text-sm font-medium text-gray-900">{req.store_name || 'Mağaza'}</p>
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
                          <p className="text-xs text-gray-500">{formatCurrency(tx.amount)}</p>
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
                          <p className="text-xs text-gray-500">{formatCurrency(tx.amount)}</p>
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