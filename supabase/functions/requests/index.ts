import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function getAuthUser(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
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

    const user = await getAuthUser(req, supabase);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Yetkilendirme gerekli' }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    let action = url.searchParams.get('action');

    // GET: List requests
    if (req.method === 'GET') {
      // Check if user is customer or merchant
      const { data: customer } = await supabase.from('customers').select('id').eq('user_id', user.id).single();
      const { data: merchant } = await supabase.from('merchants').select('id, store_id').eq('user_id', user.id).single();

      if (customer) {
        const { data: requests } = await supabase
          .from('requests')
          .select('*, merchants (store_name, store_id)')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(50);
        return new Response(JSON.stringify({ success: true, requests: requests || [], role: 'customer' }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (merchant) {
        const { data: requests } = await supabase
          .from('requests')
          .select('*, customers (full_name, phone)')
          .eq('merchant_id', merchant.id)
          .order('created_at', { ascending: false })
          .limit(100);
        return new Response(JSON.stringify({ success: true, requests: requests || [], role: 'merchant' }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: 'Kullanici bulunamadi' }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: Create or manage requests
    if (req.method === 'POST') {
      const body = await req.json();

      // Auto-detect action from body if not in URL
      if (!action) {
        if (body.store_id || body.merchant_id) {
          action = 'create';
        } else if (body.request_id && body.response) {
          action = 'respond';
        }
      }

      // Customer creates a request
      if (action === 'create') {
        const { store_id, amount, payment_type, latitude, longitude, merchant_id: directMerchantId } = body;

        if (!store_id && !directMerchantId) {
          return new Response(JSON.stringify({ error: 'Magaza kodu veya merchant_id gerekli' }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get customer
        const { data: customer } = await supabase.from('customers').select('id, is_suspended, suspended_until').eq('user_id', user.id).single();
        if (!customer) {
          return new Response(JSON.stringify({ error: 'Musteri bulunamadi' }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check suspension
        if (customer.is_suspended) {
          const suspendedUntil = customer.suspended_until ? new Date(customer.suspended_until) : null;
          if (suspendedUntil && suspendedUntil > new Date()) {
            return new Response(JSON.stringify({ error: 'Hesabiniz askiya alindi. Kalan sure: ' + Math.ceil((suspendedUntil.getTime() - Date.now()) / 3600000) + ' saat' }), {
              status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } else {
            // Suspension expired, unsuspend
            await supabase.from('customers').update({ is_suspended: false, suspended_until: null }).eq('id', customer.id);
          }
        }

        // Find merchant - either by direct merchant_id or by store_id
        let merchant: any = null;
        if (directMerchantId) {
          const { data } = await supabase.from('merchants').select('id, store_name, is_active').eq('id', directMerchantId).single();
          merchant = data;
        } else if (store_id) {
          const { data } = await supabase.from('merchants').select('id, store_name, is_active').eq('store_id', parseInt(store_id)).single();
          merchant = data;
        }

        if (!merchant) {
          return new Response(JSON.stringify({ error: 'Gecersiz magaza kodu' }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!merchant.is_active) {
          return new Response(JSON.stringify({ error: 'Bu magaza aktif degil' }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check 15 min cooldown for same store
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentRequests } = await supabase
          .from('requests')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('merchant_id', merchant.id)
          .gte('created_at', fifteenMinAgo)
          .in('status', ['pending', 'approved']);

        if (recentRequests && recentRequests.length > 0) {
          return new Response(JSON.stringify({ error: 'Ayni magazaya 15 dakika icinde tekrar talep gonderemezsiniz' }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check 3+ different stores in 5 min (anti-fraud)
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentAllRequests } = await supabase
          .from('requests')
          .select('merchant_id')
          .eq('customer_id', customer.id)
          .gte('created_at', fiveMinAgo);

        if (recentAllRequests) {
          const uniqueStores = new Set(recentAllRequests.map((r: any) => r.merchant_id));
          uniqueStores.add(merchant.id);
          if (uniqueStores.size >= 3) {
            // Auto-suspend for 24 hours
            const suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            await supabase.from('customers').update({ is_suspended: true, suspended_until: suspendedUntil }).eq('id', customer.id);

            // Log suspicious activity
            await supabase.from('suspicious_logs').insert({
              customer_id: customer.id,
              reason: '5 dakika icinde 3+ farkli magazaya talep',
              details: JSON.stringify({ stores: Array.from(uniqueStores), timestamp: new Date().toISOString() }),
            });

            return new Response(JSON.stringify({ error: 'Supheli aktivite tespit edildi. Hesabiniz 24 saat askiya alindi.' }), {
              status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Create the request
        const { data: newRequest, error: insertError } = await supabase.from('requests').insert({
          customer_id: customer.id,
          merchant_id: merchant.id,
          amount: parseFloat(amount) || 0,
          payment_type: payment_type || 'cash',
          status: 'pending',
          latitude: latitude || null,
          longitude: longitude || null,
        }).select().single();

        if (insertError) {
          console.error('Insert error:', insertError);
          return new Response(JSON.stringify({ error: 'Talep olusturulamadi: ' + insertError.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          request: newRequest,
          merchant_name: merchant.store_name,
        }), {
          status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Merchant approves/rejects a request
      if (action === 'respond') {
        const { request_id, response, points } = body;

        if (!request_id || !response || !['approved', 'rejected'].includes(response)) {
          return new Response(JSON.stringify({ error: 'Gecersiz istek' }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: merchant } = await supabase.from('merchants').select('id').eq('user_id', user.id).single();
        if (!merchant) {
          return new Response(JSON.stringify({ error: 'Esnaf bulunamadi' }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify request belongs to this merchant
        const { data: request } = await supabase.from('requests').select('*').eq('id', request_id).eq('merchant_id', merchant.id).eq('status', 'pending').single();
        if (!request) {
          return new Response(JSON.stringify({ error: 'Talep bulunamadi veya zaten islendi' }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update request status
        await supabase.from('requests').update({
          status: response,
          responded_at: new Date().toISOString(),
        }).eq('id', request_id);

        // If approved, create transaction and add points
        if (response === 'approved' && points && points > 0) {
          // Create transaction
          await supabase.from('transactions').insert({
            customer_id: request.customer_id,
            merchant_id: merchant.id,
            amount: request.amount,
            points: points,
            type: 'earn',
            payment_type: request.payment_type || 'cash',
            status: 'completed',
          });

          // Update customer points
          const { data: customerData } = await supabase.from('customers').select('points_balance, total_points_earned').eq('id', request.customer_id).single();
          if (customerData) {
            await supabase.from('customers').update({
              points_balance: (customerData.points_balance || 0) + points,
              total_points_earned: (customerData.total_points_earned || 0) + points,
            }).eq('id', request.customer_id);
          }

          // Update merchant revenue
          const { data: merchantData } = await supabase.from('merchants').select('total_revenue, total_transactions').eq('id', merchant.id).single();
          if (merchantData) {
            await supabase.from('merchants').update({
              total_revenue: (merchantData.total_revenue || 0) + request.amount,
              total_transactions: (merchantData.total_transactions || 0) + 1,
            }).eq('id', merchant.id);
          }
        }

        return new Response(JSON.stringify({ success: true, status: response }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Gecersiz istek' }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Requests error:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatasi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata') }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});