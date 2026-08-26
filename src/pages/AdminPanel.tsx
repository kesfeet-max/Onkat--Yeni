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
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import {
  PHONE_LENGTH,
  normalizePhoneInput,
  validatePhone,
  sanitizeFullNameInput,
  normalizeFullName,
  validateFullName,
} from '../lib/validation';
import {
  resolveMerchantSubscription,
  formatTrDate,
  formatTrShortDate,
  computeExtendedPaidUntil,
} from '../lib/subscription';

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
  /** Son onaylanan havale/EFT ödemesinin tarihi (migration çalışmadıysa boş gelir). */
  last_payment_approved_at?: string | null;
}

/** Esnaf listesi görünüm filtresi */
type MerchantFilter = 'all' | 'overdue' | 'passive';

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

/** Esnaf detay modalında gösterilen, gerçek işlemlerden hesaplanan özet. */
interface DetailStats {
  revenue: number;
  points: number;
  spent: number;
  customers: number;
  transactionCount: number;
}

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [merchantFilter, setMerchantFilter] = useState<MerchantFilter>('all');
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
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
  /** Müşteri bilgileri (Ad Soyad / Telefon) düzenleme modalı durumu */
  const [editingCustomer, setEditingCustomer] = useState<CustomerData | null>(null);
  const [customerForm, setCustomerForm] = useState({ full_name: '', phone: '' });
  const [customerFormErrors, setCustomerFormErrors] = useState<{ full_name?: string; phone?: string }>({});
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [credForm, setCredForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [credInfo, setCredInfo] = useState<{ email: string; last_sign_in_at: string | null } | null>(null);
  const [loadingCred, setLoadingCred] = useState(false);
  const [savingCred, setSavingCred] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [credMessage, setCredMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [detailMerchant, setDetailMerchant] = useState<MerchantData | null>(null);
  const [merchantTransactions, setMerchantTransactions] = useState<TransactionData[]>([]);
  const [detailStats, setDetailStats] = useState<DetailStats | null>(null);
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

  /** Müşteri düzenleme modalını, seçilen müşterinin mevcut bilgileriyle doldurarak açar. */
  const openCustomerEdit = (customer: CustomerData) => {
    setEditingCustomer(customer);
    setCustomerForm({
      full_name: normalizeFullName(customer.full_name || ''),
      phone: normalizePhoneInput(customer.phone || ''),
    });
    setCustomerFormErrors({});
  };

  /** Müşteri düzenleme modalını kapatır ve form durumunu sıfırlar. */
  const closeCustomerEdit = () => {
    setEditingCustomer(null);
    setCustomerForm({ full_name: '', phone: '' });
    setCustomerFormErrors({});
  };

  /**
   * Seçili müşterinin Ad Soyad ve Telefon Numarası bilgilerini günceller.
   *
   * Kurallar:
   *  - Ad Soyad alanı e-posta / geçersiz karakter içeremez (validateFullName)
   *  - Telefon numarası başında 0 olacak şekilde tam 11 hane olmalıdır (validatePhone)
   *
   * Yol sırası: 1) Edge Function (service_role, RLS'i aşar) 2) Doğrudan tablo güncellemesi.
   * Hiçbiri satır güncellemezse kullanıcıya "başarılı" mesajı gösterilmez.
   */
  const saveCustomerInfo = async () => {
    if (!editingCustomer) return;

    const nameCheck = validateFullName(customerForm.full_name);
    const phoneCheck = validatePhone(customerForm.phone);

    if (!nameCheck.valid || !phoneCheck.valid) {
      setCustomerFormErrors({ full_name: nameCheck.message, phone: phoneCheck.message });
      return;
    }

    const fullName = normalizeFullName(customerForm.full_name);
    const phone = normalizePhoneInput(customerForm.phone);
    const customerId = editingCustomer.id;

    /** Listeyi anında günceller, böylece tablo beklemeden yeni bilgileri gösterir. */
    const applyLocal = () => {
      setCustomers(prev =>
        prev.map(c => (c.id === customerId ? { ...c, full_name: fullName, phone } : c))
      );
    };

    setSavingCustomer(true);
    setMessage(null);

    try {
      // 1) Edge Function yolu (service_role ile çalışır, RLS'i aşar)
      const { data: { session } } = await supabase.auth.getSession();
      let edgeError: string | null = null;

      if (session) {
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'update_customer',
              id: customerId,
              full_name: fullName,
              phone,
            }),
          });
          const json = await response.json().catch(() => ({}));

          if (response.ok && json?.success) {
            applyLocal();
            setMessage({ type: 'success', text: 'Müşteri bilgileri başarıyla güncellendi' });
            closeCustomerEdit();
            fetchData();
            return;
          }

          if (typeof json?.error === 'string') {
            edgeError = json.error;
          }
        } catch {
          // Edge Function erişilemedi; doğrudan güncelleme denenecek
        }
      }

      // 2) Doğrudan tablo güncellemesi — etkilenen satır sayısı doğrulanır
      const { data: updated, error } = await supabase
        .from('customers')
        .update({ full_name: fullName, phone, updated_at: new Date().toISOString() })
        .eq('id', customerId)
        .select('id');

      if (!error && updated && updated.length > 0) {
        applyLocal();
        setMessage({ type: 'success', text: 'Müşteri bilgileri başarıyla güncellendi' });
        closeCustomerEdit();
        fetchData();
        return;
      }

      setMessage({
        type: 'error',
        text:
          edgeError ||
          error?.message ||
          'Müşteri bilgileri güncellenemedi. Lütfen bilgileri kontrol edip tekrar deneyin.',
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu',
      });
    } finally {
      setSavingCustomer(false);
    }
  };

  /**
   * Aktif / Pasif durumunu değiştirir.
   *
   * Üç yol sırayla denenir ve HER BİRİNİN gerçekten satır güncellediği doğrulanır:
   *  1) RPC (admin_esnaf_durum_degistir) — SECURITY DEFINER, RLS'i aşar
   *  2) Edge Function (admin-data / toggle_status) — service_role ile çalışır
   *  3) Doğrudan tablo güncellemesi — .select() ile etkilenen satır sayısı kontrol edilir
   *
   * Hiçbiri satır güncellemezse kullanıcıya sessiz "başarılı" mesajı GÖSTERİLMEZ.
   */
  const toggleUserStatus = async (table: 'customers' | 'merchants', id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    const successText =
      table === 'merchants'
        ? nextStatus
          ? 'Esnaf aktif edildi'
          : 'Esnaf manuel olarak pasife alındı'
        : nextStatus
          ? 'Müşteri aktif edildi'
          : 'Müşteri pasife alındı';

    /** Yerel listeyi anında günceller, böylece tablo beklemeden yeni durumu gösterir. */
    const applyLocal = () => {
      if (table === 'merchants') {
        setMerchants(prev => prev.map(m => (m.id === id ? { ...m, is_active: nextStatus } : m)));
      } else {
        setCustomers(prev => prev.map(c => (c.id === id ? { ...c, is_active: nextStatus } : c)));
      }
    };

    setTogglingId(id);
    setMessage(null);

    try {
      // 1) RPC yolu (yalnızca esnaf için tanımlı)
      if (table === 'merchants') {
        const { data: rpcData, error: rpcError } = await supabase.rpc('admin_esnaf_durum_degistir', {
          p_merchant_id: id,
          p_active: nextStatus,
        });

        if (!rpcError && rpcData && (rpcData as any).success === true) {
          applyLocal();
          setMessage({ type: 'success', text: successText });
          fetchData();
          return;
        }
      }

      // 2) Edge Function yolu (service_role, RLS'i aşar)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'toggle_status',
              table,
              id,
              current_status: currentStatus,
            }),
          });
          const json = await response.json().catch(() => ({}));

          if (response.ok && json?.success) {
            applyLocal();
            setMessage({ type: 'success', text: successText });
            fetchData();
            return;
          }
        } catch {
          // Ağ hatası: son yola geçilir
        }
      }

      // 3) Doğrudan güncelleme — etkilenen satır sayısı doğrulanır
      const { data: updatedRows, error } = await supabase
        .from(table)
        .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id');

      if (error) throw error;

      if (!updatedRows || updatedRows.length === 0) {
        setMessage({
          type: 'error',
          text:
            'Durum değiştirilemedi: veritabanı güvenlik kuralları bu güncellemeyi engelliyor. ' +
            'Supabase SQL Editor üzerinde yönetici yetki betiğini çalıştırmanız gerekiyor.',
        });
        return;
      }

      applyLocal();
      setMessage({ type: 'success', text: successText });
      fetchData();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message
          ? `Durum güncellenemedi: ${err.message}`
          : 'Durum güncellenemedi. Lütfen tekrar deneyin.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  /**
   * Esnaf detay modalını açar.
   *
   * Özet değerler (ciro / dağıtılan puan / müşteri sayısı) merchants tablosundaki
   * sabit kolonlardan DEĞİL, gerçek "completed" işlemlerden hesaplanır.
   * Önce Edge Function (service_role) denenir; erişilemezse doğrudan sorguya
   * düşülür ve hesap istemci tarafında yapılır.
   */
  const openMerchantDetail = async (merchant: MerchantData) => {
    setDetailMerchant(merchant);
    setLoadingDetail(true);
    setMerchantTransactions([]);
    setDetailStats(null);

    /** İşlem listesinden özet çıkarır. */
    const computeStats = (list: TransactionData[]): DetailStats => {
      const uniqueCustomers = new Set<string>();
      let revenue = 0;
      let points = 0;
      let spent = 0;

      list.forEach(t => {
        const anyTx = t as unknown as { customer_id?: string };
        if (anyTx.customer_id) uniqueCustomers.add(anyTx.customer_id);
        if (t.type === 'earn') {
          revenue += Number(t.amount) || 0;
          points += Number(t.points) || 0;
        } else if (t.type === 'spend') {
          spent += Number(t.points) || 0;
        }
      });

      return {
        revenue,
        points,
        spent,
        customers: uniqueCustomers.size,
        transactionCount: list.length,
      };
    };

    try {
      // 1) Edge Function (RLS'i aşar, en güvenilir yol)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data?action=merchant_detail&merchant_id=${merchant.id}`,
            { headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
          );
          const json = await response.json().catch(() => ({}));

          if (response.ok && json?.success) {
            setMerchantTransactions((json.transactions || []) as TransactionData[]);
            setDetailStats(json.stats as DetailStats);
            return;
          }
        } catch {
          // Ağ hatası: doğrudan sorguya geçilir
        }
      }

      // 2) Doğrudan sorgu (yedek yol)
      const { data, error } = await supabase
        .from('transactions')
        .select('id, type, amount, points, status, created_at, customer_id, customers(full_name, phone), merchants(store_name, store_id)')
        .eq('merchant_id', merchant.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!error && data) {
        const list = data as unknown as TransactionData[];
        setMerchantTransactions(list.slice(0, 50));
        setDetailStats(computeStats(list));
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
      // 1) Öncelikli yol: veritabanı RPC'si
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

      // RPC'nin yetki/oturum kaynaklı reddi, iş kuralı hatasından ayrılır:
      // yetki hatasında Edge Function yolu denenir, iş kuralı hatası
      // doğrudan kullanıcıya gösterilir.
      const rpcAuthBlocked =
        !!rpcError ||
        (rpcResult && !rpcResult.success &&
          /yönetici|yonetici|yetki|oturum/i.test(String(rpcResult.error || '')));

      if (!rpcAuthBlocked && rpcResult) {
        if (!rpcResult.success) {
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
          const lower = raw.toLowerCase();
          if (lower.includes('gecersiz istek') || lower.includes('geçersiz istek')) {
            throw new Error(
              'Sunucu tarafı güncellemesi henüz yayınlanmadığı için bu işlem yapılamıyor. ' +
              'Lütfen Supabase SQL Editor üzerinden yeni veritabanı betiğini (admin_merchant_credentials_rpc) bir kez çalıştırın; ' +
              'sonrasında e-posta ve şifre güncellemesi çalışacaktır.'
            );
          }
          if (lower.includes('admin yetkisi yok') || lower.includes('yönetici')) {
            throw new Error(
              'Yönetici doğrulaması yapılamadı. Bunun nedeni genellikle yeni veritabanı betiğinin ' +
              '(admin_merchant_credentials_rpc) henüz çalıştırılmamış olmasıdır. ' +
              'Betiği Supabase SQL Editor üzerinden bir kez çalıştırıp tekrar deneyin.'
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

  /**
   * Havale/EFT kontrolü sonrası esnafın abonelik süresini uzatır.
   * Süre uzatma tamamen manuel bir yönetici işlemidir.
   *
   * TARİH MANTIĞI (bugünün tarihi baz ALINMAZ):
   *  - Koşul A: Esnafın mevcut bitiş tarihi (deneme süresi veya ödenmiş abonelik —
   *    hangisi daha ileriyse) gelecekteyse, süre O TARİHİN üzerine eklenir.
   *    Örn. bitişi 10 Eylül olan esnaf bugün uzatılırsa yeni bitiş 10 Ekim olur.
   *  - Koşul B: Mevcut bitiş tarihi geçmişte kaldıysa yeni dönem bugünden başlatılır.
   *
   * Hesap hem veritabanı fonksiyonunda hem burada yapılır; veritabanındaki fonksiyon
   * henüz güncellenmemişse (eski sürüm bugünden ekliyordu) doğru tarih ile düzeltilir.
   */
  const extendSubscription = async (merchant: MerchantData, months: number) => {
    const storeId = Number(merchant.store_id);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      setMessage({ type: 'error', text: 'Bu esnafın mağaza kodu bulunamadı, süre uzatılamıyor.' });
      return;
    }

    // Beklenen doğru bitiş tarihi (mevcut bitişin üzerine eklenmiş hali)
    const plan = computeExtendedPaidUntil(merchant, months);
    const expectedEndIso = plan.newEnd.toISOString();
    const storeLabel = merchant.store_name || 'Esnaf';

    /** Doğru tarihi doğrudan tabloya yazar (RPC yok/eski sürüm ise devreye girer). */
    const writeExpectedEnd = async () => {
      const { data, error } = await supabase
        .from('merchants')
        .update({
          is_active: true,
          subscription_status: 'active',
          last_payment_approved_at: new Date().toISOString(),
          subscription_paid_until: expectedEndIso,
        })
        .eq('id', merchant.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Kayıt güncellenemedi. Yönetici yetkisi veya veritabanı güncellemesini kontrol edin.');
      }
    };

    setExtendingId(merchant.id);
    setMessage(null);
    try {
      let appliedEnd: Date | null = null;

      const { data, error } = await supabase.rpc('approve_merchant_payment', {
        p_store_id: storeId,
        p_months: months,
      });

      if (error) {
        // Fonksiyon bulunamadı / çalıştırılamadıysa doğrudan güncelleme ile devam et.
        await writeExpectedEnd();
        appliedEnd = plan.newEnd;
      } else {
        // Fonksiyon eski sürümde boolean, yeni sürümde json döndürür.
        if (data && typeof data === 'object' && (data as any).success === false) {
          setMessage({ type: 'error', text: (data as any).error || 'Süre uzatılamadı' });
          return;
        }
        if (data === false) {
          setMessage({ type: 'error', text: 'Esnaf bulunamadı, süre uzatılamadı' });
          return;
        }

        const returnedRaw =
          data && typeof data === 'object' ? (data as any).subscription_paid_until : null;
        const returnedEnd = returnedRaw ? new Date(returnedRaw) : null;
        const returnedValid = returnedEnd && !Number.isNaN(returnedEnd.getTime());

        // Eski fonksiyon sürümü deneme süresini yok sayıp bugünden takvim ayı ekliyordu.
        // Beklenen tarihten 12 saatten fazla sapma varsa doğru tarihle düzeltilir.
        const driftMs = returnedValid
          ? Math.abs(returnedEnd.getTime() - plan.newEnd.getTime())
          : Number.POSITIVE_INFINITY;

        if (driftMs > 12 * 60 * 60 * 1000) {
          await writeExpectedEnd();
          appliedEnd = plan.newEnd;
        } else {
          appliedEnd = returnedEnd;
        }
      }

      const basisNote = plan.startedFromToday
        ? 'Süresi dolmuş olduğu için yeni dönem bugünden başlatıldı.'
        : `Mevcut bitiş tarihi (${formatTrShortDate(plan.previousEnd)}) korunarak üzerine eklendi.`;

      setMessage({
        type: 'success',
        text: `${storeLabel} için ödeme onaylandı, aboneliğe ${plan.addedDays} gün eklendi. Yeni Bitiş: ${formatTrShortDate(appliedEnd)} — ${basisNote}`,
      });
      fetchData();
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Süre uzatma işlemi başarısız oldu. Veritabanı güncellemesini çalıştırdığınızdan emin olun.',
      });
    } finally {
      setExtendingId(null);
    }
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

  /** Süresi dolmuş / ödemesi beklenen esnaflar (engellenmezler, sadece uyarı listesinde görünürler). */
  const overdueMerchants = merchants.filter(m => resolveMerchantSubscription(m).isOverdue);
  /** Yönetici tarafından manuel pasife alınmış esnaflar. */
  const passiveMerchants = merchants.filter(m => m.is_active === false);

  const visibleMerchants = filteredMerchants.filter(m => {
    if (merchantFilter === 'overdue') return resolveMerchantSubscription(m).isOverdue;
    if (merchantFilter === 'passive') return m.is_active === false;
    return true;
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
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openCustomerEdit(customer)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                title="Bilgileri Düzenle"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => toggleUserStatus('customers', customer.id, customer.is_active)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 transition-colors"
                                title={customer.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                              >
                                {customer.is_active ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
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

            {/* Müşteri Bilgileri Düzenleme Modalı */}
            {editingCustomer && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
                <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
                  <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                    <div>
                      <h3 className="font-heading font-bold text-gray-900">Müşteri Bilgilerini Düzenle</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {editingCustomer.email || 'E-posta kayıtlı değil'}
                      </p>
                    </div>
                    <button
                      onClick={closeCustomerEdit}
                      className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                      title="Kapat"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Ad Soyad */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ad Soyad</label>
                      <input
                        type="text"
                        value={customerForm.full_name}
                        onChange={(e) => {
                          setCustomerForm(prev => ({ ...prev, full_name: sanitizeFullNameInput(e.target.value) }));
                          setCustomerFormErrors(prev => ({ ...prev, full_name: undefined }));
                        }}
                        placeholder="Ad Soyad"
                        autoComplete="off"
                        className={`w-full px-4 py-3 rounded-xl border text-sm transition focus:ring-2 ${
                          customerFormErrors.full_name
                            ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                            : 'border-gray-200 focus:ring-primary-500 focus:border-primary-500'
                        }`}
                      />
                      {customerFormErrors.full_name ? (
                        <p className="text-xs text-red-600 mt-1.5 font-medium">{customerFormErrors.full_name}</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1.5">E-posta adresi değil, ad ve soyad yazın</p>
                      )}
                    </div>

                    {/* Telefon Numarası */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Telefon Numarası</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={PHONE_LENGTH}
                        value={customerForm.phone}
                        onChange={(e) => {
                          setCustomerForm(prev => ({ ...prev, phone: normalizePhoneInput(e.target.value) }));
                          setCustomerFormErrors(prev => ({ ...prev, phone: undefined }));
                        }}
                        placeholder="05074445588"
                        className={`w-full px-4 py-3 rounded-xl border text-sm tracking-wide transition focus:ring-2 ${
                          customerFormErrors.phone
                            ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                            : 'border-gray-200 focus:ring-primary-500 focus:border-primary-500'
                        }`}
                      />
                      {customerFormErrors.phone ? (
                        <p className="text-xs text-red-600 mt-1.5 font-medium">{customerFormErrors.phone}</p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1.5">
                          Başında 0 olacak şekilde 11 hane (Örn: 05074445588)
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 px-5 pb-5">
                    <button
                      onClick={closeCustomerEdit}
                      disabled={savingCustomer}
                      className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
                    >
                      İptal
                    </button>
                    <button
                      onClick={saveCustomerInfo}
                      disabled={savingCustomer}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {savingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Güncellenmiş Bilgileri Uygula
                    </button>
                  </div>
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
                    Süresi dolan esnaflar sistem tarafından otomatik olarak kapatılmaz; çalışmaya devam ederler.
                    Havale / EFT kontrolünüzü yaptıktan sonra "Süre Uzat" ile aboneliği uzatabilir, gerekirse esnafı
                    manuel olarak Pasif yapabilirsiniz. Sistemde kredi kartı ile ödeme alınmaz.
                  </p>

                  {/* Geciken ödemeler özeti */}
                  {overdueMerchants.length > 0 && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-orange-800">
                        <span className="font-bold">{overdueMerchants.length} esnafın</span> ödeme süresi dolmuş.
                        Havale/EFT kontrolünden sonra süreyi uzatmanız gerekiyor.
                      </p>
                    </div>
                  )}

                  {/* Liste filtreleri */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => setMerchantFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        merchantFilter === 'all'
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Tüm Esnaflar ({merchants.length})
                    </button>
                    <button
                      onClick={() => setMerchantFilter('overdue')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        merchantFilter === 'overdue'
                          ? 'bg-orange-600 text-white border-orange-600'
                          : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Geciken Ödemeler ({overdueMerchants.length})
                    </button>
                    <button
                      onClick={() => setMerchantFilter('passive')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        merchantFilter === 'passive'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      Pasife Alınanlar ({passiveMerchants.length})
                    </button>
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
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Abonelik</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Durum</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {visibleMerchants.map(merchant => {
                        const sub = resolveMerchantSubscription(merchant);
                        const periodEnd = sub.hasPaidAccess ? sub.paidUntilDate : sub.trialEndDate;
                        const isExtending = extendingId === merchant.id;

                        return (
                        <tr
                          key={merchant.id}
                          className={`transition-colors ${
                            merchant.is_active === false
                              ? 'bg-red-50/70 hover:bg-red-50'
                              : sub.isOverdue
                                ? 'bg-orange-50/70 hover:bg-orange-50'
                                : 'hover:bg-gray-50'
                          }`}
                        >
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

                          {/* Abonelik / ödeme durumu */}
                          <td className="px-4 py-3">
                            {sub.isOverdue ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                                  <AlertTriangle className="w-3 h-3" />
                                  Ödeme Bekleniyor
                                </span>
                                <p className="text-[11px] text-orange-700 font-medium">
                                  {sub.overdueDays > 0 ? `${sub.overdueDays} gün gecikme` : 'Süresi bugün doldu'}
                                </p>
                                <p className="text-[11px] text-gray-500">Bitiş: {formatTrDate(periodEnd)}</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                                  sub.isEndingSoon
                                    ? 'bg-amber-100 text-amber-700'
                                    : sub.hasPaidAccess
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-100 text-blue-700'
                                }`}>
                                  <CalendarClock className="w-3 h-3" />
                                  {sub.hasPaidAccess ? 'Abonelik Aktif' : 'Deneme Süresi'}
                                </span>
                                <p className="text-[11px] text-gray-500">
                                  {sub.daysLeft} gün kaldı · {formatTrDate(periodEnd)}
                                </p>
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              merchant.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {merchant.is_active !== false ? 'Aktif' : 'Pasif'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
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
                                onClick={() => extendSubscription(merchant, 1)}
                                disabled={isExtending}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 transition-colors"
                                title="Havale/EFT onaylandı, aboneliği 1 ay uzat"
                              >
                                {isExtending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeDollarSign className="w-3.5 h-3.5" />}
                                1 Ay Uzat
                              </button>
                              <button
                                onClick={() => extendSubscription(merchant, 12)}
                                disabled={isExtending}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-60 transition-colors"
                                title="Havale/EFT onaylandı, aboneliği 12 ay uzat"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                                12 Ay
                              </button>
                              <button
                                onClick={() => toggleUserStatus('merchants', merchant.id, merchant.is_active !== false)}
                                disabled={togglingId === merchant.id}
                                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                                  merchant.is_active !== false
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                                }`}
                                title={merchant.is_active !== false ? 'Manuel olarak Pasif Yap' : 'Havale onaylandı, Aktif Yap'}
                              >
                                {togglingId === merchant.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : merchant.is_active !== false ? (
                                  <X className="w-3.5 h-3.5" />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                )}
                                {merchant.is_active !== false ? 'Pasif Yap' : 'Aktif Yap'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {visibleMerchants.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                            {merchantFilter === 'overdue'
                              ? 'Ödemesi geciken esnaf bulunmuyor.'
                              : merchantFilter === 'passive'
                                ? 'Pasife alınmış esnaf bulunmuyor.'
                                : 'Kayıtlı esnaf bulunmuyor.'}
                          </td>
                        </tr>
                      )}
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

            {/* Özet Kartları — gerçek işlemlerden hesaplanır */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 border-b border-gray-100">
              <div className="bg-primary-50 rounded-xl p-3 text-center">
                <p className="text-xs text-primary-600 font-medium">Toplam Ciro</p>
                <p className="text-lg font-bold text-primary-700">
                  {loadingDetail ? '…' : formatCurrency(detailStats ? detailStats.revenue : (detailMerchant.total_revenue || 0))}
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-green-600 font-medium">Dağıtılan Puan</p>
                <p className="text-lg font-bold text-green-700">
                  {loadingDetail ? '…' : `${detailStats ? detailStats.points : (detailMerchant.total_points_distributed || 0)} TL`}
                </p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-xs text-amber-600 font-medium">Harcanan Puan</p>
                <p className="text-lg font-bold text-amber-700">
                  {loadingDetail ? '…' : `${detailStats ? detailStats.spent : 0} TL`}
                </p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs text-blue-600 font-medium">Müşteri Sayısı</p>
                <p className="text-lg font-bold text-blue-700">
                  {loadingDetail ? '…' : (detailStats ? detailStats.customers : (detailMerchant.total_customers || 0))}
                </p>
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
