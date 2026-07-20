import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const url = new URL(req.url);
    const storeIdParam = url.searchParams.get('store_id');

    if (!storeIdParam || !storeIdParam.trim()) {
      return new Response(JSON.stringify({ error: 'store_id parametresi gerekli' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanCode = storeIdParam.trim();

    // UUID format check
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode);
    const parsedInt = parseInt(cleanCode);
    const isNumeric = !isNaN(parsedInt) && String(parsedInt) === cleanCode;

    let merchant = null;

    // Strategy 1: Direct .eq query on store_id (handles both integer and text)
    {
      const { data } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, is_active, points_rate, cash_points_rate, card_points_rate')
        .eq('store_id', isNumeric ? parsedInt : cleanCode)
        .maybeSingle();
      if (data) merchant = data;
    }

    // Strategy 2: If numeric didn't match, try as text (store_id might be stored as text)
    if (!merchant && isNumeric) {
      const { data } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, is_active, points_rate, cash_points_rate, card_points_rate')
        .eq('store_id', cleanCode) // as string
        .maybeSingle();
      if (data) merchant = data;
    }

    // Strategy 3: If UUID, also check the id column
    if (!merchant && isUUID) {
      const { data } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, is_active, points_rate, cash_points_rate, card_points_rate')
        .eq('id', cleanCode)
        .maybeSingle();
      if (data) merchant = data;
    }

    // Strategy 4: Cast-based search - if store_id is integer but user sent text or vice versa
    if (!merchant && !isUUID) {
      const { data } = await supabase
        .from('merchants')
        .select('id, store_id, store_name, is_active, points_rate, cash_points_rate, card_points_rate')
        .filter('store_id::text', 'eq', cleanCode)
        .maybeSingle();
      if (data) merchant = data;
    }

    if (!merchant) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Magaza bulunamadi',
        searched_code: cleanCode,
        search_type: isUUID ? 'uuid' : isNumeric ? 'numeric' : 'text',
      }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      merchant: {
        id: merchant.id,
        store_id: merchant.store_id,
        store_name: merchant.store_name,
        is_active: merchant.is_active,
        points_rate: merchant.points_rate,
        cash_points_rate: merchant.cash_points_rate,
        card_points_rate: merchant.card_points_rate,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('merchant-get error:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatasi' }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});