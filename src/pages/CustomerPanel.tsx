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
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import QRCode from 'qrcode';

type TabType = 'qr' | 'bakiyeler' | 'gecmis';

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
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('qr');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [storeBalances, setStoreBalances] = useState<StoreBalance[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [latestNotification, setLatestNotification] = useState<NotificationItem | null>(null);

  const customer = profile as any;
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      navigate('/giris');
      return;
    }
    // Profil henüz yüklenmediyse bekle (loading durumunda kalır)
    if (!customer?.id) {
      // Ama sonsuz beklemeyi önlemek için 3 saniye timeout
      const timeout = setTimeout(() => {
        setLoading(false);
        if (!customer?.id) {
          setPageError('Müşteri profili yüklenemedi. Lütfen sayfayı yenileyin veya tekrar giriş yapın.');
        }
      }, 3000);
      return () => clearTimeout(timeout);
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    loadData();
  }, [user, customer?.id, navigate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setPageError(null);
      await Promise.all([
        generateCustomerQR(),
        fetchStoreBalances(),
        fetchTransactions(),
      ]);
    } catch (err) {
      console.error('CustomerPanel loadData error:', err);
      setPageError('Veriler yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // Supabase Realtime: puan değişikliklerini dinle
  useEffect(() => {
    if (!customer?.id) return;

    const channel = supabase
      .channel('customer-balance-' + customer.id)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_customer_balances',
          filter: `customer_id=eq.${customer.id}`,
        },
        () => {
          // Bakiye değiştiğinde yenile
          fetchStoreBalances();
          fetchTransactions();
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
          // Yeni işlem geldiğinde bildirim göster
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
      // Mağaza adını bul
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('store_name')
        .eq('id', tx.merchant_id)
        .single();

      // Yeni bakiyeyi al
      const { data: balanceData } = await supabase
        .from('store_customer_balances')
        .select('balance')
        .eq('customer_id', tx.customer_id)
        .eq('merchant_id', tx.merchant_id)
        .single();

      const notification: NotificationItem = {
        id: tx.id,
        type: tx.type,
        store_name: merchantData?.store_name || 'Bilinmeyen Mağaza',
        points: tx.points || 0,
        new_balance: balanceData?.balance || 0,
        timestamp: tx.created_at,
      };

      setLatestNotification(notification);
      setShowNotification(true);

      // 8 saniye sonra bildirimi kapat
      setTimeout(() => setShowNotification(false), 8000);

      // Verileri yenile
      fetchStoreBalances();
      fetchTransactions();
    } catch (err) {
      console.error('handleNewTransaction error:', err);
    }
  };

  const generateCustomerQR = async () => {
    if (!customer?.id) return;
    try {
      // QR'da sadece customer_id ve tip bilgisi olacak
      const qrData = JSON.stringify({
        type: 'customer_qr',
        customer_id: customer.id,
        name: customer.full_name || 'Müşteri',
      });

      const url = await QRCode.toDataURL(qrData, {
        width: 280,
        margin: 2,
        color: {
          dark: '#1a5f4a',
          light: '#ffffff',
        },
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
        // RLS hatası durumunda çökmesini engelle
        setStoreBalances([]);
        return;
      }

      if (balances && balances.length > 0) {
        // Mağaza isimlerini getir
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

  // Loading durumu
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Hata durumu
  if (pageError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md p-6 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Bir Sorun Oluştu</h2>
          <p className="text-gray-600 text-sm mb-4">{pageError}</p>
          <div className="space-y-2">
            <button
              onClick={() => {
                initializedRef.current = false;
                setPageError(null);
                setLoading(true);
                loadData();
              }}
              className="w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm font-medium"
            >
              Tekrar Dene
            </button>
            <button
              onClick={signOut}
              className="w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Anlık Bildirim */}
      {showNotification && latestNotification && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-slide-down">
          <div className={`rounded-xl p-4 shadow-lg border ${
            latestNotification.type === 'earn'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full ${
                latestNotification.type === 'earn' ? 'bg-emerald-100' : 'bg-orange-100'
              }`}>
                {latestNotification.type === 'earn' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Wallet className="w-5 h-5 text-orange-600" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">
                  {latestNotification.type === 'earn'
                    ? `${latestNotification.store_name}'dan ${latestNotification.points.toFixed(2)} puan kazandınız!`
                    : `${latestNotification.store_name}'da ${latestNotification.points.toFixed(2)} puan harcandı`
                  }
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Bu dükkandaki toplam puanınız: <strong>{latestNotification.new_balance.toFixed(2)}</strong>
                </p>
              </div>
              <button onClick={() => setShowNotification(false)}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Hoş geldin, {customer?.full_name || 'Müşteri'}</h1>
            <p className="text-emerald-100 text-sm">Onkatı Sadakat Sistemi</p>
          </div>
          <button
            onClick={signOut}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b sticky top-0 z-40">
        <div className="flex">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-3 px-2 text-center text-sm font-medium border-b-2 transition ${
              activeTab === 'qr'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <QrCode className="w-4 h-4 mx-auto mb-1" />
            QR Kodum
          </button>
          <button
            onClick={() => setActiveTab('bakiyeler')}
            className={`flex-1 py-3 px-2 text-center text-sm font-medium border-b-2 transition ${
              activeTab === 'bakiyeler'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Store className="w-4 h-4 mx-auto mb-1" />
            Bakiyelerim
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
        </div>
      </nav>

      {/* Content */}
      <main className="p-4 pb-20 max-w-lg mx-auto">
        {/* QR Kodum Tab */}
        {activeTab === 'qr' && (
          <div className="space-y-4">
            {/* QR Code Card */}
            <div className="bg-white rounded-2xl shadow-md p-6 text-center">
              <div className="mb-4">
                <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium">
                  <QrCode className="w-4 h-4" />
                  Kişisel QR Kodunuz
                </div>
              </div>

              {qrCodeUrl ? (
                <div className="flex flex-col items-center">
                  <div className="bg-white p-3 rounded-xl border-2 border-emerald-100 shadow-inner">
                    <img src={qrCodeUrl} alt="Müşteri QR Kodu" className="w-56 h-56" />
                  </div>
                  <p className="mt-4 text-gray-600 text-sm font-medium">
                    💳 Ödeme esnasında kasaya okutun
                  </p>
                  <p className="mt-1 text-gray-400 text-xs">
                    Esnaf bu kodu okutarak size puan yükleyecek
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-56">
                  <AlertCircle className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm">QR kodu oluşturulamadı</p>
                </div>
              )}
            </div>

            {/* Toplam Bakiye Özeti */}
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white shadow-md">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-xl">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-emerald-100 text-sm">Toplam Puanlarım</p>
                  <p className="text-2xl font-bold">{totalBalance.toFixed(2)} Puan</p>
                </div>
              </div>
              <p className="text-emerald-200 text-xs mt-3">
                {storeBalances.length} farklı mağazada bakiyeniz var
              </p>
            </div>
          </div>
        )}

        {/* Bakiyelerim Tab */}
        {activeTab === 'bakiyeler' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Mağaza Bakiyelerim</h2>
            <p className="text-sm text-gray-500 mb-4">
              Her mağazada ayrı bakiyeniz bulunur. Bir mağazada kazandığınız puanlar sadece o mağazada geçerlidir.
            </p>

            {storeBalances.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Henüz hiçbir mağazada bakiyeniz yok</p>
                <p className="text-gray-400 text-sm mt-1">QR kodunuzu kasaya okutarak puan kazanın</p>
              </div>
            ) : (
              storeBalances.map((balance) => (
                <div key={balance.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <Store className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{balance.store_name}</p>
                        <p className="text-xs text-gray-400">
                          {balance.last_transaction_at
                            ? `Son işlem: ${formatDate(balance.last_transaction_at)}`
                            : 'Henüz işlem yok'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-emerald-700">{balance.balance.toFixed(2)}</p>
                      <p className="text-xs text-gray-400">Puan</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between text-xs text-gray-500">
                    <span>Toplam kazanılan: {balance.total_earned.toFixed(2)}</span>
                    <span>Toplam harcanan: {balance.total_spent.toFixed(2)}</span>
                  </div>
                </div>
              ))
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
                <p className="text-gray-500">Henüz işlem geçmişiniz yok</p>
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
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Wallet className="w-4 h-4 text-orange-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{tx.store_name}</p>
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
                        <p className="text-xs text-gray-400">{formatCurrency(tx.amount)} alışveriş</p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}