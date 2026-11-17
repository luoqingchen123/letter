// EdgeOne Pages Edge Function —— 信件短链存取
// POST /api/letter  { d: "压缩后的信件数据" }  ->  { id: "a3k9x2m" }
// GET  /api/letter?id=a3k9x2m                 ->  { d: "压缩后的信件数据" }
//
// KV 绑定说明：在 EdgeOne 控制台把 KV 命名空间绑定到本项目，
// 变量名填 letter_kv（也兼容 LETTER_KV）。

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 去掉易混淆的 l/o/0/1

function genId(len) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return s;
}

function resolveKV(env) {
  if (env) {
    if (env.letter_kv) return env.letter_kv;
    if (env.LETTER_KV) return env.LETTER_KV;
  }
  try {
    if (typeof letter_kv !== 'undefined' && letter_kv) return letter_kv;
  } catch (e) {}
  return null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function reply(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      CORS
    )
  });
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const kv = resolveKV(env);
  if (!kv) {
    return reply({
      error: 'KV_NOT_BOUND',
      hint: '请在 EdgeOne 控制台创建 KV 命名空间，并绑定到本项目，变量名填 letter_kv'
    }, 503);
  }

  const url = new URL(request.url);

  // 读信
  if (request.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return reply({ error: 'MISSING_ID' }, 400);
    if (!/^[a-z0-9]{4,24}$/.test(id)) return reply({ error: 'BAD_ID' }, 400);
    let data = null;
    try {
      data = await kv.get('letter:' + id);
    } catch (e) {
      return reply({ error: 'KV_READ_FAILED' }, 500);
    }
    if (!data) return reply({ error: 'NOT_FOUND' }, 404);
    return reply({ d: data }, 200);
  }

  // 存信
  if (request.method === 'POST') {
    let body = null;
    try {
      body = await request.json();
    } catch (e) {
      return reply({ error: 'BAD_JSON' }, 400);
    }
    const d = body && body.d;
    if (!d || typeof d !== 'string') return reply({ error: 'MISSING_DATA' }, 400);
    if (d.length > 20000) return reply({ error: 'TOO_LONG' }, 413);

    let id = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      id = genId(7);
      const exists = await kv.get('letter:' + id);
      if (!exists) break;
    }

    try {
      await kv.put('letter:' + id, d);
      // 顺带存一份寄件人/收件人，供分享卡片标题使用（避免解压整封信）
      const meta = {
        s: (body && typeof body.s === 'string') ? body.s.slice(0, 40) : '',
        r: (body && typeof body.r === 'string') ? body.r.slice(0, 40) : ''
      };
      if (meta.s || meta.r) {
        await kv.put('meta:' + id, JSON.stringify(meta));
      }
    } catch (e) {
      return reply({ error: 'KV_WRITE_FAILED' }, 500);
    }
    return reply({ id: id }, 200);
  }

  return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
}
