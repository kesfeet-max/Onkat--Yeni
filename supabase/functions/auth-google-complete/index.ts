import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncRequest {
  /** Kullanıcının geldiği ekranda seçtiği rol. Belirtilmezse 'customer' kabul edilir. */
  role?: 'customer' | 'merchant';
}

/** Ad Soyad alanı için veritabanı tetikleyicisinin kabul ettiği karakter kümesi. */
const NAME_ALLOWED = /[^A-Za-zÇĞİÖŞÜçğıöşü\s'’.-]/g;

/** Profil oluşturulamazsa kullanılan güvenli varsayılan isim. */
const FALLBACK_CUSTOMER_NAME = 'Onkatı Üyesi';
const FALLBACK_MERCHANT_NAME = 'Onkatı Esnafı';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Google'dan gelen ismi veritabanı kurallarına uygun hâle getirir.
 *
 * Rakamlar, "@" ve diğer geçersiz karakterler temizlenir. Sonuç kuralları
 * karşılamıyorsa güvenli bir varsayılan isim döner; böylece kullanıcıdan
 * hiçbir zaman ek bilgi istenmez.
 */
function buildSafeFullName(rawName: string, fallback: string): string {
  const cleaned = (rawName || '')
    .replace(NAME_ALLOWED, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

  const letterCount = cleaned.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length;
  if (letterCount < 3) return fallback;

  // "gmail", ".com" gibi e-posta çağrışımı yapan ifadeler tetikleyici tarafından reddedilir
  if (/(gmail|hotmail|outlook|yahoo|icloud|yandex|mynet|proton|windowslive)/i.test(cleaned)) {
    return fallback;
  }
  if (/\.(com|net|org|edu|gov|info|io|co|tr|de|nl)\b/i.test(cleaned)) {
    return fallback;
  }

  return cleaned;
}

/**
 * Telefon alanı zorunlu ve tekil olduğu için Google kullanıcısına geçici,
 * gerçek bir numarayla çakışmayan bir yer tutucu üretilir.
 *
 * Türkiye'de kullanımda olmayan `09` ön eki seçilir; böylece yer tutucu
 * numaralar gerçek numaralardan kolayca ayrılabilir ve kullanıcı isterse
 * panelinden gerçek numarasını kaydedebilir.
 */
function generatePlaceholderPhone(): string {
  let digits = '';
  for (let i = 0; i < 9; i += 1) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return `09${digits}`;
}

/**
 * Google (OAuth) ile giriş yapan kullanıcı için müşteri veya esnaf profilini
 * SESSİZCE oluşturur.
 *
 * Kullanıcıdan hiçbir ek bilgi, telefon numarası, KVKK veya sözleşme onayı
 * istenmez. Eksik zorunlu alanlar güvenli varsayılanlarla doldurulur ve
 * kullanıcı doğrudan paneline yönlendirilebilir.
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

    // Oturum doğrulaması — yalnızca gerçekten giriş yapmış kullanıcı için profil açılır
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!accessToken) {
      return jsonResponse({ error: "Oturum bulunamadı." }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Oturum doğrulanamadı." }, 401);
    }

    const authUser = userData.user;
    const userId = authUser.id;
    const userEmail = (authUser.email || '').trim().toLowerCase();
    const metadata = (authUser.user_metadata || {}) as Record<string, unknown>;

    let body: SyncRequest = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Rol sırası: istek gövdesi -> mevcut metadata -> varsayılan müşteri
    const metaRole = metadata.role === 'merchant' || metadata.role === 'customer'
      ? (metadata.role as 'merchant' | 'customer')
      : undefined;
    const role: 'customer' | 'merchant' = body.role === 'merchant' || body.role === 'customer'
      ? body.role
      : metaRole ?? 'customer';

    // Profil zaten varsa hiçbir şey yapmadan başarıyla dön
    const { data: existingCustomer } = await supabase
      .from('customers').select('id').eq('user_id', userId).maybeSingle();

    if (existingCustomer) {
      return jsonResponse({ success: true, role: 'customer', created: false }, 200);
    }

    const { data: existingMerchant } = await supabase
      .from('merchants').select('id').eq('user_id', userId).maybeSingle();

    if (existingMerchant) {
      return jsonResponse({ success: true, role: 'merchant', created: false }, 200);
    }

    const googleName = (metadata.full_name || metadata.name || '') as string;
    const emailLocalPart = userEmail.split('@')[0] || '';

    const fallbackName = role === 'merchant' ? FALLBACK_MERCHANT_NAME : FALLBACK_CUSTOMER_NAME;
    let safeName = buildSafeFullName(googleName, '');
    if (!safeName) {
      // Google adı kullanılamıyorsa e-posta kullanıcı adından türetmeyi dene
      safeName = buildSafeFullName(emailLocalPart.replace(/[._-]+/g, ' '), fallbackName);
    }

    // Zorunlu ve tekil telefon alanı için yer tutucu üret; çakışırsa yeniden dene
    let insertError: { message: string } | null = null;
    let usedPhone = '';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidatePhone = generatePlaceholderPhone();

      if (role === 'customer') {
        const { error } = await supabase
          .from('customers')
          .insert({
            user_id: userId,
            phone: candidatePhone,
            email: userEmail,
            full_name: safeName,
            device_id: null,
            points_balance: 0,
            is_active: true,
          });
        insertError = error ? { message: error.message } : null;
      } else {
        const { error } = await supabase
          .from('merchants')
          .insert({
            user_id: userId,
            phone: candidatePhone,
            email: userEmail,
            full_name: safeName,
            // Esnaf zorunlu alanları varsayılanla doldurulur; panelden düzenlenebilir
            store_name: safeName,
            city: 'Belirtilmedi',
            district: 'Belirtilmedi',
            sector: 'diger',
            latitude: 0,
            longitude: 0,
            total_revenue: 0,
            total_points_distributed: 0,
            total_customers: 0,
            is_active: true,
            points_rate: 7,
          });
        insertError = error ? { message: error.message } : null;
      }

      if (!insertError) {
        usedPhone = candidatePhone;
        break;
      }

      // Tekil telefon çakışması dışındaki hatalarda tekrar denemenin anlamı yok
      const isDuplicatePhone = /duplicate key|unique constraint/i.test(insertError.message)
        && /phone/i.test(insertError.message);
      if (!isDuplicatePhone) break;
    }

    if (insertError) {
      // Aynı anda gelen ikinci bir istek profili çoktan oluşturmuş olabilir
      const table = role === 'customer' ? 'customers' : 'merchants';
      const { data: recheck } = await supabase
        .from(table).select('id').eq('user_id', userId).maybeSingle();

      if (recheck) {
        return jsonResponse({ success: true, role, created: false }, 200);
      }

      console.error('Google silent profile insert error:', insertError.message);
      return jsonResponse({ error: "Hesap oluşturulamadı: " + insertError.message }, 500);
    }

    // Panel yönlendirmesi için rol ve temel bilgiler metadata'ya yazılır
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...metadata,
        role,
        phone: usedPhone,
        phone_placeholder: true,
        full_name: safeName,
        auth_provider: 'google',
      },
    });

    // Bilgilendirme amaçlı zımni onay kaydı — kullanıcıya hiçbir onay ekranı gösterilmez
    try {
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';

      await supabase.from('consent_logs').insert({
        user_id: userId,
        kvkk_approved_at: new Date().toISOString(),
        terms_approved_at: role === 'customer' ? new Date().toISOString() : null,
        esnaf_terms_approved_at: role === 'merchant' ? new Date().toISOString() : null,
        ip_address: clientIp,
        user_agent: req.headers.get('user-agent') || 'unknown',
        role,
      });
    } catch (logError) {
      console.warn('consent_logs kaydı atlandı:', logError);
    }

    console.log('Google silent profile created:', userId, role);
    return jsonResponse({ success: true, role, created: true }, 200);
  } catch (error) {
    console.error('Google sync error:', error);
    return jsonResponse(
      { error: "Sunucu hatası: " + (error instanceof Error ? error.message : 'Bilinmeyen hata') },
      500,
    );
  }
});
