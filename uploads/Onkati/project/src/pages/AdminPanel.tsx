import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Handshake,
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
  points_rate?: number;
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
    points_rate: 7,
  });
  const [saving, setSaving] = useState(false);
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
      if (activeTab === 'overview') {
        const { count: customerCount } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true });

        const { count: merchantCount } = await supabase
          .from('merchants')
          .select('*', { count: 'exact', head: true });

        const { count: transactionCount } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed');

        const { data: merchantStats } = await supabase
          .from('merchants')
          .select('total_revenue, total_points_distributed');

        const totalRevenue = merchantStats?.reduce((sum, m) => sum + (m.total_revenue || 0), 0) || 0;
        const totalPoints = merchantStats?.reduce((sum, m) => sum + (m.total_points_distributed || 0), 0) || 0;

        setStats({
          totalCustomers: customerCount || 0,
          totalMerchants: merchantCount || 0,
          totalTransactions: transactionCount || 0,
          totalRevenue,
          totalPoints,
        });
      } else if (activeTab === 'customers') {
        const { data } = await supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        setCustomers(data || []);
      } else if (activeTab === 'merchants') {
        const { data } = await supabase
          .from('merchants')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        setMerchants(data || []);
      } else if (activeTab === 'transactions') {
        const { data } = await supabase
          .from('transactions')
          .select(`
            *,
            customers (full_name, phone),
            merchants (store_name, store_id)
          `)
          .order('created_at', { ascending: false })
          .limit(200);
        setTransactions(data || []);
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

  const openEditMerchant = (merchant: MerchantData) => {
    setEditingMerchant(merchant);
    setEditForm({
      total_revenue: merchant.total_revenue || 0,
      latitude: merchant.latitude || 0,
      longitude: merchant.longitude || 0,
      points_rate: merchant.points_rate || 7,
    });
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
          points_rate: editForm.points_rate,
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
    c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredMerchants = merchants.filter(m =>
    m.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.phone.includes(searchTerm) ||
    m.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.email && m.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
          <Link to="/" className="flex items-center gap-2">
            <Handshake className="w-8 h-8 text-secondary-400" />
            <span className="text-xl font-heading font-bold">Onkatı Admin</span>
          </Link>
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
                          <p className="text-xs text-gray-500">Puan: %{merchant.points_rate || 7}</p>
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
                      placeholder="Esnaf ara..."
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
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Dükkan</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Yetkili</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Telefon</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">E-posta</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Konum</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ciro</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Puan Oranı</th>
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
                              <p className="text-xs text-gray-500">No: {merchant.store_id}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{merchant.full_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{merchant.phone}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{merchant.email || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-600">
                              <p>{merchant.city} / {merchant.district}</p>
                              <p className="text-xs text-gray-400">{merchant.latitude && merchant.longitude ? `${merchant.latitude}, ${merchant.longitude}` : 'Konum yok'}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-primary-600">{formatCurrency(merchant.total_revenue)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">%{merchant.points_rate || 7}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              merchant.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {merchant.is_active ? 'Aktif' : 'Pasif'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditMerchant(merchant)}
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                                title="Düzenle"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleUserStatus('merchants', merchant.id, merchant.is_active)}
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                                title={merchant.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                              >
                                {merchant.is_active ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
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

      {/* Edit Merchant Modal */}
      {editingMerchant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Puan Oranı (%)
                </label>
                <input
                  type="number"
                  value={editForm.points_rate}
                  onChange={(e) => setEditForm({ ...editForm, points_rate: parseInt(e.target.value) || 7 })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500"
                  min="1"
                  max="25"
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
