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
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import QRCode from 'qrcode';

type TabType = 'qr' | 'esnaflar' | 'gecmis';

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

export function CustomerPanel() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('qr');
  const [dataLoading, setDataLoading] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [storeBalances, setStoreBalances] = useState<StoreBalance[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [latestNotification, setLatestNotification] = useState<NotificationItem | null>(null);
  const initializedRef = useRef(false);

  const customer = profile as any;

  // Auth yüklenmesini bekle, sonra veri çek
  useEffect(() => {
    if (authLoading) return; // Auth hâlâ yükleniyor, bekle
    if (!user) {
      navigate('/giris');
      return;
    }
    if (!customer?.id) {
      // Profil yüklenemedi ama auth bitti — veri yüklemeyi durdur
      setDataLoading(false);
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    loadData();
  }, [authLoading, user, customer?.id, navigate]);

  const loadData = async () => {
    try {
      setDataLoading(true);
      await Promise.all([
        generateCustomerQR(),
        fetchStoreBalances(),
        fetchTransactions(),
      ]);
    } catch (err) {
      console.error('CustomerPanel loadData error:', err);
    } finally {
      setDataLoading(false);
    }
  };

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

  const generateCustomerQR = async () => {
    if (!customer?.id) return;
    try {
      const qrData = JSON.stringify({
        type: 'customer_qr',
        customer_id: customer.id,
        name: customer.full_name || 'Müşteri',
      });

      const url = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: { dark: '#1a5f4a', light: '#ffffff' },
      });
      setQrCodeUrl(url);
    } catch (err) {
      console.error('QR generation error:', err);
    }
  };

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

      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white px-5 py-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider">Onkatı Sadakat</p>
            <h1 className="text-xl font-bold mt-0.5">Hoş geldiniz, {customer.full_name || 'Müşteri'}</h1>
          </div>
          <button
            onClick={signOut}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition backdrop-blur-sm"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Cüzdan Kartı */}
        <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-xs">Toplam Bakiye</p>
              <p className="text-3xl font-black mt-1">{totalBalance.toFixed(2)} <span className="text-lg font-medium">Puan</span></p>
              <p className="text-emerald-200 text-xs mt-1">≈ {totalBalance.toFixed(2)} TL değerinde</p>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <Wallet className="w-7 h-7" />
            </div>
          </div>
          <div className="flex gap-4 mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <ArrowDownRight className="w-3.5 h-3.5 text-emerald-300" />
              <span className="text-xs text-emerald-100">Kazanılan: <strong>{totalEarned.toFixed(0)}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-orange-300" />
              <span className="text-xs text-emerald-100">Harcanan: <strong>{totalSpent.toFixed(0)}</strong></span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b shadow-sm sticky top-0 z-40">
        <div className="flex">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-3.5 px-2 text-center text-sm font-semibold border-b-3 transition ${
              activeTab === 'qr'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <QrCode className="w-5 h-5 mx-auto mb-1" />
            QR Kodum
          </button>
          <button
            onClick={() => setActiveTab('esnaflar')}
            className={`flex-1 py-3.5 px-2 text-center text-sm font-semibold border-b-3 transition ${
              activeTab === 'esnaflar'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Store className="w-5 h-5 mx-auto mb-1" />
            Esnaflar
          </button>
          <button
            onClick={() => setActiveTab('gecmis')}
            className={`flex-1 py-3.5 px-2 text-center text-sm font-semibold border-b-3 transition ${
              activeTab === 'gecmis'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-5 h-5 mx-auto mb-1" />
            Geçmiş
          </button>
        </div>
      </nav>

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
      </main>
    </div>
  );
}