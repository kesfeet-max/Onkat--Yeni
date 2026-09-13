import { supabase } from './supabase';
import type { UserRole } from '../types';

/**
 * Google ile giriş sonrası SESSİZ (formsuz) profil oluşturma yardımcıları.
 *
 * Tasarım ilkesi: bu modül ASLA hata fırlatmaz. Her fonksiyon en kötü durumda
 * `null` döner; böylece kullanıcı hiçbir zaman hata ekranında bekletilmez.
 *
 * Kayıt için üç kademeli güvenli yol denenir:
 *   1. `onkati_google_profil_hazirla` RPC'si (SECURITY DEFINER, tek çağrı)
 *   2. Doğrudan Supabase istemcisiyle insert (RLS self-insert politikasıyla)
 *   3. Son yedek olarak `auth-google-complete` Edge Function'ı
 */

/** Ad Soyad alanında veritabanı tetikleyicisinin kabul ettiği karakterler dışındakiler. */
const NAME_DISALLOWED = /[^A-Za-zÇĞİÖŞÜçğıöşü\s'’.-]/g;

/** E-posta çağrışımı yapan ifadeler DB tarafında reddedilir. */
const EMAIL_PROVIDER_PATTERN = /(gmail|hotmail|outlook|yahoo|icloud|yandex|mynet|proton|windowslive)/i;
const DOMAIN_SUFFIX_PATTERN = /\.(com|net|org|edu|gov|info|io|co|tr|de|nl)\b/i;

const FALLBACK_CUSTOMER_NAME = 'Onkatı Üyesi';
const FALLBACK_MERCHANT_NAME = 'Onkatı Esnafı';

/** OAuth yönlendirmesi boyunca rol tercihinin saklandığı anahtar. */
export const OAUTH_ROLE_STORAGE_KEY = 'onkati-oauth-role';

/** Rol tercihini güvenli biçimde okur (localStorage erişilemezse undefined). */
export function readStoredOAuthRole(): UserRole | undefined {
  try {
    const stored = localStorage.getItem(OAUTH_ROLE_STORAGE_KEY);
    if (stored === 'merchant' || stored === 'customer') return stored;
  } catch {
    // localStorage erişilemez — varsayılan rol kullanılır
  }
  return undefined;
}

/** Rol tercihini temizler; hata durumunda sessizce devam eder. */
export function clearStoredOAuthRole(): void {
  try {
    localStorage.removeItem(OAUTH_ROLE_STORAGE_KEY);
  } catch {
    // Sessizce devam
  }
}

/**
 * Google'dan gelen ismi veritabanı kurallarına uygun hâle getirir.
 *
 * Rakamlar, "@" ve geçersiz karakterler temizlenir. Sonuç kuralları
 * karşılamıyorsa `fallback` döner; böylece kullanıcıdan ek bilgi istenmez.
 */
export function buildSafeFullName(rawName: string, fallback: string): string {
  const cleaned = (rawName || '')
    .replace(NAME_DISALLOWED, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

  const letterCount = cleaned.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length;
  if (letterCount < 3) return fallback;
  if (EMAIL_PROVIDER_PATTERN.test(cleaned)) return fallback;
  if (DOMAIN_SUFFIX_PATTERN.test(cleaned)) return fallback;

  return cleaned;
}

/**
 * Telefon alanı zorunlu ve tekil olduğu için çakışma yaratmayan geçici bir
 * numara üretir. Türkiye'de kullanımda olmayan `09` ön eki seçilir; böylece
 * yer tutucu numaralar gerçek numaralardan ayrılabilir ve kullanıcı isterse
 * panelinden gerçek numarasını kaydedebilir.
 *
 * Üretilen değer DB kuralını (`^0[1-9][0-9]{9}$`) sağlar.
 */
export function generatePlaceholderPhone(): string {
  let digits = '';
  for (let i = 0; i < 9; i += 1) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `09${digits}`;
}

/** Kullanıcının mevcut profil rolünü bulur; profil yoksa null döner. */
export async function findExistingRole(userId: string): Promise<UserRole | null> {
  try {
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (customer?.id) return 'customer';
  } catch (err) {
    console.warn('[GoogleSignup] Müşteri profili kontrolü başarısız:', err);
  }

  try {
    const { data: merchant } = await supabase
      .from('merchants')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (merchant?.id) return 'merchant';
  } catch (err) {
    console.warn('[GoogleSignup] Esnaf profili kontrolü başarısız:', err);
  }

  return null;
}

/** 1. yol: SECURITY DEFINER RPC ile tek çağrıda sessiz kayıt. */
async function ensureViaRpc(role: UserRole): Promise<UserRole | null> {
  try {
    const { data, error } = await supabase.rpc('onkati_google_profil_hazirla', {
      p_role: role,
    });

    if (error) {
      console.warn('[GoogleSignup] RPC kullanılamadı:', error.message);
      return null;
    }

    const result = data as { success?: boolean; role?: string } | null;
    if (result?.success && (result.role === 'customer' || result.role === 'merchant')) {
      return result.role;
    }

    if (result && !result.success) {
      console.warn('[GoogleSignup] RPC profil oluşturamadı:', (result as any).error);
    }
    return null;
  } catch (err) {
    console.warn('[GoogleSignup] RPC çağrısı başarısız:', err);
    return null;
  }
}

/**
 * 2. yol: Doğrudan Supabase istemcisiyle insert.
 *
 * Zorunlu sütunlar çakışma yaratmayacak geçici varsayılanlarla doldurulur.
 * Telefon tekillik çakışmasında yeni numarayla yeniden denenir.
 */
async function ensureViaDirectInsert(
  userId: string,
  email: string,
  fullName: string,
  role: UserRole,
): Promise<UserRole | null> {
  const fallbackName = role === 'merchant' ? FALLBACK_MERCHANT_NAME : FALLBACK_CUSTOMER_NAME;
  let nameToUse = fullName || fallbackName;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const phone = generatePlaceholderPhone();

    const payload = role === 'customer'
      ? {
          user_id: userId,
          phone,
          email,
          full_name: nameToUse,
          device_id: null,
          points_balance: 0,
          is_active: true,
        }
      : {
          user_id: userId,
          phone,
          email,
          full_name: nameToUse,
          // Esnafın zorunlu alanları geçici varsayılanla doldurulur; panelden düzenlenir
          store_name: nameToUse,
          city: 'Belirtilmedi',
          district: 'Belirtilmedi',
          sector: 'diger',
          latitude: 0,
          longitude: 0,
          total_revenue: 0,
          total_points_distributed: 0,
          total_customers: 0,
          is_active: true,
        };

    try {
      const { error } = await supabase
        .from(role === 'customer' ? 'customers' : 'merchants')
        .insert(payload as never);

      if (!error) return role;

      const message = error.message || '';

      // Eşzamanlı istek profili oluşturmuş olabilir
      if (/duplicate key|unique constraint/i.test(message)) {
        const existing = await findExistingRole(userId);
        if (existing) return existing;
        // Telefon / store_id çakışması — yeni değerle tekrar dene
        continue;
      }

      // Ad soyad kuralı devreye girdiyse güvenli varsayılan isimle tekrar dene
      if (/ad soyad|full_name|gecersiz/i.test(message) && nameToUse !== fallbackName) {
        nameToUse = fallbackName;
        continue;
      }

      console.warn('[GoogleSignup] Doğrudan insert başarısız:', message);
      return null;
    } catch (err) {
      console.warn('[GoogleSignup] Doğrudan insert hatası:', err);
      return null;
    }
  }

  return findExistingRole(userId);
}

/** 3. yol: Son yedek olarak Edge Function (deploy edilmişse). */
async function ensureViaEdgeFunction(role: UserRole): Promise<UserRole | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return null;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-google-complete`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ role }),
    });

    const data = await response.json().catch(() => null);
    if (response.ok && data?.success && (data.role === 'customer' || data.role === 'merchant')) {
      return data.role as UserRole;
    }
    return null;
  } catch (err) {
    console.warn('[GoogleSignup] Edge Function yedeği kullanılamadı:', err);
    return null;
  }
}

/**
 * Google ile giriş yapan kullanıcının profilini garanti altına alır.
 *
 * Profil varsa rolünü döner; yoksa kullanıcıdan hiçbir bilgi istemeden
 * sessizce oluşturur. Tüm yollar başarısız olursa `null` döner — çağıran taraf
 * bu durumda da kullanıcıyı hata ekranında bekletmez, ana sayfaya yönlendirir.
 */
export async function ensureUserProfile(preferredRole?: UserRole): Promise<UserRole | null> {
  let userId = '';
  let email = '';
  let metaName = '';
  let metaRole: UserRole | undefined;

  try {
    const { data } = await supabase.auth.getUser();
    const authUser = data?.user;
    if (!authUser) return null;

    userId = authUser.id;
    email = (authUser.email || '').trim().toLowerCase();
    const metadata = (authUser.user_metadata || {}) as Record<string, unknown>;
    metaName = String(metadata.full_name || metadata.name || '');
    if (metadata.role === 'merchant' || metadata.role === 'customer') {
      metaRole = metadata.role;
    }
  } catch (err) {
    console.warn('[GoogleSignup] Oturum bilgisi okunamadı:', err);
    return null;
  }

  // Profil zaten varsa hiçbir işlem yapma
  const existing = await findExistingRole(userId);
  if (existing) return existing;

  const role: UserRole = preferredRole ?? metaRole ?? 'customer';
  const fallbackName = role === 'merchant' ? FALLBACK_MERCHANT_NAME : FALLBACK_CUSTOMER_NAME;

  let safeName = buildSafeFullName(metaName, '');
  if (!safeName) {
    const emailLocalPart = (email.split('@')[0] || '').replace(/[._\-0-9]+/g, ' ');
    safeName = buildSafeFullName(emailLocalPart, fallbackName);
  }

  // 1) RPC
  const viaRpc = await ensureViaRpc(role);
  if (viaRpc) {
    await syncUserMetadata(role, safeName);
    return viaRpc;
  }

  // 2) Doğrudan insert
  const viaInsert = await ensureViaDirectInsert(userId, email, safeName, role);
  if (viaInsert) {
    await syncUserMetadata(viaInsert, safeName);
    return viaInsert;
  }

  // 3) Edge Function yedeği
  const viaEdge = await ensureViaEdgeFunction(role);
  if (viaEdge) return viaEdge;

  // Son bir kez profil kontrolü (eşzamanlı istek oluşturmuş olabilir)
  return findExistingRole(userId);
}

/**
 * Panel yönlendirmesinin çalışması için rol bilgisini kullanıcı metadata'sına yazar.
 * Başarısız olursa akış etkilenmez.
 */
async function syncUserMetadata(role: UserRole, fullName: string): Promise<void> {
  try {
    await supabase.auth.updateUser({
      data: { role, full_name: fullName, auth_provider: 'google' },
    });
  } catch (err) {
    console.warn('[GoogleSignup] Metadata güncellenemedi:', err);
  }
}
