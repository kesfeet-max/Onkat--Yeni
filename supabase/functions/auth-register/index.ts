import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/**
 * Esnaf kaydı (telefon + şifre). E-posta istenmez; giriş için kullanıcıya
 * gösterilmeyen dahili bir auth adresi üretilir.
 *
 * Müşteri kaydı bu fonksiyonla YAPILMAZ — müşteriler `customer-phone-auth`
 * ile yalnızca ad soyad ve telefonla, şifresiz giriş/kayıt olur.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface MerchantRegisterRequest {
  phone: string;
  password: string;
  full_name: string;
  store_name?: string;
  city?: string;
  district?: string;
  sector?: string;
  latitude?: number;
  longitude?: number;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0090')) digits = digits.slice(4);
  else if (digits.startsWith('90') && digits.length > 11) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return `0${digits}`.slice(0, 11);
}

function isValidPhone(value: string): boolean {
  return /^0[1-9][0-9]{9}$/.test(value);
}

function isValidFullName(value: string): boolean {
  const text = (value || '').trim().replace(/\s+/g, ' ');
  if (!text || text.includes('@') || /\d/.test(text)) return false;
  if (!/^[A-Za-zÇĞİÖŞÜçğıöşü\s'’.-]+$/.test(text)) return false;
  const parts = text.split(' ').filter((p) => p.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length >= 2);
  return parts.length >= 2;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const body: MerchantRegisterRequest = await req.json();
    const fullName = (body.full_name || '').trim().replace(/\s+/g, ' ');
    const phone = normalizePhone(body.phone || '');
    const password = body.password || '';
    const storeName = (body.store_name || '').trim();
    const city = (body.city || '').trim();
    const district = (body.district || '').trim();
    const sector = (body.sector || '').trim();

    if (!isValidFullName(fullName)) {
      return json({ error: "Lütfen geçerli bir ad ve soyad giriniz." }, 400);
    }
    if (!isValidPhone(phone)) {
      return json({ error: "Telefon numarası, başında 0 olacak şekilde 11 haneli olmalıdır. Örn: 05074445588" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "Şifre en az 6 karakter olmalıdır" }, 400);
    }
    if (!storeName || !city || !district || !sector) {
      return json({ error: "Dükkan adı, il, ilçe ve sektör alanları zorunludur" }, 400);
    }
    if (body.latitude === undefined || body.longitude === undefined) {
      return json({ error: "Konum bilgisi gerekli" }, 400);
    }

    const { data: existingMerchant } = await supabase
      .from('merchants').select('id').eq('phone', phone).maybeSingle();
    if (existingMerchant) {
      return json({ error: "Bu telefon numarası zaten esnaf olarak kayıtlı" }, 400);
    }

    // Dahili giriş adresi — kullanıcıya hiçbir zaman gösterilmez
    const internalEmail = `esnaf-${phone}@onkati.local`;

    const { data: userResponse, error: authError } = await supabase.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { phone, role: 'merchant', full_name: fullName },
    });

    if (authError || !userResponse.user) {
      console.error('Auth error:', authError);
      const message = authError?.message || '';
      if (message.includes('already')) {
        return json({ error: "Bu telefon numarası ile zaten bir esnaf hesabı açılmış" }, 400);
      }
      return json({ error: "Kayıt başarısız. Lütfen tekrar deneyin." }, 400);
    }

    const userId = userResponse.user.id;

    const { error: merchantError } = await supabase.from('merchants').insert({
      user_id: userId,
      phone,
      full_name: fullName,
      store_name: storeName,
      city,
      district,
      sector,
      latitude: body.latitude,
      longitude: body.longitude,
      total_revenue: 0,
      total_points_distributed: 0,
      total_customers: 0,
      is_active: true,
      points_rate: 7,
    });

    if (merchantError) {
      console.error('Merchant insert error:', merchantError);
      await supabase.auth.admin.deleteUser(userId);
      return json({ error: "Esnaf kaydı oluşturulamadı: " + merchantError.message }, 500);
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    await supabase.from('consent_logs').insert({
      user_id: userId,
      kvkk_approved_at: new Date().toISOString(),
      esnaf_terms_approved_at: new Date().toISOString(),
      ip_address: clientIp,
      user_agent: req.headers.get('user-agent') || 'unknown',
      role: 'merchant',
    });

    return json({ success: true, message: "Kayıt başarılı", user_id: userId });
  } catch (error) {
    console.error('Registration error:', error);
    return json({ error: "Sunucu hatası: " + (error instanceof Error ? error.message : 'Bilinmeyen hata') }, 500);
  }
});
