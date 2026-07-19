import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_DISTANCE_METERS = 50;
const IDEMPOTENCY_EXPIRY_SECONDS = 60;

interface TransactionRequest {
  idempotency_key: string;
  merchant_id: string;
  amount: number;
  type: 'earn' | 'spend';
  customer_latitude?: number;
  customer_longitude?: number;
}

interface CancelRequest {
  transaction_id: string;
  reason?: string;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function verifyToken(req: Request, supabase: any): Promise<{ userId: string; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: '', error: 'Yetkilendirme gerekli' };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { userId: '', error: 'Gecersiz token' };
  }

  return { userId: user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
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

    const tokenResult = await verifyToken(req, supabase);
    if (tokenResult.error) {
      return new Response(JSON.stringify({ error: tokenResult.error }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = tokenResult.userId;

    const { data: customerData } = await supabase
      .from('customers')
      .select('id, points_balance')
      .eq('user_id', userId)
      .single();

    const isCustomer = !!customerData;

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method === 'POST' && action === 'cancel') {
      const body: CancelRequest = await req.json();
      const { transaction_id, reason } = body;

      if (!transaction_id) {
        return new Response(JSON.stringify({ error: 'Islem ID gerekli' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transaction_id)
        .eq('status', 'completed')
        .single();

      if (txError || !transaction) {
        return new Response(JSON.stringify({ error: 'Islem bulunamadi veya zaten iptal edilmis' }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isCustomer && transaction.customer_id !== customerData.id) {
        return new Response(JSON.stringify({ error: 'Bu islemi iptal etme yetkiniz yok' }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.rpc('begin_transaction');

      try {
        if (transaction.type === 'earn') {
          const newBalance = customerData.points_balance - transaction.points;
          if (newBalance < 0) {
            throw new Error('Yetersiz puan bakiyesi - iptal edilemez');
          }
          await supabase
            .from('customers')
            .update({ points_balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', transaction.customer_id);
        } else if (transaction.type === 'spend') {
          await supabase
            .from('customers')
            .update({
              points_balance: customerData.points_balance + transaction.points,
              updated_at: new Date().toISOString()
            })
            .eq('id', transaction.customer_id);
        }

        await supabase
          .from('transactions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: reason || 'Esnaf tarafindan iptal edildi'
          })
          .eq('id', transaction_id);

        await supabase.rpc('commit_transaction');

        return new Response(JSON.stringify({
          success: true,
          message: 'Islem iptal edildi',
          points_returned: transaction.type === 'spend' ? transaction.points : 0,
          points_deducted: transaction.type === 'earn' ? transaction.points : 0
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (cancelError) {
        await supabase.rpc('rollback_transaction');
        throw cancelError;
      }
    }

    if (req.method === 'GET') {
      if (isCustomer) {
        const { data: transactions } = await supabase
          .from('transactions')
          .select(`
            *,
            merchants (store_name, store_id)
          `)
          .eq('customer_id', customerData.id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(50);

        return new Response(JSON.stringify({
          transactions,
          points_balance: customerData.points_balance
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const { data: merchantData } = await supabase
          .from('merchants')
          .select('id, store_name, store_id, total_revenue, total_points_distributed, total_customers')
          .eq('user_id', userId)
          .single();

        if (!merchantData) {
          return new Response(JSON.stringify({ error: 'Esnaf bulunamadi' }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: transactions } = await supabase
          .from('transactions')
          .select(`
            *,
            customers (full_name, phone)
          `)
          .eq('merchant_id', merchantData.id)
          .order('created_at', { ascending: false })
          .limit(100);

        return new Response(JSON.stringify({
          transactions,
          merchant: merchantData
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (req.method === 'POST') {
      const body: TransactionRequest = await req.json();
      const { idempotency_key, merchant_id, amount, type, customer_latitude, customer_longitude } = body;

      if (!idempotency_key || !merchant_id || !amount || !type) {
        return new Response(JSON.stringify({ error: 'Eksik bilgi' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (amount <= 0) {
        return new Response(JSON.stringify({ error: 'Gecersiz tutar' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isCustomer) {
        return new Response(JSON.stringify({ error: 'Sadece musteriler islem yapabilir' }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingKey } = await supabase
        .from('idempotency_keys')
        .select('id, transaction_id')
        .eq('key', idempotency_key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (existingKey) {
        return new Response(JSON.stringify({ error: 'Bu islem zaten isleniyor veya islendi' }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id, store_name, store_id, latitude, longitude, is_active')
        .eq('id', merchant_id)
        .single();

      if (merchantError || !merchant || !merchant.is_active) {
        return new Response(JSON.stringify({ error: 'Gecersiz esnaf' }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let distanceVerified = false;
      if (customer_latitude !== undefined && customer_longitude !== undefined) {
        const distance = calculateDistance(
          customer_latitude,
          customer_longitude,
          merchant.latitude,
          merchant.longitude
        );

        if (distance > MAX_DISTANCE_METERS) {
          return new Response(JSON.stringify({
            error: 'Dukkanda degilsiniz tespit edildi',
            distance: Math.round(distance),
            max_allowed: MAX_DISTANCE_METERS
          }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        distanceVerified = true;
      }

      const points = Math.floor(amount * 0.07);

      if (type === 'spend') {
        if (customerData.points_balance < points) {
          return new Response(JSON.stringify({
            error: 'Yetersiz puan bakiyesi',
            current_balance: customerData.points_balance,
            required_points: points
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      await supabase.rpc('begin_transaction');

      try {
        const { data: transaction, error: txError } = await supabase
          .from('transactions')
          .insert({
            idempotency_key,
            customer_id: customerData.id,
            merchant_id: merchant.id,
            type,
            amount,
            points,
            customer_latitude,
            customer_longitude,
            distance_verified: distanceVerified,
            status: 'completed',
          })
          .select()
          .single();

        if (txError) throw txError;

        await supabase.from('idempotency_keys').insert({
          key: idempotency_key,
          transaction_id: transaction.id,
          expires_at: new Date(Date.now() + IDEMPOTENCY_EXPIRY_SECONDS * 1000).toISOString(),
        });

        const pointsDelta = type === 'earn' ? points : -points;
        const newBalance = customerData.points_balance + pointsDelta;

        await supabase
          .from('customers')
          .update({ points_balance: newBalance, updated_at: new Date().toISOString() })
          .eq('id', customerData.id);

        const pointsForStats = type === 'earn' ? points : 0;
        const { data: existingCustomer } = await supabase
          .from('transactions')
          .select('id')
          .eq('customer_id', customerData.id)
          .eq('merchant_id', merchant.id)
          .limit(1)
          .maybeSingle();

        await supabase
          .from('merchants')
          .update({
            total_revenue: merchant.total_revenue + amount,
            total_points_distributed: merchant.total_points_distributed + pointsForStats,
            total_customers: existingCustomer ? merchant.total_customers : merchant.total_customers + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', merchant.id);

        await supabase.rpc('commit_transaction');

        return new Response(JSON.stringify({
          success: true,
          transaction,
          new_balance: newBalance,
          points_earned: type === 'earn' ? points : 0,
          points_spent: type === 'spend' ? points : 0,
          store_name: merchant.store_name
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (txError) {
        await supabase.rpc('rollback_transaction');
        throw txError;
      }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Transaction error:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatasi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata') }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
