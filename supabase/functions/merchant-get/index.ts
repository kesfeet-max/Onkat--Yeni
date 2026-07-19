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

    console.log('[merchant-get] SUPABASE_URL:', supabaseUrl);
    console.log('[merchant-get] SERVICE_KEY exists:', !!supabaseServiceKey);
    console.log('[merchant-get] SERVICE_KEY length:', supabaseServiceKey?.length);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const url = new URL(req.url);
    const storeId = url.searchParams.get('store_id');
    const id = url.searchParams.get('id');
    const debug = url.searchParams.get('debug');

    console.log('[merchant-get] Params - store_id:', storeId, 'id:', id, 'debug:', debug);

    // Debug mode: list all merchants in the table
    if (debug === 'true') {
      const { data: allMerchants, error: listError } = await supabase
        .from('merchants')
        .select('*')
        .limit(20);

      console.log('[merchant-get] DEBUG - All merchants:', JSON.stringify(allMerchants));
      console.log('[merchant-get] DEBUG - List error:', JSON.stringify(listError));

      return new Response(JSON.stringify({
        debug: true,
        merchants_count: allMerchants?.length || 0,
        merchants: allMerchants || [],
        list_error: listError,
        supabase_url: supabaseUrl,
        service_key_length: supabaseServiceKey?.length || 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!storeId && !id) {
      return new Response(JSON.stringify({ error: 'store_id veya id gerekli' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let merchant = null;
    let queryError = null;

    if (storeId) {
      // Search by store_id column only
      console.log('[merchant-get] Searching by store_id:', storeId);
      
      // Try exact match as text
      const { data: result, error: err } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, city, district, sector, latitude, longitude, is_active, points_rate, cash_points_rate, card_points_rate')
        .eq('store_id', storeId)
        .maybeSingle();

      console.log('[merchant-get] store_id text search - result:', JSON.stringify(result), 'error:', JSON.stringify(err));

      if (result) {
        merchant = result;
      } else if (!err) {
        // Try as integer if text didn't match
        const parsedId = parseInt(storeId);
        if (!isNaN(parsedId)) {
          console.log('[merchant-get] Trying store_id as integer:', parsedId);
          const { data: intResult, error: intErr } = await supabase
            .from('merchants')
            .select('id, store_id, store_name, city, district, sector, latitude, longitude, is_active, points_rate, cash_points_rate, card_points_rate')
            .eq('store_id', parsedId)
            .maybeSingle();

          console.log('[merchant-get] store_id int search - result:', JSON.stringify(intResult), 'error:', JSON.stringify(intErr));
          merchant = intResult;
          queryError = intErr;
        }
      } else {
        queryError = err;
      }

      // Last resort: try filter with ::text cast via ilike
      if (!merchant && !queryError) {
        console.log('[merchant-get] Trying ilike fallback for store_id:', storeId);
        const { data: ilikeResult, error: ilikeErr } = await supabase
          .from('merchants')
          .select('id, store_id, store_name, city, district, sector, latitude, longitude, is_active, points_rate, cash_points_rate, card_points_rate')
          .filter('store_id::text', 'eq', storeId)
          .maybeSingle();

        console.log('[merchant-get] filter cast search - result:', JSON.stringify(ilikeResult), 'error:', JSON.stringify(ilikeErr));
        
        if (ilikeResult) {
          merchant = ilikeResult;
        } else {
          queryError = ilikeErr;
        }
      }
    } else if (id) {
      // Search by UUID id column
      console.log('[merchant-get] Searching by id:', id);
      const { data: result, error: err } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, city, district, sector, latitude, longitude, is_active, points_rate, cash_points_rate, card_points_rate')
        .eq('id', id)
        .maybeSingle();

      console.log('[merchant-get] id search - result:', JSON.stringify(result), 'error:', JSON.stringify(err));
      merchant = result;
      queryError = err;
    }

    if (queryError || !merchant) {
      console.log('[merchant-get] NOT FOUND. queryError:', JSON.stringify(queryError));
      return new Response(JSON.stringify({ 
        error: 'Esnaf bulunamadi',
        debug_info: {
          searched_store_id: storeId || null,
          searched_id: id || null,
          db_error: queryError?.message || null,
          db_error_details: queryError?.details || null,
          db_error_hint: queryError?.hint || null,
        }
      }), {
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

    console.log('[merchant-get] SUCCESS - Found merchant:', merchant.store_name, 'store_id:', merchant.store_id);

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
        longitude: merchant.longitude,
        points_rate: merchant.points_rate || 7,
        cash_points_rate: merchant.cash_points_rate || merchant.points_rate || 7,
        card_points_rate: merchant.card_points_rate || merchant.points_rate || 7,
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error('[merchant-get] EXCEPTION:', err);
    return new Response(JSON.stringify({ error: 'Sunucu hatasi', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});