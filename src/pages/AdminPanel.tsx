import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import {
  Users,
  Store,
  TrendingUp,
  QrCode,
  Settings,
  LogOut,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
  Edit,
  Shield,
  Save,
  MapPin,
  Loader2,
  Eye,
  EyeOff,
  Mail,
  KeyRound,
  Wand2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';

interface AdminData {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface CustomerData {
  id: string;
  user_id: string;
  phone: string;
  email: string;
  full_name: string;
  points_balance: number;
  is_active: boolean;
  created_at: string;
}

interface MerchantData {
  id: string;
  user_id: string;
  /** Abonelik alanları migration çalışmadıysa gelmeyebilir. */
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_paid_until?: string | null;
  store_id: number;
  phone: string;
  email: string;
  full_name: string;
  store_name: string;
  city: string;
  district: string;
  sector: string;
  total_revenue: number;
  total_points_distributed: number;
  total_customers: number;
  is_active: boolean;
  created_at: string;
  latitude?: number;
  longitude?: number;
}

interface TransactionData {
  id: string;
  type: string;
  amount: number;
  points: number;
  status: string;
  created_at: string;
  customers: { full_name: string; phone: string } | null;
  merchants: { store_name: string; store_id: number } | null;
}

type TabType = 'overview' | 'customers' | 'merchants' | 'transactions' | 'settings';

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalMerchants: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    totalPoints: 0,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingMerchant, setEditingMerchant] = useState<MerchantData | null>(null);
  const [editForm, setEditForm] = useState({
    total_revenue: 0,
    latitude: 0,
    longitude: 0,
  });
  const [saving, setSaving] = useState(false);
  const [credForm, setCredForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [credInfo, setCredInfo] = useState<{ email: string; last_sign_in_at: string | null } | null>(null);
  const [loadingCred, setLoadingCred] = useState(false);
  const [savingCred, setSavingCred] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [credMessage, setCredMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [detailMerchant, setDetailMerchant] = useState<MerchantData | null>(null);
  const [merchantTransactions, setMerchantTransactions] = useState<TransactionData[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (admin) {
      fetchData();
    }
  }, [admin, activeTab]);

  const checkAdmin = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/admin-giris');
        return;
      }

      const { data: adminData, error } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (error || !adminData) {
        setMessage({ type: 'error', text: 'Admin yetkiniz yok' });
        setTimeout(() => navigate('/admin-giris'), 2000);
        return;
      }

      setAdmin(adminData);
    } catch (err) {
      navigate('/admin-giris');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      if (activeTab === 'overview') {
        const response = await fetch(`${apiUrl}?action=overview`, { headers });
        const data = await response.json();
        if (response.ok && data.success) {
          setStats(data.stats);
          setMerchants(data.merchants || []);
          setCustomers(data.customers || []);
        }
      } else if (activeTab === 'customers') {
        const response = await fetch(`${apiUrl}?action=customers`, { headers });
        const data = await response.json();
        if (response.ok && data.success) {
          setCustomers(data.customers || []);
        }
      } else if (activeTab === 'merchants') {
        const response = await fetch(`${apiUrl}?action=merchants`, { headers });
        const data = await response.json();
        if (response.ok && data.success) {
          setMerchants(data.merchants || []);
        }
      } else if (activeTab === 'transactions') {
        const response = await fetch(`${apiUrl}?action=transactions`, { headers });
        const data = await response.json();
        if (response.ok && data.success) {
          setTransactions(data.transactions || []);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (table: 'customers' | 'merchants', id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from(table)
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Durum güncellendi' });
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Güncelleme başarısız' });
    }
  };

  const openMerchantDetail = async (merchant: MerchantData) => {
    setDetailMerchant(merchant);
    setLoadingDetail(true);
    setMerchantTransactions([]);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, type, amount, points, status, created_at, customers(full_name, phone), merchants(store_name, store_id)')
        .eq('merchant_id', merchant.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setMerchantTransactions(data as unknown as TransactionData[]);
      }
    } catch (err) {
      console.error('Error fetching merchant transactions:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openEditMerchant = (merchant: MerchantData) => {
    setEditingMerchant(merchant);
    setEditForm({
      total_revenue: merchant.total_revenue || 0,
      latitude: merchant.latitude || 0,
      longitude: merchant.longitude || 0,
    });
    setCredForm({ email: merchant.email || '', password: '', confirmPassword: '' });
    setCredInfo(null);
    setCredMessage(null);
    setShowPassword(false);
    fetchMerchantCredentials(merchant);
  };

  /**
   * Esnafın gerçek giriş (auth) e-postasını getirir.
   *
   * Önce doğrudan veritabanı RPC'si denenir (Edge Function deploy edilmemiş
   * olsa bile çalışır). RPC bulunamazsa Edge Function'a geri dönülür.
   */
  const fetchMerchantCredentials = async (merchant: MerchantData) => {
    if (!merchant.user_id) return;
    setLoadingCred(true);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_esnaf_giris_bilgisi', {
        p_user_id: merchant.user_id,
      });

      const rpcResult = rpcData as any;
      if (!rpcError && rpcResult?.success) {
        setCredInfo({ email: rpcResult.email || '', last_sign_in_at: rpcResult.last_sign_in_at ?? null });
        setCredForm((prev) => ({ ...prev, email: rpcResult.email || merchant.email || '' }));
        return;
      }

      // 2) Yedek yol: Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'get_merchant_credentials', user_id: merchant.user_id }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setCredInfo({ email: data.email || '', last_sign_in_at: data.last_sign_in_at });
        setCredForm((prev) => ({ ...prev, email: data.email || merchant.email || '' }));
      } else {
        // Hiçbiri çalışmadıysa en azından tablodaki e-postayı göster
        setCredInfo({ email: merchant.email || '', last_sign_in_at: null });
      }
    } catch (err) {
      console.error('Giris bilgisi alinamadi:', err);
      setCredInfo({ email: merchant.email || '', last_sign_in_at: null });
    } finally {
      setLoadingCred(false);
    }
  };

  // Rastgele guvenli gecici sifre uretir
  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let pass = '';
    const buffer = new Uint32Array(10);
    crypto.getRandomValues(buffer);
    for (let i = 0; i < 10; i++) {
      pass += chars[buffer[i] % chars.length];
    }
    setCredForm((prev) => ({ ...prev, password: pass, confirmPassword: pass }));
    setShowPassword(true);
    setCredMessage({ type: 'success', text: 'Geçici şifre oluşturuldu. Kaydet ile onaylayın.' });
  };

  // Giris bilgilerini (e-posta / sifre) kaydeder
  const handleUpdateCredentials = async () => {
    if (!editingMerchant) return;

    const newEmail = credForm.email.trim().toLowerCase();
    const newPassword = credForm.password.trim();
    const currentEmail = (credInfo?.email || editingMerchant.email || '').toLowerCase();

    const emailChanged = !!newEmail && newEmail !== currentEmail;

    if (!emailChanged && !newPassword) {
      setCredMessage({ type: 'error', text: 'Değiştirilecek bir bilgi girin (e-posta veya şifre).' });
      return;
    }

    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) {
      setCredMessage({ type: 'error', text: 'Geçerli bir e-posta adresi girin.' });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setCredMessage({ type: 'error', text: 'Şifre en az 6 karakter olmalıdır.' });
        return;
      }
      if (newPassword !== credForm.confirmPassword.trim()) {
        setCredMessage({ type: 'error', text: 'Şifreler birbiriyle uyuşmuyor.' });
        return;
      }
    }

    setSavingCred(true);
    setCredMessage(null);
    try {
      if (!editingMerchant.user_id) {
        throw new Error('Bu esnafın giriş hesabı bulunamadı (kullanıcı kimliği yok).');
      }

      let result: { email_updated?: boolean; password_updated?: boolean } | null = null;

      // 1) Öncelikli yol: veritabanı RPC'si (Edge Function deploy gerektirmez)
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_esnaf_giris_guncelle', {
        p_user_id: editingMerchant.user_id,
        p_merchant_id: editingMerchant.id,
        p_email: emailChanged ? newEmail : null,
        p_password: newPassword || null,
      });

      const rpcResult = rpcData as any;

      if (!rpcError && rpcResult) {
        if (!rpcResult.success) {
          // RPC çalıştı ama iş kuralı hatası döndü — doğrudan kullanıcıya göster
          throw new Error(rpcResult.error || 'Güncelleme başarısız');
        }
        result = rpcResult;
      } else {
        // 2) Yedek yol: Edge Function
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Oturum bulunamadı');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update_merchant_credentials',
            merchant_id: editingMerchant.id,
            user_id: editingMerchant.user_id,
            email: emailChanged ? newEmail : '',
            password: newPassword,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          const raw = (data?.error || '').toString();
          // Eski Edge Function sürümü bu aksiyonu tanımıyorsa açıklayıcı mesaj ver
          if (raw.toLowerCase().includes('gecersiz istek') || raw.toLowerCase().includes('geçersiz istek')) {
            throw new Error(
              'Sunucu tarafı güncellemesi henüz yayınlanmadığı için bu işlem yapılamıyor. ' +
              'Lütfen Supabase SQL Editor üzerinden "admin_merchant_credentials_rpc.sql" dosyasını çalıştırın; ' +
              'sonrasında e-posta ve şifre güncellemesi çalışacaktır.'
            );
          }
          throw new Error(raw || 'Güncelleme başarısız');
        }
        result = data;
      }

      const parts: string[] = [];
      if (result?.email_updated) parts.push('E-posta güncellendi');
      if (result?.password_updated) parts.push('Şifre güncellendi');

      setCredMessage({ type: 'success', text: parts.join(' • ') || 'Giriş bilgileri güncellendi' });
      setCredInfo({ email: emailChanged ? newEmail : currentEmail, last_sign_in_at: credInfo?.last_sign_in_at ?? null });
      setCredForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      setShowPassword(false);
      fetchData();
    } catch (err) {
      setCredMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Giriş bilgileri güncellenemedi',
      });
    } finally {
      setSavingCred(false);
    }
  };

  const handleUpdateMerchant = async () => {
    if (!editingMerchant) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({
          total_revenue: editForm.total_revenue,
          latitude: editForm.latitude,
          longitude: editForm.longitude,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMerchant.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Esnaf bilgileri güncellendi' });
      setEditingMerchant(null);
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: 'Güncelleme başarısız' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const filteredCustomers = customers.filter(c =>
    (c.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').includes(searchTerm) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  /** Mağaza kodu formatı: ONK-0042 */
  const buildStoreCode = (storeId?: number | string | null) => {
    const numeric = Number(storeId);
    const safe = Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
    return `ONK-${String(safe).padStart(4, '0')}`;
  };

  const filteredMerchants = merchants.filter(m => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    // Mağaza kodu ile arama: "ONK-0042", "onk0042", "0042" veya "42" hepsi eşleşir
    const numericTerm = term.replace(/[^0-9]/g, '');
    const storeCode = buildStoreCode(m.store_id).toLowerCase();
    const storeCodeMatch =
      storeCode.includes(term) ||
      storeCode.replace('-', '').includes(term.replace('-', '')) ||
      (numericTerm.length > 0 && String(m.store_id).includes(String(Number(numericTerm))));

    return (
      storeCodeMatch ||
      (m.store_name || '').toLowerCase().includes(term) ||
      (m.phone || '').includes(searchTerm) ||
      (m.full_name || '').toLowerCase().includes(term) ||
      (m.email || '').toLowerCase().includes(term)
    );
  });

  const filteredTransactions = transactions.filter(t =>
    (t.customers?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (t.merchants?.store_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!admin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo to="/" size="lg" />
            <span className="hidden sm:inline text-[11px] font-heading font-bold text-secondary-300 uppercase tracking-[0.2em]">
              Yönetim
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-primary-100">
              <Shield className="w-5 h-5" />
              <span className="text-sm">{admin.full_name} ({admin.role})</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-primary-100 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
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

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: 'overview', label: 'Genel Bakış', icon: TrendingUp },
            { id: 'merchants', label: 'Esnaf', icon: Store },
            { id: 'customers', label: 'Müşteriler', icon: Users },
            { id: 'transactions', label: 'İşlemler', icon: QrCode },
            { id: 'settings', label: 'Ayarlar', icon: Settings },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary-600" />
                      </div>
                      <span className="text-sm text-gray-500">Müşteriler</span>
                    </div>
                    <p className="text-3xl font-heading font-bold text-gray-900">{stats.totalCustomers}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                        <Store className="w-5 h-5 text-secondary-600" />
                      </div>
                      <span className="text-sm text-gray-500">Esnaf</span>
                    </div>
                    <p className="text-3xl font-heading font-bold text-gray-900">{stats.totalMerchants}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                        <QrCode className="w-5 h-5 text-primary-600" />
                      </div>
                      <span className="text-sm text-gray-500">İşlemler</span>
                    </div>
                    <p className="text-3xl font-heading font-bold text-gray-900">{stats.totalTransactions}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-secondary-600" />
                      </div>
                      <span className="text-sm text-gray-500">Toplam Ciro</span>
                    </div>
                    <p className="text-2xl font-heading font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                        <QrCode className="w-5 h-5 text-primary-600" />
                      </div>
                      <span className="text-sm text-gray-500">Dağıtılan Puan</span>
                    </div>
                    <p className="text-3xl font-heading font-bold text-gray-900">{stats.totalPoints} TL</p>
                  </div>
                </div>

                {/* Quick Merchant List */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-heading font-semibold text-gray-900">Kayıtlı Esnaflar</h2>
                    <button
                      onClick={() => setActiveTab('merchants')}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Tümünü Gör
                    </button>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {merchants.slice(0, 5).map(merchant => (
                      <div key={merchant.id} className="px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{merchant.store_name}</p>
                          <p className="text-sm text-gray-500">{merchant.city} / {merchant.district} - {merchant.sector}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-primary-600">{formatCurrency(merchant.total_revenue)}</p>
                        </div>
                      </div>
                    ))}
                    {merchants.length === 0 && (
                      <div className="px-6 py-8 text-center text-gray-500">
                        Henüz kayıtlı esnaf yok
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Müşteri ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ad Soyad</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Telefon</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">E-posta</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Puan Bakiyesi</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Durum</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Kayıt Tarihi</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredCustomers.map(customer => (
                        <tr key={customer.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{customer.full_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{customer.phone}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{customer.email || '-'}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-primary-600">{customer.points_balance} TL</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              customer.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {customer.is_active ? 'Aktif' : 'Pasif'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{formatDate(customer.created_at)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleUserStatus('customers', customer.id, customer.is_active)}
                              className="text-gray-400 hover:text-primary-600 transition-colors"
                              title={customer.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                            >
                              {customer.is_active ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'merchants' && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Mağaza kodu (ONK-0042), dükkan adı, telefon veya yetkili ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Havale / EFT kontrolü yaptıktan sonra esnafın hesabını "Durum" kolonundaki butonla tek tıkla Aktif
                    veya Pasif yapabilirsiniz. Sistemde kredi kartı ile ödeme alınmaz.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Dükkan</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Yetkili</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Telefon</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">E-posta</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Konum</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ciro</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Durum</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredMerchants.map(merchant => (
                        <tr key={merchant.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{merchant.store_name}</p>
                              <p className="text-xs font-mono font-bold text-primary-600">{buildStoreCode(merchant.store_id)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{merchant.full_name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{merchant.phone || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{merchant.email || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-600">
                              <p>{merchant.city || '-'} / {merchant.district || '-'}</p>
                              <p className="text-xs text-gray-400">{merchant.latitude && merchant.longitude ? `${merchant.latitude}, ${merchant.longitude}` : 'Konum yok'}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-primary-600">{formatCurrency(merchant.total_revenue ?? 0)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              merchant.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {merchant.is_active !== false ? 'Aktif' : 'Pasif'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openMerchantDetail(merchant)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="İşlem Geçmişi"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openEditMerchant(merchant)}
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                                title="Düzenle"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleUserStatus('merchants', merchant.id, merchant.is_active)}
                                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                  merchant.is_active
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                                }`}
                                title={merchant.is_active ? 'Pasif Yap' : 'Havale onaylandı, Aktif Yap'}
                              >
                                {merchant.is_active ? <X className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                {merchant.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'transactions' && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="İşlem ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Müşteri</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Dükkan</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tür</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tutar</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Puan</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Durum</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Tarih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {tx.customers?.full_name || 'Bilinmiyor'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {tx.merchants?.store_name || 'Bilinmiyor'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              tx.type === 'earn' ? 'bg-green-100 text-green-700' :
                              tx.type === 'spend' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {tx.type === 'earn' ? 'Kazanç' : tx.type === 'spend' ? 'Harcama' : 'İptal'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(tx.amount)}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-primary-600">{tx.points} TL</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              tx.status === 'completed' ? 'bg-green-100 text-green-700' :
                              tx.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {tx.status === 'completed' ? 'Tamamlandı' : tx.status === 'cancelled' ? 'İptal' : 'Bekliyor'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{formatDate(tx.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                <h2 className="text-xl font-heading font-bold text-gray-900 mb-6">Sistem Ayarları</h2>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <h3 className="font-semibold text-gray-900 mb-2">Admin Bilgileri</h3>
                    <p className="text-sm text-gray-600">Ad Soyad: {admin.full_name}</p>
                    <p className="text-sm text-gray-600">E-posta: {admin.email}</p>
                    <p className="text-sm text-gray-600">Rol: {admin.role}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <h3 className="font-semibold text-gray-900 mb-2">Sistem Durumu</h3>
                    <p className="text-sm text-gray-600">Toplam Kayıtlı Müşteri: {stats.totalCustomers}</p>
                    <p className="text-sm text-gray-600">Toplam Kayıtlı Esnaf: {stats.totalMerchants}</p>
                    <p className="text-sm text-gray-600">Toplam İşlem: {stats.totalTransactions}</p>
                  </div>
                  <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Verileri Yenile
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Merchant Detail Modal */}
      {detailMerchant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-heading font-bold text-gray-900">{detailMerchant.store_name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {detailMerchant.city} / {detailMerchant.district} • No: {detailMerchant.store_id}
                </p>
              </div>
              <button
                onClick={() => setDetailMerchant(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Özet Kartları */}
            <div className="grid grid-cols-3 gap-3 p-6 border-b border-gray-100">
              <div className="bg-primary-50 rounded-xl p-3 text-center">
                <p className="text-xs text-primary-600 font-medium">Toplam Ciro</p>
                <p className="text-lg font-bold text-primary-700">{formatCurrency(detailMerchant.total_revenue)}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-green-600 font-medium">Dağıtılan Puan</p>
                <p className="text-lg font-bold text-green-700">{detailMerchant.total_points_distributed} TL</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs text-blue-600 font-medium">Müşteri Sayısı</p>
                <p className="text-lg font-bold text-blue-700">{detailMerchant.total_customers}</p>
              </div>
            </div>

            {/* İşlem Geçmişi */}
            <div className="flex-1 overflow-y-auto p-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">İşlem Geçmişi (Son 50)</h4>
              {loadingDetail ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : merchantTransactions.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <QrCode className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Henüz işlem bulunmuyor</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Tarih / Saat</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">İşlem Tutarı (Ciro)</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Dağıtılan Puan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {merchantTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-700">{formatDate(tx.created_at)}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">{formatCurrency(tx.amount)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              tx.type === 'earn' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {tx.type === 'earn' ? '+' : '-'}{tx.points} TL
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Merchant Modal */}
      {editingMerchant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-heading font-bold text-gray-900">Esnaf Düzenle</h3>
              <button
                onClick={() => setEditingMerchant(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">{editingMerchant.store_name}</p>
              <p className="text-xs text-gray-500">No: {editingMerchant.store_id}</p>
            </div>

            {/* Giris Bilgileri (E-posta & Sifre) */}
            <div className="mb-5 rounded-xl border border-primary-100 bg-primary-50/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary-600" />
                <h4 className="text-sm font-bold text-gray-900">Giriş Bilgileri</h4>
                {loadingCred && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>
                  Kayıtlı giriş e-postası:{' '}
                  <strong className="text-gray-800">
                    {credInfo?.email || editingMerchant.email || 'Tanımlı değil'}
                  </strong>
                </span>
                {credInfo?.last_sign_in_at && (
                  <span>Son giriş: <strong className="text-gray-800">{formatDate(credInfo.last_sign_in_at)}</strong></span>
                )}
              </div>

              {!credInfo?.email && !editingMerchant.email && (
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Bu esnafın e-posta adresi tanımlı değil. Giriş yapabilmesi için aşağıdan bir e-posta ve şifre tanımlayın.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    <Mail className="w-3.5 h-3.5 inline mr-1" />
                    E-posta Adresi
                  </label>
                  <input
                    type="email"
                    value={credForm.email}
                    onChange={(e) => setCredForm({ ...credForm, email: e.target.value })}
                    placeholder="esnaf@ornek.com"
                    autoComplete="off"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                      Yeni Şifre
                    </label>
                    <button
                      type="button"
                      onClick={generateTempPassword}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Geçici şifre üret
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={credForm.password}
                      onChange={(e) => setCredForm({ ...credForm, password: e.target.value })}
                      placeholder="Değiştirmek istemiyorsanız boş bırakın"
                      autoComplete="new-password"
                      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                      title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {credForm.password && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Yeni Şifre (Tekrar)
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={credForm.confirmPassword}
                      onChange={(e) => setCredForm({ ...credForm, confirmPassword: e.target.value })}
                      placeholder="Şifreyi tekrar girin"
                      autoComplete="new-password"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                )}

                {credMessage && (
                  <div className={`flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                    credMessage.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border border-red-200 text-red-800'
                  }`}>
                    {credMessage.type === 'success' ? (
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <p className="flex-1">{credMessage.text}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleUpdateCredentials}
                  disabled={savingCred}
                  className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingCred ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Giriş Bilgilerini Kaydet
                    </>
                  )}
                </button>

                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Şifre sunucu tarafında güvenli biçimde şifrelenerek (hash) kaydedilir. Yeni şifreyi esnafa kendiniz iletin;
                  esnaf giriş yaptıktan sonra şifresini değiştirebilir.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Toplam Ciro (TL)
                </label>
                <input
                  type="number"
                  value={editForm.total_revenue}
                  onChange={(e) => setEditForm({ ...editForm, total_revenue: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" />
 Enlem (Latitude)
                </label>
                <input
                  type="number"
                  value={editForm.latitude}
                  onChange={(e) => setEditForm({ ...editForm, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500"
                  step="0.000001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" />
 Boylam (Longitude)
                </label>
                <input
                  type="number"
                  value={editForm.longitude}
                  onChange={(e) => setEditForm({ ...editForm, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500"
                  step="0.000001"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setEditingMerchant(null)}
                  className="flex-1 py-3 px-4 rounded-xl font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleUpdateMerchant}
                  disabled={saving}
                  className="flex-1 py-3 px-4 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Kaydet
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
