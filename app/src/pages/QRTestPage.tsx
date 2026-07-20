import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Handshake,
  QrCode,
  X,
  Copy,
  CheckCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';

interface MerchantData {
  id: string;
  store_id: number;
  store_name: string;
  points_rate: number;
}

export function QRTestPage() {
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState('');
  const [merchant, setMerchant] = useState<MerchantData | null>(null);
  const [storeCode, setStoreCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (merchant) {
      generateNewCode();
      const interval = setInterval(generateNewCode, 25000);
      return () => clearInterval(interval);
    }
  }, [merchant]);

  const generateNewCode = async () => {
    if (!merchant) return;

    const code = Math.floor(Math.random() * 900 + 100).toString();
    setStoreCode(code);

    try {
      const qrData = JSON.stringify({
        store_id: merchant.store_id,
        code: code,
        type: 'merchant_qr'
      });

      const url = await QRCode.toDataURL(qrData, {
        width: 400,
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

  const handleFetchMerchant = async () => {
    if (!storeId.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const { data: merchantData } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, points_rate')
        .eq('store_id', parseInt(storeId))
        .single();

      if (merchantData) {
        setMerchant(merchantData);
      } else {
        setMessage({ type: 'error', text: 'Mağaza bulunamadı' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Mağaza araması başarısız' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(storeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-600 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Handshake className="w-8 h-8 text-secondary-400" />
            <span className="text-xl font-heading font-bold">Onkatı - QR Test</span>
          </Link>
          <button
            onClick={() => navigate('/')}
            className="p-2 text-primary-100 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-xl ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            <p>{message.text}</p>
          </div>
        )}

        {!merchant ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md mx-auto">
            <h2 className="text-2xl font-heading font-bold text-gray-900 mb-6 text-center">Mağaza Seç</h2>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Test etmek istediğiniz mağazanın numarasını girin
            </p>
            <div className="space-y-4">
              <input
                type="text"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="Mağaza No"
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 text-lg"
                onKeyPress={(e) => e.key === 'Enter' && handleFetchMerchant()}
              />
              <button
                onClick={handleFetchMerchant}
                disabled={!storeId.trim() || loading}
                className="w-full py-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Aranıyor...' : 'Mağazayı Bul'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Merchant Info */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-heading font-bold text-gray-900">{merchant.store_name}</h2>
                  <p className="text-sm text-gray-500 mt-1">Mağaza No: {merchant.store_id}</p>
                  <p className="text-sm text-gray-500">Puan Oranı: %{merchant.points_rate}</p>
                </div>
                <button
                  onClick={() => {
                    setMerchant(null);
                    setStoreId('');
                    setQrCodeUrl(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Store Code Display */}
            <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-8 text-white shadow-xl">
              <p className="text-sm text-primary-200 mb-2">Güncel Mağaza Kodu</p>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-6xl font-heading font-bold tracking-widest">{storeCode}</div>
                <button
                  onClick={handleCopyCode}
                  className="p-3 bg-white/20 rounded-xl hover:bg-white/30 transition-colors"
                  title="Kopyala"
                >
                  {copied ? (
                    <CheckCircle className="w-6 h-6 text-green-300" />
                  ) : (
                    <Copy className="w-6 h-6" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 text-primary-200 text-sm">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Kod her 25 saniyede otomatik değişir</span>
              </div>
            </div>

            {/* QR Code */}
            {qrCodeUrl && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
                <div className="flex flex-col items-center">
                  <p className="text-sm text-gray-600 mb-4 font-medium">Mağaza Karekodu</p>
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mb-6">
                    <img src={qrCodeUrl} alt="QR Code" className="w-96 h-96" />
                  </div>
                  <p className="text-center text-gray-600 mb-4 max-w-lg">
                    Bu karekodu telefonunuzda tarayın. Müşteri uygulaması mağaza bilgilerini otomatik alacaktır.
                  </p>
                  <div className="grid grid-cols-2 gap-4 w-full max-w-sm text-center">
                    <div className="p-3 bg-primary-50 rounded-lg">
                      <p className="text-xs text-gray-600">Kod</p>
                      <p className="text-lg font-bold text-primary-600">{storeCode}</p>
                    </div>
                    <div className="p-3 bg-secondary-50 rounded-lg">
                      <p className="text-xs text-gray-600">Mağaza No</p>
                      <p className="text-lg font-bold text-secondary-600">{merchant.store_id}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Test Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <h3 className="font-heading font-bold text-blue-900 mb-3">Test Adımları</h3>
              <ol className="space-y-2 text-sm text-blue-800">
                <li>1. Yukarıdaki karekodu cep telefonunuzla tarayın</li>
                <li>2. Müşteri uygulamasında mağaza otomatik seçilecek</li>
                <li>3. Tutar girin ve işlemi tamamlayın</li>
                <li>4. Karekod her 25 saniyede değişiyor - yeni kodu tarayarak test edin</li>
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
