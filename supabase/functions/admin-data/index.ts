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
    .maybeSingle();

  if (adminData) {
    return { userId: user.id, admin: adminData };
  }

  // Yedek eslesme: admins kaydinda user_id bos birakilmis olabilir.
  // Bu durumda giris e-postasi uzerinden eslestirilir ve user_id doldurulur.
  if (user.email) {
    const { data: byEmail } = await supabase
      .from('admins')
      .select('*')
      .ilike('email', user.email)
      .maybeSingle();

    if (byEmail) {
      if (!byEmail.user_id) {
        await supabase.from('admins').update({ user_id: user.id }).eq('id', byEmail.id);
      }
      return { userId: user.id, admin: byEmail };
    }
  }

  return { userId: user.id, admin: null, error: 'Admin yetkisi yok' };
}

/**
 * Esnaf listesine gercek islem verilerinden hesaplanan ozetleri ekler.
 *
 * merchants tablosundaki total_revenue / total_points_distributed / total_customers
 * kolonlari guvenilir sekilde guncellenmedigi icin bu degerler her istekte
 * completed transactions uzerinden yeniden hesaplanir.
 */
async function attachMerchantStats(supabase: any, merchantList: any[]) {
  if (!merchantList || merchantList.length === 0) return merchantList || [];

  const { data: txs } = await supabase
    .from('transactions')
    .select('merchant_id, customer_id, amount, points, type')
    .eq('status', 'completed');

  const map = new Map<string, { revenue: number; points: number; spent: number; customers: Set<string> }>();

  for (const t of txs || []) {
    if (!t.merchant_id) continue;
    let entry = map.get(t.merchant_id);
    if (!entry) {
      entry = { revenue: 0, points: 0, spent: 0, customers: new Set<string>() };
      map.set(t.merchant_id, entry);
    }
    if (t.customer_id) entry.customers.add(t.customer_id);
    if (t.type === 'earn') {
      entry.revenue += Number(t.amount) || 0;
      entry.points += Number(t.points) || 0;
    } else if (t.type === 'spend') {
      entry.spent += Number(t.points) || 0;
    }
  }

  return merchantList.map((m: any) => {
    const entry = map.get(m.id);
    if (!entry) {
      return {
        ...m,
        total_revenue: Number(m.total_revenue) || 0,
        total_points_distributed: Number(m.total_points_distributed) || 0,
        total_customers: Number(m.total_customers) || 0,
        total_points_spent: 0,
      };
    }
    return {
      ...m,
      total_revenue: entry.revenue,
      total_points_distributed: entry.points,
      total_customers: entry.customers.size,
      total_points_spent: entry.spent,
    };
  });
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
        const merchantList = await attachMerchantStats(supabase, merchants || []);
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
        const merchantList = await attachMerchantStats(supabase, data || []);
        return new Response(JSON.stringify({ success: true, merchants: merchantList }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Tek bir esnafin islem gecmisi + gercek verilerden hesaplanan ozet.
      // Dogrudan tablo sorgusu RLS nedeniyle bos donebildigi icin burada
      // service_role ile okunur.
      if (action === 'merchant_detail') {
        const merchantId = url.searchParams.get('merchant_id');
        if (!merchantId) {
          return new Response(JSON.stringify({ error: 'merchant_id gerekli' }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: txs, error: txError } = await supabase
          .from('transactions')
          .select('id, type, amount, points, status, created_at, customer_id, customers(full_name, phone), merchants(store_name, store_id)')
          .eq('merchant_id', merchantId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(500);

        if (txError) throw txError;

        const list = txs || [];
        const uniqueCustomers = new Set<string>();
        let revenue = 0;
        let points = 0;
        let spent = 0;

        for (const t of list) {
          if (t.customer_id) uniqueCustomers.add(t.customer_id);
          if (t.type === 'earn') {
            revenue += Number(t.amount) || 0;
            points += Number(t.points) || 0;
          } else if (t.type === 'spend') {
            spent += Number(t.points) || 0;
          }
        }

        return new Response(JSON.stringify({
          success: true,
          transactions: list.slice(0, 50),
          stats: {
            revenue,
            points,
            spent,
            customers: uniqueCustomers.size,
            transactionCount: list.length,
          },
        }), {
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

      // Esnafin gercek giris (auth) e-postasini getir
      if (postAction === 'get_merchant_credentials') {
        const { user_id } = body;
        if (!user_id) {
          return new Response(JSON.stringify({ error: 'user_id gerekli' }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabase.auth.admin.getUserById(user_id);
        if (error || !data?.user) {
          return new Response(JSON.stringify({ error: 'Kullanici bulunamadi' }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          email: data.user.email || '',
          phone: data.user.phone || '',
          email_confirmed: !!data.user.email_confirmed_at,
          last_sign_in_at: data.user.last_sign_in_at || null,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Esnafin giris e-postasini ve/veya sifresini guncelle (service_role ile hashlenir)
      if (postAction === 'update_merchant_credentials') {
        const { merchant_id, user_id, email, password } = body;

        if (!user_id) {
          return new Response(JSON.stringify({ error: 'user_id gerekli' }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const newEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        const newPassword = typeof password === 'string' ? password.trim() : '';

        if (!newEmail && !newPassword) {
          return new Response(JSON.stringify({ error: 'Guncellenecek bilgi girilmedi' }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updatePayload: Record<string, unknown> = {};

        if (newEmail) {
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
          if (!emailPattern.test(newEmail)) {
            return new Response(JSON.stringify({ error: 'Gecersiz e-posta adresi' }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          updatePayload.email = newEmail;
          updatePayload.email_confirm = true;
        }

        if (newPassword) {
          if (newPassword.length < 6) {
            return new Response(JSON.stringify({ error: 'Sifre en az 6 karakter olmalidir' }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          updatePayload.password = newPassword;
        }

        const { error: authUpdateError } = await supabase.auth.admin.updateUserById(user_id, updatePayload);
        if (authUpdateError) {
          const rawMsg = authUpdateError.message || '';
          const friendly = rawMsg.toLowerCase().includes('already')
            ? 'Bu e-posta adresi baska bir kullanici tarafindan kullaniliyor'
            : 'Giris bilgileri guncellenemedi: ' + rawMsg;
          return new Response(JSON.stringify({ error: friendly }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Uygulama tablolarindaki e-posta kaydini da senkronize et
        if (newEmail) {
          if (merchant_id) {
            await supabase.from('merchants')
              .update({ email: newEmail, updated_at: new Date().toISOString() })
              .eq('id', merchant_id);
          }
          await supabase.from('profiles').update({ email: newEmail }).eq('user_id', user_id);
        }

        // Islem kaydi (tablo yoksa sessizce gecilir)
        await supabase.from('admin_action_logs').insert({
          admin_id: admin?.id ?? null,
          admin_email: admin?.email ?? null,
          target_user_id: user_id,
          action: newPassword && newEmail ? 'merchant_email_password_update'
            : newPassword ? 'merchant_password_reset' : 'merchant_email_update',
          created_at: new Date().toISOString(),
        });

        return new Response(JSON.stringify({
          success: true,
          email_updated: !!newEmail,
          password_updated: !!newPassword,
        }), {
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