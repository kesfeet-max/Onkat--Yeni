import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

/**
 * Müşteri için şifresiz, SMS'siz, e-postasız giriş / kayıt.
 *
 * - Telefon numarası kayıtlıysa müşteri tanınır ve oturum açılır.
 * - Kayıtlı değilse yalnızca Ad Soyad ile saniyesinde hesap oluşturulur.
 *
 * İstemciye yalnızca oturum token'ları döner; kullanıcıya hiçbir zaman
 * şifre, kod veya e-posta sorulmaz.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Telefonu "0XXXXXXXXXX" (11 hane) biçimine getirir. */
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

/** Ad Soyad: en az iki kelime, rakam/e-posta içeremez. */
function isValidFullName(value: string): boolean {
  const text = (value || '').trim().replace(/\s+/g, ' ');
  if (!text || text.includes('@') || /\d/.test(text)) return false;
  if (!/^[A-Za-zÇĞİÖŞÜçğıöşü\s'’.-]+$/.test(text)) return false;
  const parts = text.split(' ').filter((p) => p.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length >= 2);
  return parts.length >= 2;
}

function randomSecret(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
}

/** Müşteri için dahili (kullanıcıya gösterilmeyen) auth hesabı oluşturur. */
async function createCustomerAuthUser(
  admin: SupabaseClient,
  phone: string,
  fullName: string,
): Promise<string> {
  const internalEmail = `musteri-${phone}-${crypto.randomUUID().slice(0, 8)}@onkati.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email: internalEmail,
    password: randomSecret(),
    email_confirm: true,
    user_metadata: { phone, role: 'customer', full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(error?.message || 'Kullanıcı oluşturulamadı');
  }
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
    const admin = createClient(supabaseUrl, serviceKey, authOptions);
    const publicClient = createClient(supabaseUrl, anonKey, authOptions);

    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(String(body?.phone || ''));
    const fullName = String(body?.full_name || '').trim().replace(/\s+/g, ' ');

    if (!isValidPhone(phone)) {
      return json({ success: false, error: 'Telefon numarası başında 0 olacak şekilde 11 haneli olmalıdır. Örn: 05074445588' }, 400);
    }

    // 1) Numara kayıtlı mı?
    const { data: existing, error: lookupError } = await admin
      .from('customers')
      .select('id, user_id, full_name, is_active')
      .eq('phone', phone)
      .maybeSingle();

    if (lookupError) {
      console.error('Customer lookup error:', lookupError);
      return json({ success: false, error: 'Şu anda giriş yapılamıyor. Lütfen tekrar deneyin.' }, 500);
    }

    let userId: string | null = existing?.user_id ?? null;
    let customerName = existing?.full_name ?? fullName;
    let isNew = false;

    if (existing) {
      if (existing.is_active === false) {
        return json({ success: false, error: 'Hesabınız askıya alınmıştır. Lütfen işletme ile iletişime geçin.' }, 403);
      }
    } else {
      // 2) Kayıtlı değil → yalnızca Ad Soyad ile anında kayıt
      if (!isValidFullName(fullName)) {
        return json({ success: false, error: 'Lütfen geçerli bir ad ve soyad giriniz.' }, 400);
      }

      userId = await createCustomerAuthUser(admin, phone, fullName);

      const { error: insertError } = await admin.from('customers').insert({
        user_id: userId,
        phone,
        full_name: fullName,
        points_balance: 0,
        is_active: true,
      });

      if (insertError) {
        await admin.auth.admin.deleteUser(userId);

        // Aynı anda kayıt olunduysa (tekil telefon çakışması) mevcut kaydı kullan
        const { data: raced } = await admin
          .from('customers')
          .select('id, user_id, full_name')
          .eq('phone', phone)
          .maybeSingle();

        if (!raced) {
          console.error('Customer insert error:', insertError);
          return json({ success: false, error: 'Hesap oluşturulamadı. Lütfen tekrar deneyin.' }, 500);
        }
        userId = raced.user_id;
        customerName = raced.full_name;
      } else {
        isNew = true;
        customerName = fullName;
      }
    }

    // 3) Auth hesabı yoksa (eski kayıt) oluştur ve bağla
    let authEmail: string | null = null;
    if (userId) {
      const { data: authData } = await admin.auth.admin.getUserById(userId);
      authEmail = authData?.user?.email ?? null;
    }

    if (!userId || !authEmail) {
      userId = await createCustomerAuthUser(admin, phone, customerName);
      const { error: linkError } = await admin.from('customers').update({ user_id: userId }).eq('phone', phone);
      if (linkError) {
        await admin.auth.admin.deleteUser(userId);
        console.error('Customer link error:', linkError);
        return json({ success: false, error: 'Hesap bağlanamadı. Lütfen tekrar deneyin.' }, 500);
      }
      const { data: authData } = await admin.auth.admin.getUserById(userId);
      authEmail = authData?.user?.email ?? null;
    }

    // 4) Tek kullanımlık dahili parola ile oturum aç (kullanıcı hiç görmez)
    const oneTimeSecret = randomSecret();
    const { error: updateError } = await admin.auth.admin.updateUserById(userId!, {
      password: oneTimeSecret,
      email_confirm: true,
    });
    if (updateError || !authEmail) {
      console.error('Auth update error:', updateError);
      return json({ success: false, error: 'Giriş yapılamadı. Lütfen tekrar deneyin.' }, 500);
    }

    const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({
      email: authEmail,
      password: oneTimeSecret,
    });

    if (signInError || !signInData.session) {
      console.error('Sign-in error:', signInError);
      return json({ success: false, error: 'Giriş yapılamadı. Lütfen tekrar deneyin.' }, 500);
    }

    return json({
      success: true,
      is_new: isNew,
      full_name: customerName,
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('customer-phone-auth error:', error);
    return json({ success: false, error: 'Sunucu hatası. Lütfen tekrar deneyin.' }, 500);
  }
});
