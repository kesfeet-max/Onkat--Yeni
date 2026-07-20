import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyAdmin(req: Request, supabase: any): Promise<{ userId: string; admin: any; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: '', admin: null, error: 'Yetkilendirme gerekli' };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: '', admin: null, error: 'Gecersiz token' };
  }

  const { data: adminData } = await supabase
    .from('admins')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!adminData) {
    return { userId: user.id, admin: null, error: 'Admin yetkisi yok' };
  }

  return { userId: user.id, admin: adminData };
}

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

    const { admin, error: authError } = await verifyAdmin(req, supabase);
    if (authError) {
      return new Response(JSON.stringify({ error: authError }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'overview';

    if (req.method === 'GET') {
      if (action === 'overview') {
        const { data: customers } = await supabase.from('customers').select('id, full_name, phone, points_balance, is_active, is_suspended, created_at');
        const { data: merchants } = await supabase.from('merchants').select('*').order('created_at', { ascending: false });
        const { data: transactions } = await supabase.from('transactions').select('id, amount, points, type, status, created_at').eq('status', 'completed').eq('type', 'earn');

        const customerList = customers || [];
        const merchantList = merchants || [];
        const txList = transactions || [];

        const totalRevenue = txList.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
        const totalPoints = txList.reduce((sum: number, t: any) => sum + (t.points || 0), 0);

        return new Response(JSON.stringify({
          success: true,
          stats: {
            totalCustomers: customerList.length,
            totalMerchants: merchantList.length,
            totalTransactions: txList.length,
            totalRevenue,
            totalPoints,
          },
          merchants: merchantList.slice(0, 5),
          customers: customerList,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === 'customers') {
        const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
        return new Response(JSON.stringify({ success: true, customers: data || [] }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === 'merchants') {
        const { data } = await supabase.from('merchants').select('*').order('created_at', { ascending: false });
        return new Response(JSON.stringify({ success: true, merchants: data || [] }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === 'transactions') {
        const { data } = await supabase.from('transactions').select(`*, customers (full_name, phone), merchants (store_name, store_id)`).order('created_at', { ascending: false }).limit(200);
        return new Response(JSON.stringify({ success: true, transactions: data || [] }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === 'suspicious') {
        const { data: logs } = await supabase.from('suspicious_logs').select('*').order('created_at', { ascending: false }).limit(100);
        const { data: suspended } = await supabase.from('customers').select('*').eq('is_suspended', true);
        return new Response(JSON.stringify({ success: true, suspiciousLogs: logs || [], suspendedCustomers: suspended || [] }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const postAction = body.action;

      if (postAction === 'toggle_status') {
        const { table, id, current_status } = body;
        if (!['customers', 'merchants'].includes(table)) {
          return new Response(JSON.stringify({ error: 'Gecersiz tablo' }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await supabase.from(table).update({ is_active: !current_status, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (postAction === 'unsuspend') {
        const { id } = body;
        const { error } = await supabase.from('customers').update({ is_suspended: false, suspended_until: null }).eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (postAction === 'update_merchant') {
        const { id, total_revenue, cash_points_rate, card_points_rate } = body;
        const { error } = await supabase.from('merchants').update({
          total_revenue,
          points_rate: cash_points_rate,
          cash_points_rate,
          card_points_rate,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Gecersiz istek' }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Admin data error:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatasi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata') }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});