import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CompleteRequest {
  role: 'customer' | 'merchant';
  phone: string;
  full_name: string;
  store_name?: string;
  city?: string;
  district?: string;
  sector?: string;
  latitude?: number;
  longitude?: number;
  kvkk_approved?: boolean;
  terms_approved?: boolean;
}

/** Telefon numarasını "0XXXXXXXXXX" (11 hane) formatına normalize eder. */
function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0090')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('90') && digits.length > 11) {
    digits = digits.slice(2);
  }

  digits = digits.replace(/^0+/, '0');

  if (!digits.startsWith('0')) {
    digits = `0${digits}`;
  }

  return digits.slice(0, 11);
}

/** Telefon numarasının geçerliliği: başında 0, toplam 11 hane. */
function isValidPhone(value: string): boolean {
  return /^0[1-9][0-9]{9}$/.test(value);
}

/** Girdinin e-posta ya da e-posta benzeri olup olmadığını tespit eder. */
function looksLikeEmail(value: string): boolean {
  const text = (value || '').trim();
  if (!text) return false;
  if (text.includes('@')) return true;
  if (/\(\s*at\s*\)|\[\s*at\s*\]/i.test(text)) return true;
  if (/(gmail|hotmail|outlook|yahoo|icloud|yandex|mynet|proton|windowslive)/i.test(text)) return true;
  if (/\.(com|net|org|edu|gov|info|io|co|tr|de|nl)\b/i.test(text)) return true;
  return false;
}

/** Ad Soyad alanının geçerliliği: e-posta olamaz, rakam/geçersiz karakter içeremez. */
function isValidFullName(value: string): boolean {
  const text = (value || '').trim().replace(/\s+/g, ' ');
  if (!text) return false;
  if (looksLikeEmail(text)) return false;
  if (/\d/.test(text)) return false;
  if (!/^[A-Za-zÇĞİÖŞÜçğıöşü\s'’.-]+$/.test(text)) return false;
  if (text.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length < 3) return false;

  const parts = text
    .split(' ')
    .filter((part) => part.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length >= 2);
  return parts.length >= 2;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Google (OAuth) ile giriş yapan kullanıcı için müşteri veya esnaf profili oluşturur.
 *
 * Auth kullanıcısı Supabase tarafından zaten oluşturulmuştur; bu fonksiyon yalnızca
 * eksik iş verilerini (telefon, rol, dükkan bilgileri) doğrular ve ilgili tabloya yazar.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // Oturum doğrulaması — Google ile giriş yapmış gerçek kullanıcı zorunlu
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!accessToken) {
      return jsonResponse({ error: "Oturum bulunamadı. Lütfen Google ile tekrar giriş yapın." }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Oturum doğrulanamadı. Lütfen Google ile tekrar giriş yapın." }, 401);
    }

    const authUser = userData.user;
    const userId = authUser.id;
    const userEmail = (authUser.email || '').trim().toLowerCase();

    const body: CompleteRequest = await req.json();
    const {
      role,
      phone,
      full_name,
      store_name,
      city,
      district,
      sector,
      latitude,
      longitude,
      kvkk_approved,
      terms_approved,
    } = body;

    if (role !== 'customer' && role !== 'merchant') {
      return jsonResponse({ error: "Geçersiz rol" }, 400);
    }

    if (!kvkk_approved || !terms_approved) {
      return jsonResponse(
        { error: "KVKK Aydınlatma Metni ve Üyelik Koşulları onaylanmadan kayıt tamamlanamaz." },
        400,
      );
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || req.headers.get('cf-connecting-ip')
      || 'unknown';

    const trimmedFullName = (full_name || '').trim().replace(/\s+/g, ' ');
    if (!isValidFullName(trimmedFullName)) {
      return jsonResponse(
        { error: "Lütfen geçerli bir ad ve soyad giriniz. Ad Soyad alanına e-posta adresi yazılamaz." },
        400,
      );
    }

    const cleanedPhone = normalizePhone(phone);
    if (!isValidPhone(cleanedPhone)) {
      return jsonResponse(
        { error: "Telefon numarası, başında 0 olacak şekilde 11 haneli olmalıdır. Örn: 05074445588" },
        400,
      );
    }

    // Aynı kullanıcı için zaten profil varsa tekrar oluşturma
    const { data: existingCustomer } = await supabase
      .from('customers').select('id').eq('user_id', userId).maybeSingle();

    if (existingCustomer) {
      return jsonResponse({ success: true, role: 'customer', message: "Profil zaten mevcut" }, 200);
    }

    const { data: existingMerchant } = await supabase
      .from('merchants').select('id').eq('user_id', userId).maybeSingle();

    if (existingMerchant) {
      return jsonResponse({ success: true, role: 'merchant', message: "Profil zaten mevcut" }, 200);
    }

    // Telefon numarası başka bir hesapta kullanılıyor mu?
    const { data: phoneInCustomers } = await supabase
      .from('customers').select('id').eq('phone', cleanedPhone).maybeSingle();

    if (phoneInCustomers) {
      return jsonResponse({ error: "Bu telefon numarası zaten müşteri olarak kayıtlı" }, 400);
    }

    const { data: phoneInMerchants } = await supabase
      .from('merchants').select('id').eq('phone', cleanedPhone).maybeSingle();

    if (phoneInMerchants) {
      return jsonResponse({ error: "Bu telefon numarası zaten esnaf olarak kayıtlı" }, 400);
    }

    if (role === 'customer') {
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          phone: cleanedPhone,
          email: userEmail,
          full_name: trimmedFullName,
          device_id: null,
          points_balance: 0,
          is_active: true,
        });

      if (customerError) {
        console.error('Google customer insert error:', customerError);
        return jsonResponse({ error: "Müşteri kaydı oluşturulamadı: " + customerError.message }, 500);
      }
    } else {
      const trimmedStoreName = (store_name || '').trim();
      const trimmedCity = (city || '').trim();
      const trimmedDistrict = (district || '').trim();
      const trimmedSector = (sector || '').trim();

      if (!trimmedStoreName || !trimmedCity || !trimmedDistrict || !trimmedSector) {
        return jsonResponse(
          { error: "Dükkan adı, il, ilçe ve sektör alanları esnaf için zorunludur" },
          400,
        );
      }

      if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
        return jsonResponse({ error: "Konum bilgisi gerekli" }, 400);
      }

      const { error: merchantError } = await supabase
        .from('merchants')
        .insert({
          user_id: userId,
          phone: cleanedPhone,
          email: userEmail,
          full_name: trimmedFullName,
          store_name: trimmedStoreName,
          city: trimmedCity,
          district: trimmedDistrict,
          sector: trimmedSector,
          latitude,
          longitude,
          total_revenue: 0,
          total_points_distributed: 0,
          total_customers: 0,
          is_active: true,
          points_rate: 7,
        });

      if (merchantError) {
        console.error('Google merchant insert error:', merchantError);
        return jsonResponse({ error: "Esnaf kaydı oluşturulamadı: " + merchantError.message }, 500);
      }
    }

    // Auth kullanıcı metadata'sına rol/telefon/ad yazılır (panel yönlendirmesi için)
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(authUser.user_metadata || {}),
        role,
        phone: cleanedPhone,
        full_name: trimmedFullName,
        auth_provider: 'google',
      },
    });

    // Yasal onay kaydı
    await supabase.from('consent_logs').insert({
      user_id: userId,
      kvkk_approved_at: new Date().toISOString(),
      terms_approved_at: role === 'customer' ? new Date().toISOString() : null,
      esnaf_terms_approved_at: role === 'merchant' ? new Date().toISOString() : null,
      ip_address: clientIp,
      user_agent: req.headers.get('user-agent') || 'unknown',
      role,
    });

    console.log('Google profile completed:', userId, role);
    return jsonResponse({ success: true, role, message: "Kayıt tamamlandı" }, 200);
  } catch (error) {
    console.error('Google complete error:', error);
    return jsonResponse(
      { error: "Sunucu hatası: " + (error instanceof Error ? error.message : 'Bilinmeyen hata') },
      500,
    );
  }
});
