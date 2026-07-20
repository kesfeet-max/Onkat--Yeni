import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Store,
  MapPin,
  Phone,
  Gift,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  QrCode,
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface MerchantData {
  id: string;
  store_id: number;
  store_name: string;
  city: string;
  district: string;
  sector: string;
  phone: string;
  full_name: string;
  total_revenue: number;
  points_rate: number;
}

interface CustomerData {
  id: string;
  full_name: string;
  points_balance: number;
  is_active: boolean;
}

export function StorePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<MerchantData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [requestExists, setRequestExists] = useState(false);

  const storeId = id ? parseInt(id) : null;

  useEffect(() => {
    if (storeId) {
      fetchData();
    } else {
      setMessage({ type: 'error', text: 'Geçersiz mağaza ID' });
      setLoading(false);
    }
  }, [storeId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch merchant data
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('*')
        .eq('store_id', storeId)
        .single();

      if (!merchantData) {
        setMessage({ type: 'error', text: 'Mağaza bulunamadı' });
        setLoading(false);
        return;
      }

      setMerchant(merchantData);

      // Fetch current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Fetch customer data
      const { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (customerData) {
        setCustomer(customerData);

        // Check if request already exists
        const { data: existingRequest } = await supabase
          .from('requests')
          .select('id')
          .eq('customer_id', customerData.id)
          .eq('store_id', storeId)
          .eq('status', 'pending')
          .single();

        if (existingRequest) {
          setRequestExists(true);
        }
      }

      // Generate QR code for store
      generateQRCode(merchantData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setMessage({ type: 'error', text: 'Veri yükleme başarısız' });
    } finally {
      setLoading(false);
    }
  };

  const generateQRCode = async (merchantData: MerchantData) => {
    try {
      const qrData = JSON.stringify({
        store_id: merchantData.store_id,
        store_name: merchantData.store_name,
        type: 'merchant_qr'
      });

      const url = await QRCode.toDataURL(qrData, {
        width: 300,
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

  const handleRequestPoints = async () => {
    if (!customer || !merchant) return;

    setRequesting(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('requests')
        .insert({
          store_id: storeId,
          customer_id: customer.id,
          status: 'pending',
        });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Puan talep başarıyla gönderildi!' });
      setRequestExists(true);

      setTimeout(() => {
        navigate('/panel');
      }, 2000);
    } catch (err) {
      console.error('Error creating request:', err);
      setMessage({ type: 'error', text: 'Talep gönderilemedi. Lütfen tekrar deneyin.' });
    } finally {
      setRequesting(false);
    }
  };

  const handleSignIn = () => {
    navigate('/giris');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-heading font-bold text-gray-900 mb-2">Mağaza Bulunamadı</h1>
          <p className="text-gray-600 mb-6">Aradığınız mağaza sistemde kaydedilmemiş.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 w-full"
          >
            <ArrowLeft className="w-5 h-5" />
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Geri Dön
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Store Info & QR Code */}
          <div className="space-y-6">
            {/* Store Card */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              {/* Header Banner */}
              <div className="h-32 bg-gradient-to-r from-primary-500 to-primary-600"></div>

              {/* Content */}
              <div className="px-6 py-4 -mt-16 relative">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-20 h-20 bg-white rounded-2xl shadow-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <Store className="w-10 h-10 text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-2xl font-heading font-bold text-gray-900">{merchant.store_name}</h1>
                    <p className="text-sm text-gray-500">Mağaza No: {merchant.store_id}</p>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-gray-600">
                    <MapPin className="w-5 h-5 text-primary-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{merchant.city} / {merchant.district}</p>
                      <p className="text-xs text-gray-500">{merchant.sector}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-gray-600">
                    <Phone className="w-5 h-5 text-primary-500 flex-shrink-0" />
                    <a href={`tel:${merchant.phone}`} className="text-sm font-medium hover:text-primary-600">
                      {merchant.phone}
                    </a>
                  </div>

                  <div className="flex items-center gap-3 text-gray-600">
                    <Gift className="w-5 h-5 text-primary-500 flex-shrink-0" />
                    <p className="text-sm font-medium">%{merchant.points_rate} Puan Oranı</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Ciro</p>
                    <p className="text-lg font-bold text-primary-600">{formatCurrency(merchant.total_revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Yetkili</p>
                    <p className="text-sm font-semibold text-gray-900">{merchant.full_name}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* QR Code Card */}
            {qrCodeUrl && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <QrCode className="w-5 h-5 text-primary-600" />
                  <h2 className="font-semibold text-gray-900">Mağaza Karekodu</h2>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl flex items-center justify-center">
                  <img src={qrCodeUrl} alt="Store QR Code" className="w-full max-w-xs" />
                </div>
                <p className="text-xs text-gray-500 text-center mt-4">
                  Hızlı işlem için tarayın
                </p>
              </div>
            )}
          </div>

          {/* Right: Point Request */}
          <div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 sticky top-8">
              <h2 className="text-2xl font-heading font-bold text-gray-900 mb-4">Puan Talep Et</h2>

              {!customer ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-sm text-blue-800">
                      Puan talebinde bulunmak için giriş yapmanız gerekir.
                    </p>
                  </div>
                  <button
                    onClick={handleSignIn}
                    className="w-full py-4 px-6 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
                  >
                    Giriş Yap
                  </button>
                  <button
                    onClick={() => navigate('/kayit')}
                    className="w-full py-4 px-6 bg-gray-100 text-gray-900 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                  >
                    Hesap Oluştur
                  </button>
                </div>
              ) : !customer.is_active ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-800">
                    Hesabınız devre dışı bırakılmıştır. Lütfen yönetici ile iletişime geçin.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Customer Info */}
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 font-medium mb-2">GİRİŞ YAPMIŞSINIZ</p>
                    <p className="font-semibold text-gray-900">{customer.full_name}</p>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-500 font-medium mb-1">Puan Bakiyesi</p>
                      <p className="text-2xl font-heading font-bold text-primary-600">{customer.points_balance} TL</p>
                    </div>
                  </div>

                  {/* Point Request Info */}
                  <div className="p-4 bg-primary-50 border border-primary-200 rounded-xl">
                    <p className="text-sm text-primary-800">
                      Bu mağazada yapacağınız alışverişe karşılık puan kazanacaksınız.
                    </p>
                  </div>

                  {/* Request Button */}
                  <button
                    onClick={handleRequestPoints}
                    disabled={requesting || requestExists}
                    className={`w-full py-4 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${
                      requestExists
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                        : requesting
                        ? 'bg-primary-400 text-white'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {requesting && <Loader2 className="w-5 h-5 animate-spin" />}
                    {requesting ? 'Talep Gönderiliyor...' : requestExists ? 'Talep Zaten Gönderildi' : 'Puan Talep Et'}
                  </button>

                  {requestExists && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                      <p className="text-sm text-yellow-800">
                        Bu mağaza için zaten bir puan talep ettiğiniz bulunmaktadır.
                      </p>
                    </div>
                  )}

                  {/* Help Text */}
                  <div className="text-center">
                    <p className="text-xs text-gray-500">
                      Mağazada alışveriş yaptıktan sonra esnaftan puan almak için bu talep gereklidir.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
