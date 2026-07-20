import { useState, useEffect } from 'react';
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

  Bell,
  Calendar,
  Check,
  CreditCard,
  Banknote,
  LayoutDashboard,
  Shield,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import type { TransactionWithDetails } from '../types';
import QRCode from 'qrcode';

type MerchantTab = 'panel' | 'talepler' | 'takvim' | 'musteriler' | 'ayarlar';

interface PointRequest {
  id: string;
  customer_id: string;
  merchant_id: string;
  amount: number;
  payment_type: string;
  status: string;
  created_at: string;
  customers?: {
    full_name: string;
    phone: string;
  };
}

export function MerchantPanel() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MerchantTab>('panel');
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cashPointsRate, setCashPointsRate] = useState<number>(7);
  const [cardPointsRate, setCardPointsRate] = useState<number>(5);
  const [savingRate, setSavingRate] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PointRequest[]>([]);
  const [allRequests, setAllRequests] = useState<PointRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [approveAmount, setApproveAmount] = useState<string>('');
  const [approvePaymentType, setApprovePaymentType] = useState<'cash' | 'card'>('cash');
  const [selectedRequest, setSelectedRequest] = useState<PointRequest | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const merchant = profile as any;



  useEffect(() => {
    if (!user) {
      navigate('/giris');
      return;
    }
    fetchTransactions();
    fetchMerchantData();
    fetchRequests();
  }, [user, navigate]);

  useEffect(() => {
    const pollInterval = setInterval(fetchRequests, 10000);
    return () => clearInterval(pollInterval);
  }, []);

  const fetchMerchantData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('points_rate, cash_points_rate, card_points_rate')
        .eq('user_id', session.user.id)
        .single();
      if (merchantData) {
        setCashPointsRate(merchantData.cash_points_rate || merchantData.points_rate || 7);
        setCardPointsRate(merchantData.card_points_rate || merchantData.points_rate || 5);
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

  const fetchRequests = async () => {
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
      if (response.ok && data.requests) {
        setAllRequests(data.requests);
        setPendingRequests(data.requests.filter((r: PointRequest) => r.status === 'pending'));
      }
    } catch (err) {
      console.error('Error fetching requests:', err);
    }
  };

  const handleRespondRequest = async (requestId: string, responseType: 'approved' | 'rejected') => {
    if (responseType === 'approved' && !approveAmount) {
      setMessage({ type: 'error', text: 'Lutfen alisveris tutarini girin' });
      return;
    }
    setRespondingId(requestId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const amount = parseFloat(approveAmount) || 0;
      const rate = approvePaymentType === 'cash' ? cashPointsRate : cardPointsRate;
      const points = Math.round(amount * rate) / 100;
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/requests?action=respond`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_id: requestId,
          response: responseType,
          points: responseType === 'approved' ? points : 0,
          amount: amount,
          payment_type: approvePaymentType,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setMessage({
          type: 'success',
          text: responseType === 'approved'
            ? `Onaylandi! ${points.toFixed(2)} TL puan verildi.`
            : 'Talep reddedildi.'
        });
        setSelectedRequest(null);
        setApproveAmount('');
        fetchRequests();
        fetchTransactions();
      } else {
        setMessage({ type: 'error', text: data.error || 'Islem basarisiz' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Islem sirasinda hata olustu' });
    } finally {
      setRespondingId(null);
    }
  };

  const generateQR = async () => {
    if (!merchant?.store_id) return;
    const qrData = JSON.stringify({ store_id: merchant.store_id, type: 'merchant_qr' });
    try {
      const url = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#1a5f4a', light: '#ffffff' } });
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
    if (!confirm('Bu islemi iptal etmek istediginizden emin misiniz?')) return;
    setCancelingId(transactionId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transactions?action=cancel`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, reason: 'Esnaf tarafindan iptal edildi' }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'Islem iptal edildi' });
        fetchTransactions();
      } else {
        setMessage({ type: 'error', text: data.error || 'Iptal basarisiz' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Iptal sirasinda hata olustu' });
    } finally {
      setCancelingId(null);
    }
  };

  const handleUpdateRates = async () => {
    if (cashPointsRate < 1 || cashPointsRate > 25 || cardPointsRate < 1 || cardPointsRate > 25) {
      setMessage({ type: 'error', text: 'Oran 1-25 arasinda olmalidir' });
      return;
    }
    setSavingRate(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase
        .from('merchants')
        .update({ points_rate: cashPointsRate, cash_points_rate: cashPointsRate, card_points_rate: cardPointsRate })
        .eq('user_id', session.user.id);
      if (error) throw error;
      setMessage({ type: 'success', text: 'Puan oranlari guncellendi' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Guncelleme basarisiz' });
    } finally {
      setSavingRate(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getTransactionsByDate = () => {
    const grouped: Record<string, TransactionWithDetails[]> = {};
    transactions.forEach(tx => {
      const date = new Date(tx.created_at).toLocaleDateString('tr-TR');
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(tx);
    });
    return grouped;
  };

  const getUniqueCustomers = () => {
    const customerMap: Record<string, { name: string; phone: string; totalPoints: number; transactionCount: number; lastVisit: string }> = {};
    transactions.forEach(tx => {
      const customerId = tx.customer_id;
      const name = (tx as any).customers?.full_name || 'Musteri';
      const phone = (tx as any).customers?.phone || '';
      if (!customerMap[customerId]) {
        customerMap[customerId] = { name, phone, totalPoints: 0, transactionCount: 0, lastVisit: tx.created_at };
      }
      customerMap[customerId].transactionCount += 1;
      if (tx.type === 'earn') customerMap[customerId].totalPoints += tx.points;
      if (new Date(tx.created_at) > new Date(customerMap[customerId].lastVisit)) {
        customerMap[customerId].lastVisit = tx.created_at;
      }
    });
    return Object.entries(customerMap).sort((a, b) => b[1].transactionCount - a[1].transactionCount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  const todayTransactions = transactions.filter(tx => new Date(tx.created_at).toDateString() === new Date().toDateString());
  const todayRevenue = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const todayPoints = todayTransactions.filter(t => t.type === 'earn').reduce((sum, t) => sum + t.points, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Handshake className="w-8 h-8 text-secondary-400" />
            <span className="text-xl font-heading font-bold">Onkati</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-primary-100 text-sm hidden sm:block">{merchant?.store_name}</span>
            <button onClick={handleSignOut} className="text-primary-100 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex min-w-max">
            {([
              { id: 'panel' as MerchantTab, label: 'Panel', icon: LayoutDashboard },
              { id: 'talepler' as MerchantTab, label: 'Talepler', icon: Bell },
              { id: 'takvim' as MerchantTab, label: 'Takvim', icon: Calendar },
              { id: 'musteriler' as MerchantTab, label: 'Musteriler', icon: Users },
              { id: 'ayarlar' as MerchantTab, label: 'Oran Ayarlari', icon: Settings },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap relative ${
                  activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.id === 'talepler' && pendingRequests.length > 0 && (
                  <span className="absolute -top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-pulse">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-auto"><X className="w-5 h-5" /></button>
          </div>
        )}

        {activeTab === 'panel' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <TrendingUp className="w-5 h-5 text-primary-600 mb-2" />
                <p className="text-xs text-gray-500">Toplam Ciro</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(merchant?.total_revenue || 0)}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <QrCode className="w-5 h-5 text-secondary-600 mb-2" />
                <p className="text-xs text-gray-500">Dagitilan Puan</p>
                <p className="text-xl font-bold text-gray-900">{merchant?.total_points_distributed || 0} TL</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <Users className="w-5 h-5 text-primary-600 mb-2" />
                <p className="text-xs text-gray-500">Musteri Sayisi</p>
                <p className="text-xl font-bold text-gray-900">{merchant?.total_customers || 0}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <Store className="w-5 h-5 text-secondary-600 mb-2" />
                <p className="text-xs text-gray-500">Bugunki Ciro</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(todayRevenue)}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-6 text-white shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-lg font-heading font-semibold mb-1">Magaza Kodu</h3>
                  <p className="text-sm text-primary-200">Sabit magaza kodunuz</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 backdrop-blur-sm px-8 py-4 rounded-xl border border-white/30">
                    <p className="text-4xl font-heading font-bold tracking-widest">{merchant?.store_id || '---'}</p>
                  </div>
                </div>
              </div>
            </div>

            {pendingRequests.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <Bell className="w-6 h-6 text-orange-600 animate-bounce" />
                  <div>
                    <p className="font-semibold text-orange-800">{pendingRequests.length} yeni puan talebi var!</p>
                    <p className="text-sm text-orange-600">Talepler sekmesinden onaylayin veya reddedin.</p>
                  </div>
                  <button onClick={() => setActiveTab('talepler')} className="ml-auto bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors">
                    Goruntule
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <button onClick={generateQR} className="w-full bg-gradient-to-br from-secondary-500 to-secondary-600 rounded-2xl p-8 text-primary-900 shadow-xl hover:shadow-2xl transition-all flex flex-col items-center justify-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-primary-900/10 flex items-center justify-center">
                    <QrCode className="w-10 h-10" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">Karekod Olustur</p>
                    <p className="text-sm text-primary-800">Kasaya yapistir</p>
                  </div>
                </button>
              </div>
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-500" />
                    <h2 className="font-heading font-semibold text-gray-900">Son Islemler</h2>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                    {transactions.length === 0 ? (
                      <div className="p-8 text-center text-gray-500"><p>Henuz islem yok</p></div>
                    ) : (
                      transactions.slice(0, 10).map((tx) => (
                        <div key={tx.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm truncate">{(tx as any).customers?.full_name || 'Musteri'}</p>
                              <p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className={`font-semibold text-sm ${tx.type === 'earn' ? 'text-green-600' : 'text-red-600'}`}>
                                  {tx.type === 'earn' ? '+' : '-'}{tx.points} TL
                                </p>
                                {tx.amount > 0 && <p className="text-xs text-gray-500">{formatCurrency(tx.amount)}</p>}
                              </div>
                              {tx.status === 'completed' && (
                                <button onClick={() => handleCancelTransaction(tx.id)} disabled={cancelingId === tx.id} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="Iptal Et">
                                  {cancelingId === tx.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
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
          </div>
        )}

        {activeTab === 'talepler' && (
          <div className="space-y-6">
            <h2 className="font-heading font-semibold text-gray-900 text-lg">Musteri Puan Talepleri</h2>

            {selectedRequest && (
              <div className="bg-white rounded-2xl shadow-lg border-2 border-primary-200 p-6 mb-4">
                <h3 className="font-semibold text-gray-900 mb-4">Talebi Onayla</h3>
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <p className="text-sm text-gray-600">Musteri: <span className="font-semibold">{selectedRequest.customers?.full_name || 'Musteri'}</span></p>
                  <p className="text-xs text-gray-500 mt-1">Talep zamani: {formatDate(selectedRequest.created_at)}</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Alisveris Tutari (TL)</label>
                    <div className="relative">
                      <input type="number" value={approveAmount} onChange={(e) => setApproveAmount(e.target.value)} className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500" placeholder="0.00" min="0" step="0.01" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">TL</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Odeme Tipi</label>
                    <div className="flex gap-3">
                      <button onClick={() => setApprovePaymentType('cash')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${approvePaymentType === 'cash' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        <Banknote className="w-5 h-5" />
                        Nakit (%{cashPointsRate})
                      </button>
                      <button onClick={() => setApprovePaymentType('card')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${approvePaymentType === 'card' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        <CreditCard className="w-5 h-5" />
                        Kart (%{cardPointsRate})
                      </button>
                    </div>
                  </div>
                  {approveAmount && parseFloat(approveAmount) > 0 && (
                    <div className="bg-primary-50 rounded-xl p-4 border border-primary-200">
                      <p className="text-sm text-gray-600">Verilecek Puan:</p>
                      <p className="text-2xl font-bold text-primary-600">
                        {((parseFloat(approveAmount) || 0) * (approvePaymentType === 'cash' ? cashPointsRate : cardPointsRate) / 100).toFixed(2)} TL
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setSelectedRequest(null); setApproveAmount(''); }} className="flex-1 py-3 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                      Iptal
                    </button>
                    <button onClick={() => handleRespondRequest(selectedRequest.id, 'approved')} disabled={respondingId === selectedRequest.id || !approveAmount || parseFloat(approveAmount) <= 0} className="flex-1 py-3 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {respondingId === selectedRequest.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                      Onayla
                    </button>
                  </div>
                </div>
              </div>
            )}

            {pendingRequests.length === 0 && !selectedRequest ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Bekleyen talep yok</p>
                <p className="text-sm text-gray-400 mt-1">Musteriler puan talebi gonderdiginde burada gorunecek</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{req.customers?.full_name || 'Musteri'}</p>
                        <p className="text-xs text-gray-500">{req.customers?.phone} - {formatDate(req.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleRespondRequest(req.id, 'rejected')} disabled={respondingId === req.id} className="px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50 text-sm">
                          Reddet
                        </button>
                        <button onClick={() => { setSelectedRequest(req); setApproveAmount(''); }} className="px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition-colors text-sm">
                          Onayla
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {allRequests.filter(r => r.status !== 'pending').length > 0 && (
              <div className="mt-8">
                <h3 className="font-semibold text-gray-700 mb-3">Gecmis Talepler</h3>
                <div className="space-y-2">
                  {allRequests.filter(r => r.status !== 'pending').slice(0, 20).map((req) => (
                    <div key={req.id} className="bg-white rounded-lg border border-gray-100 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{req.customers?.full_name || 'Musteri'}</p>
                        <p className="text-xs text-gray-500">{formatDate(req.created_at)}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${req.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {req.status === 'approved' ? 'Onaylandi' : 'Reddedildi'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'takvim' && (
          <div className="space-y-6">
            <h2 className="font-heading font-semibold text-gray-900 text-lg">Gunluk Rapor</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
                <p className="text-2xl font-bold text-primary-600">{formatCurrency(todayRevenue)}</p>
                <p className="text-xs text-gray-500">Bugunki Ciro</p>
              </div>
              <div className="bg-white rounded-xl p-4 text-center border border-gray-100">
                <p className="text-2xl font-bold text-green-600">{todayPoints} TL</p>
                <p className="text-xs text-gray-500">Bugun Verilen Puan</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Tarihe Gore Islemler</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                {Object.entries(getTransactionsByDate()).length === 0 ? (
                  <div className="p-8 text-center text-gray-500">Henuz islem yok</div>
                ) : (
                  Object.entries(getTransactionsByDate()).map(([date, txs]) => (
                    <div key={date} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-900 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {date}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">{txs.length} islem</span>
                          <span className="text-sm font-semibold text-green-600">+{txs.filter(t => t.type === 'earn').reduce((s, t) => s + t.points, 0)} TL</span>
                        </div>
                      </div>
                      <div className="ml-6 space-y-1">
                        {txs.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{(tx as any).customers?.full_name || 'Musteri'}</span>
                            <span className={tx.type === 'earn' ? 'text-green-600' : 'text-red-600'}>{tx.type === 'earn' ? '+' : '-'}{tx.points} TL</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'musteriler' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-semibold text-gray-900 text-lg">Musterilerim</h2>
              <span className="text-sm text-gray-500">{getUniqueCustomers().length} musteri</span>
            </div>
            {getUniqueCustomers().length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Henuz musteriniz yok</p>
              </div>
            ) : (
              <div className="space-y-3">
                {getUniqueCustomers().map(([id, customer]) => (
                  <div key={id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-primary-600 font-bold text-sm">{customer.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{customer.name}</p>
                          <p className="text-xs text-gray-500">{customer.phone} - {customer.transactionCount} islem</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">+{customer.totalPoints} TL</p>
                        <p className="text-xs text-gray-500">Son: {formatDate(customer.lastVisit)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ayarlar' && (
          <div className="space-y-6">
            <h2 className="font-heading font-semibold text-gray-900 text-lg">Puan Oran Ayarlari</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Guvenli Oran Yonetimi</h3>
                  <p className="text-xs text-gray-500">Nakit ve kredi karti oranlarini ayri ayri belirleyin</p>
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-green-50 rounded-xl p-5 border border-green-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Banknote className="w-5 h-5 text-green-600" />
                    <label className="text-sm font-semibold text-green-800">Nakit Puan Orani</label>
                  </div>
                  <div className="flex items-center gap-4">
                    <input type="number" min="1" max="25" value={cashPointsRate} onChange={(e) => setCashPointsRate(Math.min(25, Math.max(1, parseInt(e.target.value) || 1)))} className="w-24 px-4 py-3 rounded-xl border border-green-300 focus:ring-2 focus:ring-green-500 text-center text-xl font-bold" />
                    <span className="text-lg font-bold text-green-700">%</span>
                    <div className="flex-1 text-right">
                      <p className="text-sm text-green-700">100 TL nakit alisveriste: <span className="font-bold">{cashPointsRate} TL puan</span></p>
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                    <label className="text-sm font-semibold text-blue-800">Kredi Karti Puan Orani</label>
                  </div>
                  <div className="flex items-center gap-4">
                    <input type="number" min="1" max="25" value={cardPointsRate} onChange={(e) => setCardPointsRate(Math.min(25, Math.max(1, parseInt(e.target.value) || 1)))} className="w-24 px-4 py-3 rounded-xl border border-blue-300 focus:ring-2 focus:ring-blue-500 text-center text-xl font-bold" />
                    <span className="text-lg font-bold text-blue-700">%</span>
                    <div className="flex-1 text-right">
                      <p className="text-sm text-blue-700">100 TL kart alisveriste: <span className="font-bold">{cardPointsRate} TL puan</span></p>
                    </div>
                  </div>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Guvenlik Notu</p>
                      <p className="text-xs text-yellow-700 mt-1">Oranlar 1-25% arasinda olmalidir. Degisiklikler aninda gecerli olur. Kredi karti ve nakit oranlari birbirinden bagimsizdir. Oran degisiklikleri sadece yeni islemleri etkiler.</p>
                    </div>
                  </div>
                </div>
                <button onClick={handleUpdateRates} disabled={savingRate} className="w-full py-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingRate ? <><Loader2 className="w-5 h-5 animate-spin" /> Kaydediliyor...</> : <><Check className="w-5 h-5" /> Oranlari Kaydet</>}
                </button>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Mevcut Oranlar Ozeti</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <Banknote className="w-6 h-6 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-600">%{cashPointsRate}</p>
                  <p className="text-xs text-gray-500">Nakit</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <CreditCard className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-600">%{cardPointsRate}</p>
                  <p className="text-xs text-gray-500">Kredi Karti</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showQRModal && qrCodeUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-heading font-bold text-gray-900">Magaza Karekodu</h3>
              <button onClick={() => setShowQRModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-100 mb-4">
                <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
              </div>
              <p className="text-sm text-gray-500 mb-2">Magaza No: {merchant?.store_id}</p>
              <p className="text-center text-gray-700 mb-6">Bu karekodu kasaya yapistirin.</p>
              <button onClick={downloadQR} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors">
                <Download className="w-5 h-5" />
                Indir ve Yazdir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}