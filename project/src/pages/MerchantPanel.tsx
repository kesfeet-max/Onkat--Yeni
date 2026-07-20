import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Handshake,
  QrCode,
  History,
  TrendingUp,
  Users,
  Download,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  LogOut,
  Store,
  XCircle,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import type { TransactionWithDetails } from '../types';
import QRCode from 'qrcode';

export function MerchantPanel() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [storeCode, setStoreCode] = useState<string>('');
  const [pointsRate, setPointsRate] = useState<number>(7);
  const [savingRate, setSavingRate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const merchant = profile as any;

  // Generate random 3-digit code
  const generateStoreCode = useCallback(() => {
    const code = Math.floor(Math.random() * 900 + 100).toString(); // 100-999 arası
    setStoreCode(code);
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/giris');
      return;
    }
    fetchTransactions();
    fetchMerchantData();
    generateStoreCode();

    // Refresh code every 25 seconds
    const interval = setInterval(generateStoreCode, 25000);
    return () => clearInterval(interval);
  }, [user, navigate, generateStoreCode]);

  const fetchMerchantData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: merchantData } = await supabase
        .from('merchants')
        .select('points_rate')
        .eq('user_id', session.user.id)
        .single();

      if (merchantData?.points_rate) {
        setPointsRate(merchantData.points_rate);
      }
    } catch (err) {
      console.error('Error fetching merchant data:', err);
    }
  };

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

  const generateQR = async () => {
    if (!merchant?.store_id) return;

    const qrData = JSON.stringify({
      store_id: merchant.store_id,
      code: storeCode,
      type: 'merchant_qr'
    });

    try {
      const url = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#1a5f4a',
          light: '#ffffff',
        },
      });
      setQrCodeUrl(url);
      setShowQRModal(true);
    } catch (err) {
      console.error('Error generating QR:', err);
    }
  };

  const downloadQR = () => {
    if (!qrCodeUrl) return;

    const link = document.createElement('a');
    link.download = `onkati-qr-${merchant?.store_id}.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  const handleCancelTransaction = async (transactionId: string) => {
    if (!confirm('Bu işlemi iptal etmek istediğinizden emin misiniz?')) return;

    setCancelingId(transactionId);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transactions?action=cancel`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction_id: transactionId,
          reason: 'Esnaf tarafından iptal edildi',
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'İşlem iptal edildi' });
        fetchTransactions();
      } else {
        setMessage({ type: 'error', text: data.error || 'İptal başarısız' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'İptal sırasında hata oluştu' });
    } finally {
      setCancelingId(null);
    }
  };

  const handleUpdatePointsRate = async () => {
    setSavingRate(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('merchants')
        .update({ points_rate: pointsRate })
        .eq('user_id', session.user.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Puan oranı güncellendi' });
      setShowSettings(false);
    } catch (err) {
      setMessage({ type: 'error', text: 'Güncelleme başarısız' });
    } finally {
      setSavingRate(false);
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Handshake className="w-8 h-8 text-secondary-400" />
            <span className="text-xl font-heading font-bold">Onkatı</span>
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-primary-100 text-sm">{merchant?.store_name}</span>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 text-primary-100 hover:text-white transition-colors"
              title="Ayarlar"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-primary-100 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary-600" />
              </div>
              <span className="text-sm text-gray-500">Toplam Ciro</span>
            </div>
            <p className="text-2xl font-heading font-bold text-gray-900">
              {formatCurrency(merchant?.total_revenue || 0)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-secondary-600" />
              </div>
              <span className="text-sm text-gray-500">Dağıtılan Puan</span>
            </div>
            <p className="text-2xl font-heading font-bold text-gray-900">
              {merchant?.total_points_distributed || 0} TL
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary-600" />
              </div>
              <span className="text-sm text-gray-500">Müşteri Sayısı</span>
            </div>
            <p className="text-2xl font-heading font-bold text-gray-900">
              {merchant?.total_customers || 0}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                <Store className="w-5 h-5 text-secondary-600" />
              </div>
              <span className="text-sm text-gray-500">Puan Oranı</span>
            </div>
            <p className="text-2xl font-heading font-bold text-gray-900">
              %{pointsRate}
            </p>
          </div>
        </div>

        {/* Dynamic Store Code */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-6 mb-8 text-white shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-heading font-semibold mb-1">Mağaza Kodu</h3>
              <p className="text-sm text-primary-200">Bu kodu müşteriye söyleyin, uygulamaya girsin</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur-sm px-8 py-4 rounded-xl border border-white/30">
                <p className="text-4xl font-heading font-bold tracking-widest">{storeCode}</p>
              </div>
              <button
                onClick={generateStoreCode}
                className="p-3 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
                title="Yeni Kod"
              >
                <RefreshCw className="w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-primary-200 text-sm">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>Kod her 25 saniyede otomatik değişir</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <button
              onClick={generateQR}
              className="w-full bg-gradient-to-br from-secondary-500 to-secondary-600 rounded-2xl p-8 text-primary-900 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center justify-center gap-4 group"
            >
              <div className="w-20 h-20 rounded-full bg-primary-900/10 flex items-center justify-center group-hover:bg-primary-900/20 transition-colors">
                <QrCode className="w-10 h-10" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">Karekod Oluştur</p>
                <p className="text-sm text-primary-800">Kasaya yapıştır, müşteriler tarsın</p>
              </div>
            </button>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-500" />
                <h2 className="font-heading font-semibold text-gray-900">Son İşlemler</h2>
              </div>
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {transactions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p>Henüz işlem yok</p>
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div key={tx.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {(tx as any).customers?.full_name || 'Müşteri'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatDate(tx.created_at)}
                            {tx.status === 'cancelled' && (
                              <span className="ml-2 text-red-600 font-medium">(İptal edildi)</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className={`font-semibold ${
                              tx.type === 'earn' ? 'text-green-600' : tx.type === 'spend' ? 'text-primary-600' : 'text-gray-400'
                            }`}>
                              {tx.type === 'earn' ? '+' : tx.type === 'spend' ? '-' : ''}{tx.points} TL
                            </p>
                            <p className="text-sm text-gray-500">{formatCurrency(tx.amount)}</p>
                          </div>
                          {tx.status === 'completed' && (
                            <button
                              onClick={() => handleCancelTransaction(tx.id)}
                              disabled={cancelingId === tx.id}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="İşlemi İptal Et"
                            >
                              {cancelingId === tx.id ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <XCircle className="w-5 h-5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-heading font-bold text-gray-900">Ayarlar</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Puan Oranı (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={pointsRate}
                  onChange={(e) => setPointsRate(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Müşterilere verilecek puan yüzdesi (1-25 arası)
                </p>
              </div>
              <button
                onClick={handleUpdatePointsRate}
                disabled={savingRate}
                className="w-full bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {savingRate ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && qrCodeUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-heading font-bold text-gray-900">Mağaza Karekodu</h3>
              <button onClick={() => setShowQRModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-100 mb-4">
                <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
              </div>
              <p className="text-sm text-gray-500 mb-2">Mağaza No: {merchant?.store_id}</p>
              <p className="text-center text-gray-700 mb-6">
                Bu karekodu kasaya yapıştırın. Müşteriler taradığında puan kazanabilirler.
              </p>
              <button
                onClick={downloadQR}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors"
              >
                <Download className="w-5 h-5" />
                İndir ve Yazdır
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
