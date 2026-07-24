import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Store,
  MapPin,
  ArrowLeft,
  AlertCircle,
  Gift,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MerchantData {
  id: string;
  store_id: number;
  store_name: string;
  city: string;
  district: string;
  sector: string;
  full_name: string;
}

export function StorePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<MerchantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storeId = id ? parseInt(id) : null;

  useEffect(() => {
    if (storeId) {
      fetchMerchant();
    } else {
      setError('Geçersiz mağaza ID');
      setLoading(false);
    }
  }, [storeId]);

  const fetchMerchant = async () => {
    try {
      const { data: merchantData, error: fetchError } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, city, district, sector, full_name')
        .eq('store_id', storeId)
        .single();

      if (fetchError || !merchantData) {
        setError('Mağaza bulunamadı');
        return;
      }

      setMerchant(merchantData);
    } catch (err) {
      console.error('Error fetching merchant:', err);
      setError('Veri yükleme başarısız');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !merchant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Mağaza Bulunamadı</h1>
          <p className="text-gray-600 mb-6">{error || 'Aradığınız mağaza sistemde kaydedilmemiş.'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2 w-full"
          >
            <ArrowLeft className="w-5 h-5" />
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Geri Dön
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Header Banner */}
          <div className="h-28 bg-gradient-to-r from-emerald-600 to-emerald-500"></div>

          {/* Content */}
          <div className="px-6 py-5 -mt-12 relative">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-lg border border-gray-200 flex items-center justify-center flex-shrink-0">
                <Store className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex-1 pt-4">
                <h1 className="text-xl font-bold text-gray-900">{merchant.store_name}</h1>
                <p className="text-sm text-gray-500">Mağaza No: {merchant.store_id}</p>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-gray-600">
                <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{merchant.city} / {merchant.district}</p>
                  <p className="text-xs text-gray-500">{merchant.sector}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-gray-600">
                <Gift className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p className="text-sm font-medium">Onkatı Sadakat Sistemi Üyesi</p>
              </div>
            </div>

            {/* Info Box */}
            <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
              <p className="text-sm text-emerald-800 text-center">
                Bu mağazada alışveriş yaptığınızda, kasada <strong>kişisel QR kodunuzu</strong> okutarak puan kazanabilirsiniz.
              </p>
            </div>

            {/* CTA */}
            <div className="mt-5 space-y-3">
              <button
                onClick={() => navigate('/panel')}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
              >
                Panelime Git
              </button>
              <button
                onClick={() => navigate('/giris')}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
              >
                Giriş Yap / Kayıt Ol
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}