import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Handshake,
  Wallet,
  QrCode,
  History,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  X,
  Camera,
  Loader2,
  LogOut,
  Store,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { generateIdempotencyKey, getCurrentLocation, formatCurrency, formatDate } from '../lib/utils';
import type { TransactionWithDetails, QRData } from '../types';

export function CustomerPanel() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [merchantInfo, setMerchantInfo] = useState<QRData | null>(null);
  const [transactionType, setTransactionType] = useState<'earn' | 'spend'>('earn');
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const customer = profile as any;

  useEffect(() => {
    if (!user) {
      navigate('/giris');
      return;
    }
    fetchTransactions();
  }, [user, navigate]);

  useEffect(() => {
    return () => {
      // Cleanup camera on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
    } catch (err) {
      console.error('Camera error:', err);
      setMessage({ type: 'error', text: 'Kamera erişimi sağlanamadı' });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const handleScanCode = async () => {
    if (!manualCode.trim()) return;

    try {
      const storeId = manualCode.trim();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merchant-get?store_id=${storeId}`;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        }
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setMerchantInfo({
          type: 'earn',
          merchant_id: data.merchant.id,
          store_id: data.merchant.store_id,
          store_name: data.merchant.store_name,
          points_rate: data.merchant.points_rate || 7,
        });
        setShowScanner(false);
        setManualCode('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Geçersiz mağaza kodu' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Kod kontrol edilemedi' });
    }
  };

  const handleTransaction = async () => {
    if (!merchantInfo || !amount) return;

    setProcessing(true);
    setMessage(null);

    try {
      const location = await getCurrentLocation();
      const idempotencyKey = generateIdempotencyKey();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transactions`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: transactionType,
          merchant_id: merchantInfo.merchant_id,
          amount: parseFloat(amount),
          location: location || undefined,
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: transactionType === 'earn' ? 'Puan kazandınız!' : 'Puan harcandı!' });
        setAmount('');
        setMerchantInfo(null);
        fetchTransactions();
        refreshProfile();
      } else {
        setMessage({ type: 'error', text: data.error || 'İşlem başarısız' });
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Handshake className="w-8 h-8 text-secondary-400" />
            <span className="text-xl font-heading font-bold">Onkatı</span>
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-primary-100 text-sm">{customer?.full_name}</span>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary-600" />
              </div>
              <span className="text-sm text-gray-500">Puan Bakiyeniz</span>
            </div>
            <p className="text-3xl font-heading font-bold text-primary-600">
              {customer?.points_balance || 0} TL
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                <History className="w-5 h-5 text-secondary-600" />
              </div>
              <span className="text-sm text-gray-500">Toplam İşlem</span>
            </div>
            <p className="text-3xl font-heading font-bold text-gray-900">
              {transactions.length}
            </p>
          </div>
        </div>

        {/* Merchant Selection */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Store className="w-5 h-5 text-gray-500" />
            <h2 className="font-heading font-semibold text-gray-900">Mağaza Kodu Gir</h2>
          </div>

          {merchantInfo ? (
            <div className="space-y-4">
              <div className="bg-primary-50 rounded-xl p-4 border border-primary-200">
                <p className="text-sm text-gray-600">Mağaza:</p>
                <p className="font-semibold text-primary-700">{merchantInfo.store_name}</p>
                <p className="text-xs text-gray-500 mt-1">No: {merchantInfo.store_id}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setTransactionType('earn')}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                    transactionType === 'earn'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Puan Kazan
                </button>
                <button
                  onClick={() => setTransactionType('spend')}
                  className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${
                    transactionType === 'spend'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Puan Harca
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {transactionType === 'earn' ? 'Alışveriş Tutarı' : 'Harcanacak Puan'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">TL</span>
                </div>
                {transactionType === 'earn' && merchantInfo.points_rate && (
                  <p className="text-sm text-gray-500 mt-2">
                    Kazanacağınız puan: <span className="font-semibold text-primary-600">
                      {((parseFloat(amount) || 0) * merchantInfo.points_rate / 100).toFixed(2)} TL
                    </span>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMerchantInfo(null);
                    setAmount('');
                  }}
                  className="flex-1 py-3 px-4 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleTransaction}
                  disabled={processing || !amount || parseFloat(amount) <= 0}
                  className="flex-1 py-3 px-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      İşleniyor...
                    </>
                  ) : (
                    <>
                      {transactionType === 'earn' ? 'Puan Kazan' : 'Puan Harca'}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="w-full px-4 py-4 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 text-lg"
                  placeholder="Esnafın söylediği 3 haneli kodu girin"
                  maxLength={10}
                />
              </div>
              <button
                onClick={handleScanCode}
                disabled={!manualCode.trim()}
                className="w-full py-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                Mağazayı Bul
              </button>
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <History className="w-5 h-5 text-gray-500" />
            <h2 className="font-heading font-semibold text-gray-900">İşlem Geçmişi</h2>
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
                        {(tx as any).merchants?.store_name || 'Mağaza'}
                      </p>
                      <p className="text-sm text-gray-500">{formatDate(tx.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        tx.type === 'earn' ? 'text-green-600' : 'text-primary-600'
                      }`}>
                        {tx.type === 'earn' ? '+' : '-'}{tx.points} TL
                      </p>
                      <p className="text-sm text-gray-500">{formatCurrency(tx.amount)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
