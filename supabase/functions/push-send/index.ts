import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// VAPID keys - production'da bunlar Supabase secrets olarak saklanmalı
const VAPID_PUBLIC_KEY = 'BIxuUF2hX4othdNdGzQ1tq5UMUuaIDE7lIiLUtELBqkR0qVipkEPlL8YM442ilG-TsSgCwJeCTvvFoFUauMHApE';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || 'saPlvNSJIiWOZLwUTPJ9bvKbH_SSV0ocbit756RKUpY';
const VAPID_SUBJECT = 'mailto:info@onkati.com';

/**
 * Web Push protokolü ile bildirim gönder
 * RFC 8291 (Message Encryption) + RFC 8292 (VAPID)
 */
async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    // JWT oluştur (VAPID)
    const vapidToken = await createVapidJwt(subscription.endpoint);
    
    // Payload'ı şifrele
    const encrypted = await encryptPayload(subscription.keys, payload);
    
    // Push isteği gönder
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': encrypted.body.byteLength.toString(),
        'TTL': '86400',
        'Urgency': 'high',
        'Topic': 'campaign',
        'Authorization': `vapid t=${vapidToken}, k=${VAPID_PUBLIC_KEY}`,
      },
      body: encrypted.body,
    });

    if (response.status === 201 || response.status === 200) {
      return { success: true, status: response.status };
    } else if (response.status === 410) {
      // Gone - subscription artık geçersiz
      return { success: false, status: 410, error: 'Subscription expired' };
    } else {
      const text = await response.text();
      return { success: false, status: response.status, error: text };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * VAPID JWT token oluştur
 */
async function createVapidJwt(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const expiration = Math.floor(Date.now() / 1000) + (12 * 60 * 60); // 12 saat

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: expiration,
    sub: VAPID_SUBJECT,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // VAPID private key'i import et
  const privateKeyRaw = base64urlDecode(VAPID_PRIVATE_KEY);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    buildPkcs8FromRaw(privateKeyRaw),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // İmzala
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // DER signature'ı raw'a çevir (r || s, her biri 32 byte)
  const rawSig = derToRaw(new Uint8Array(signature));
  const signatureB64 = base64urlEncodeBuffer(rawSig);

  return `${unsignedToken}.${signatureB64}`;
}

/**
 * Push payload'ını RFC 8291'e göre şifrele (aes128gcm)
 */
async function encryptPayload(
  keys: { p256dh: string; auth: string },
  payloadText: string
): Promise<{ body: ArrayBuffer }> {
  const payload = new TextEncoder().encode(payloadText);
  
  // Client public key ve auth secret
  const clientPublicKeyRaw = base64urlDecode(keys.p256dh);
  const authSecret = base64urlDecode(keys.auth);

  // Sunucu tarafı ephemeral key pair oluştur
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', serverKeys.publicKey);

  // Client public key'i import et
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    serverKeys.privateKey,
    256
  );

  // IKM (Input Keying Material) - HKDF ile auth secret kullanarak
  const ikmInfo = concatBuffers(
    new TextEncoder().encode('WebPush: info\0'),
    new Uint8Array(clientPublicKeyRaw),
    new Uint8Array(serverPublicKeyRaw)
  );
  
  const ikm = await hkdfDerive(
    new Uint8Array(authSecret),
    new Uint8Array(sharedSecret),
    ikmInfo,
    32
  );

  // Salt oluştur (16 byte random)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Content Encryption Key (CEK)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdfDerive(salt, new Uint8Array(ikm), cekInfo, 16);

  // Nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await hkdfDerive(salt, new Uint8Array(ikm), nonceInfo, 12);

  // Padding: 1 byte delimiter (0x02) + payload
  const paddedPayload = new Uint8Array(payload.length + 1);
  paddedPayload.set(payload);
  paddedPayload[payload.length] = 2; // padding delimiter

  // AES-128-GCM ile şifrele
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(cek),
    'AES-GCM',
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonce), tagLength: 128 },
    key,
    paddedPayload
  );

  // aes128gcm header: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const rs = 4096;
  const serverPubKeyBytes = new Uint8Array(serverPublicKeyRaw);
  
  const header = new Uint8Array(16 + 4 + 1 + serverPubKeyBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = serverPubKeyBytes.length;
  header.set(serverPubKeyBytes, 21);

  const body = concatBuffers(header, new Uint8Array(encrypted));

  return { body: body.buffer };
}

/**
 * HKDF-SHA256 key derivation
 */
async function hkdfDerive(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
}

// ---- Utility functions ----

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncodeBuffer(buffer: Uint8Array): string {
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(buf, offset);
    offset += buf.length;
  }
  return result;
}

/**
 * Raw 32-byte private key'i PKCS8 formatına çevir (P-256)
 */
function buildPkcs8FromRaw(rawKey: Uint8Array): ArrayBuffer {
  // PKCS8 wrapper for EC P-256 private key
  const pkcs8Header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20
  ]);
  const result = new Uint8Array(pkcs8Header.length + rawKey.length);
  result.set(pkcs8Header, 0);
  result.set(rawKey, pkcs8Header.length);
  return result.buffer;
}

/**
 * DER encoded ECDSA signature'ı raw (r || s) formatına çevir
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // DER: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
  const raw = new Uint8Array(64);
  
  let offset = 2; // skip 0x30 and total length
  
  // R value
  offset++; // skip 0x02
  const rLen = der[offset++];
  const rStart = offset;
  offset += rLen;
  
  // S value
  offset++; // skip 0x02
  const sLen = der[offset++];
  const sStart = offset;
  
  // Copy R (pad or trim to 32 bytes)
  if (rLen <= 32) {
    raw.set(der.slice(rStart, rStart + rLen), 32 - rLen);
  } else {
    raw.set(der.slice(rStart + rLen - 32, rStart + rLen), 0);
  }
  
  // Copy S (pad or trim to 32 bytes)
  if (sLen <= 32) {
    raw.set(der.slice(sStart, sStart + sLen), 64 - sLen);
  } else {
    raw.set(der.slice(sStart + sLen - 32, sStart + sLen), 32);
  }
  
  return raw;
}

// ---- Main Handler ----

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Auth doğrula
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Kullanıcı doğrulama
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Esnaf olduğunu doğrula
    const { data: merchant } = await supabase
      .from('merchants')
      .select('id, store_name')
      .eq('user_id', user.id)
      .single();

    if (!merchant) {
      return new Response(JSON.stringify({ error: 'Esnaf bulunamadı' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { campaign_id, title, message } = body;

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id gerekli' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Kampanya doğrula
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, title, description, merchant_id')
      .eq('id', campaign_id)
      .eq('merchant_id', merchant.id)
      .single();

    if (!campaign) {
      return new Response(JSON.stringify({ error: 'Kampanya bulunamadı' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hedef müşterilerin push aboneliklerini al
    // campaign_notifications tablosundaki müşterilerin aktif abonelikleri
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, subscription_json, customer_id')
      .eq('is_active', true);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        failed: 0,
        message: 'Aktif push aboneliği bulunamadı',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Push payload
    const pushPayload = JSON.stringify({
      title: title || `🎉 ${merchant.store_name} - Yeni Kampanya!`,
      body: message || campaign.title || campaign.description,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: `campaign-${campaign_id}`,
      url: '/dashboard',
      campaign_id: campaign_id,
      timestamp: Date.now(),
    });

    // Her aboneliğe push gönder
    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const subData = typeof sub.subscription_json === 'string'
        ? JSON.parse(sub.subscription_json)
        : sub.subscription_json;

      if (!subData?.endpoint || !subData?.keys?.p256dh || !subData?.keys?.auth) {
        failed++;
        continue;
      }

      const result = await sendWebPush(
        { endpoint: subData.endpoint, keys: subData.keys },
        pushPayload
      );

      if (result.success) {
        sent++;
      } else {
        failed++;
        if (result.status === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
        console.error(`Push failed for ${sub.endpoint}: ${result.error}`);
      }
    }

    // Expired subscription'ları deaktive et
    if (expiredEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .in('endpoint', expiredEndpoints);
    }

    return new Response(JSON.stringify({
      success: true,
      sent,
      failed,
      expired: expiredEndpoints.length,
      total: subscriptions.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Push send error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});