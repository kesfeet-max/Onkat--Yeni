import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RegisterRequest {
  role: 'customer' | 'merchant';
  phone: string;
  email: string;
  password: string;
  full_name: string;
  store_name?: string;
  city?: string;
  district?: string;
  sector?: string;
  latitude?: number;
  longitude?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

    const body: RegisterRequest = await req.json();
    console.log('Received registration request:', JSON.stringify(body, null, 2));

    const { role, phone, email, password, full_name, store_name, city, district, sector, latitude, longitude } = body;

    // Validate required fields - check for empty/whitespace strings
    const trimmedFullName = (full_name || '').trim();
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPhone = (phone || '').trim();
    const trimmedPassword = password || '';

    const missingFields: string[] = [];
    if (!role) missingFields.push('Rol');
    if (!trimmedFullName) missingFields.push('Ad Soyad');
    if (!trimmedPhone) missingFields.push('Telefon');
    if (!trimmedEmail) missingFields.push('E-posta');
    if (!trimmedPassword) missingFields.push('Şifre');

    if (missingFields.length > 0) {
      console.log('Missing fields:', missingFields.join(', '));
      return new Response(JSON.stringify({ error: `Şu alanlar zorunludur: ${missingFields.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate phone - remove non-digits
    const cleanedPhone = trimmedPhone.replace(/\D/g, '');
    if (cleanedPhone.length < 10 || cleanedPhone.length > 11) {
      return new Response(JSON.stringify({ error: "Geçersiz telefon numarası. 10 veya 11 haneli olmalı." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return new Response(JSON.stringify({ error: "Geçersiz e-posta adresi formatı" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate password length
    if (trimmedPassword.length < 6) {
      return new Response(JSON.stringify({ error: "Şifre en az 6 karakter olmalıdır" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing records BEFORE creating auth user
    if (role === 'customer') {
      const { data: existingPhone } = await supabase
        .from('customers').select('id').eq('phone', cleanedPhone).maybeSingle();

      if (existingPhone) {
        return new Response(JSON.stringify({ error: "Bu telefon numarası zaten müşteri olarak kayıtlı" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingEmail } = await supabase
        .from('customers').select('id').eq('email', trimmedEmail).maybeSingle();

      if (existingEmail) {
        return new Response(JSON.stringify({ error: "Bu e-posta adresi zaten kayıtlı" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (role === 'merchant') {
      const trimmedStoreName = (store_name || '').trim();
      const trimmedCity = (city || '').trim();
      const trimmedDistrict = (district || '').trim();
      const trimmedSector = (sector || '').trim();

      if (!trimmedStoreName || !trimmedCity || !trimmedDistrict || !trimmedSector) {
        return new Response(JSON.stringify({ error: "Dükkan adı, il, ilçe ve sektör alanları esnaf için zorunludur" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (latitude === undefined || longitude === undefined) {
        return new Response(JSON.stringify({ error: "Konum bilgisi gerekli" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingMerchantPhone } = await supabase
        .from('merchants').select('id').eq('phone', cleanedPhone).maybeSingle();

      if (existingMerchantPhone) {
        return new Response(JSON.stringify({ error: "Bu telefon numarası zaten esnaf olarak kayıtlı" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingMerchantEmail } = await supabase
        .from('merchants').select('id').eq('email', trimmedEmail).maybeSingle();

      if (existingMerchantEmail) {
        return new Response(JSON.stringify({ error: "Bu e-posta adresi zaten esnaf olarak kayıtlı" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check if auth user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === trimmedEmail);

    if (existingUser) {
      return new Response(JSON.stringify({ error: "Bu e-posta adresi zaten kayıtlı" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user with real email
    const { data: userResponse, error: authError } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: trimmedPassword,
      email_confirm: true,
      user_metadata: {
        phone: cleanedPhone,
        role: role,
        full_name: trimmedFullName,
      },
    });

    if (authError || !userResponse.user) {
      console.error('Auth error:', authError);
      const errorMsg = authError?.message || 'Kullanıcı oluşturulamadı';
      if (errorMsg.includes('already registered') || errorMsg.includes('already been registered')) {
        return new Response(JSON.stringify({ error: "Bu e-posta adresi zaten kayıtlı" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Kayıt başarısız: " + errorMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userResponse.user.id;

    if (role === 'customer') {
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          phone: cleanedPhone,
          email: trimmedEmail,
          full_name: trimmedFullName,
          device_id: null,
          points_balance: 0,
          is_active: true,
        });

      if (customerError) {
        console.error('Customer insert error:', customerError);
        await supabase.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: "Müşteri kaydı oluşturulamadı: " + customerError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log('Customer created successfully:', userId);
      return new Response(JSON.stringify({ success: true, message: "Kayıt başarılı", user_id: userId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role === 'merchant') {
      const { error: merchantError } = await supabase
        .from('merchants')
        .insert({
          user_id: userId,
          phone: cleanedPhone,
          email: trimmedEmail,
          full_name: trimmedFullName,
          store_name: store_name!.trim(),
          city: city!.trim(),
          district: district!.trim(),
          sector: sector!.trim(),
          latitude: latitude!,
          longitude: longitude!,
          total_revenue: 0,
          total_points_distributed: 0,
          total_customers: 0,
          is_active: true,
          points_rate: 7,
        });

      if (merchantError) {
        console.error('Merchant insert error:', merchantError);
        await supabase.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: "Esnaf kaydı oluşturulamadı: " + merchantError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log('Merchant created successfully:', userId);
      return new Response(JSON.stringify({ success: true, message: "Kayıt başarılı", user_id: userId }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Geçersiz rol" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Registration error:', error);
    return new Response(JSON.stringify({ error: "Sunucu hatası: " + (error instanceof Error ? error.message : 'Bilinmeyen hata') }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
