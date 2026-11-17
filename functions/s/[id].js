// EdgeOne Pages Edge Function —— 短链分享页（动态 Open Graph 卡片）
// 路由: /s/:id
//
// 作用: 有人（或微信/QQ 抓取器）打开 /s/xxxx 时，
//       从 KV 取出寄件人/收件人，把名字写进 og:title，
//       再返回真正的前端页面，于是分享出去就是一张带标题的卡片。

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setMeta(html, prop, content) {
  const safe = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    '<meta\\s+property="' + safe + '"\\s+content="[^"]*"\\s*/?>'
  );
  const tag = '<meta property="' + prop + '" content="' + esc(content) + '">';
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', tag + '\n</head>');
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

export async function onRequest(context) {
  const request = context.request;
  const env = context.env || {};
  const params = context.params || {};
  const url = new URL(request.url);
  const origin = url.origin;
  const id = params.id;

  if (!id || !/^[a-z0-9]{4,24}$/.test(id)) {
    return Response.redirect(origin + '/', 302);
  }

  let sender = '';
  let receiver = '';
  const kv = resolveKV(env);
  if (kv) {
    try {
      const rawMeta = await kv.get('meta:' + id);
      if (rawMeta) {
        const m = JSON.parse(rawMeta);
        sender = (m && m.s) || '';
        receiver = (m && m.r) || '';
      }
    } catch (e) {}
  }

  // 取出真实的前端页面（/index.html 不匹配本路由，会走静态资源）
  let html = '';
  try {
    const res = await fetch(origin + '/index.html', {
      headers: { 'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0' }
    });
    html = await res.text();
  } catch (e) {
    return new Response('页面加载失败，请稍后重试', {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  const title = sender ? (sender + ' 给你写了一封信 💌') : '给你写了一封信 💌';
  const desc = receiver
    ? ('致 ' + receiver + '：有人想对你说点什么，点开看看吧～')
    : '有人给你写了一封信，点开看看吧～';
  const img = origin + '/og-cover.png';

  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
  html = setMeta(html, 'og:title', title);
  html = setMeta(html, 'og:description', desc);
  html = setMeta(html, 'og:image', img);
  html = setMeta(html, 'og:url', origin + '/s/' + id);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
}
