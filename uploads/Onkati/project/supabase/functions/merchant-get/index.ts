import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const url = new URL(req.url);
    const storeId = url.searchParams.get('store_id');
    const merchantId = url.searchParams.get('merchant_id');

    if (!storeId && !merchantId) {
      return new Response(JSON.stringify({ error: 'store_id veya merchant_id gerekli' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase
      .from('merchants')
      .select('id, store_id, store_name, city, district, sector, latitude, longitude, is_active');

    if (storeId) {
      query = query.eq('store_id', parseInt(storeId));
    } else if (merchantId) {
      query = query.eq('id', merchantId);
    }

    const { data: merchant, error } = await query.single();

    if (error || !merchant) {
      return new Response(JSON.stringify({ error: 'Esnaf bulunamadi' }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!merchant.is_active) {
      return new Response(JSON.stringify({ error: 'Bu dukkan aktif degil' }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      merchant: {
        id: merchant.id,
        store_id: merchant.store_id,
        store_name: merchant.store_name,
        city: merchant.city,
        district: merchant.district,
        sector: merchant.sector,
        latitude: merchant.latitude,
        longitude: merchant.longitude
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Merchant get error:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatasi' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
