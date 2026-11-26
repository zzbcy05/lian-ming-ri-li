// GET /api/prefill?url=<活动链接>
// 服务端抓取公开页面，提取标题 / 简介 / 发布日期，供投稿表单预填。
// 只能读公开页面：需要登录才能看的站（微博 / 小红书 / 抖音）直接返回 login_required，不假装能读。
// 纯 Node，无第三方依赖。

const MAX_BYTES = 1500000;
const TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const LOGIN_WALLED = [/weibo\.com$/, /weibo\.cn$/, /xiaohongshu\.com$/, /xhslink\.com$/, /douyin\.com$/];

function isPrivateHost(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '[::1]' || h === '::1' || h === '0.0.0.0') return true;
  if (/^(127|10|192\.168)\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return false;
}

function decodeBody(buf, contentType) {
  let charset = 'utf-8';
  const m = /charset=([\w-]+)/i.exec(contentType || '');
  if (m) charset = m[1].toLowerCase();
  else {
    const head = buf.subarray(0, 4096).toString('latin1');
    const mm = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
    if (mm) charset = mm[1].toLowerCase();
  }
  if (charset === 'gb2312' || charset === 'gbk' || charset === 'gb18030') charset = 'gbk';
  try {
    return new TextDecoder(charset).decode(buf);
  } catch (e) {
    return new TextDecoder('utf-8').decode(buf);
  }
}

function metaContent(html, attr, value) {
  const re1 = new RegExp('<meta[^>]+' + attr + '=["\']' + value + '["\'][^>]*>', 'i');
  const tag = re1.exec(html);
  if (tag) {
    const c = /content=["']([^"']*)["']/i.exec(tag[0]);
    if (c) return c[1].trim();
  }
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*' + attr + '=["\']' + value + '["\'][^>]*>', 'i');
  const tag2 = re2.exec(html);
  return tag2 ? tag2[1].trim() : '';
}

function cleanTitle(raw, siteName) {
  let t = (raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // 去掉末尾的站点后缀，如 "xxx - 新浪财经" / "xxx | 微博"
  const m = /^(.*)[\s|｜\-—_]+([^\s|｜\-—_]{2,14})$/.exec(t);
  if (m && m[1].trim().length >= 8) t = m[1].trim();
  if (siteName && t.endsWith(siteName)) t = t.slice(0, -siteName.length).replace(/[\s|｜\-—_]+$/, '').trim();
  return t.slice(0, 60);
}

function cleanDesc(raw) {
  let d = (raw || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return d.slice(0, 200);
}

function pickDate(html) {
  const candidates = [];
  const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  ld.forEach((block) => {
    ['datePublished', 'dateCreated', 'uploadDate'].forEach((k) => {
      const m = new RegExp('"' + k + '"\\s*:\\s*"([^"]+)"').exec(block);
      if (m) candidates.push(m[1]);
    });
  });
  candidates.push(metaContent(html, 'property', 'article:published_time'));
  candidates.push(metaContent(html, 'name', 'pubdate'));
  candidates.push(metaContent(html, 'name', 'publishdate'));
  candidates.push(metaContent(html, 'itemprop', 'datePublished'));
  const timeTag = /<time[^>]+datetime=["']([^"']+)["']/i.exec(html);
  if (timeTag) candidates.push(timeTag[1]);
  for (const c of candidates) {
    if (!c) continue;
    const m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(c);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }
  }
  return '';
}

async function fetchLimited(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return { status: res.status, html: '' };
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch (e) {}
        break;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { status: res.status, html: decodeBody(buf, res.headers.get('content-type') || ''), truncated: total > MAX_BYTES };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method', message: '仅支持 GET。' });
    return;
  }
  const rawUrl = (req.query && req.query.url) || '';
  let u;
  try {
    u = new URL(rawUrl);
  } catch (e) {
    res.status(400).json({ ok: false, error: 'bad_url', message: '链接格式不对，请检查后重试。' });
    return;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    res.status(400).json({ ok: false, error: 'bad_url', message: '只支持 http / https 链接。' });
    return;
  }
  if (isPrivateHost(u.hostname)) {
    res.status(400).json({ ok: false, error: 'bad_url', message: '该链接无法识别，请手动填写。' });
    return;
  }
  const host = u.hostname.toLowerCase();
  if (LOGIN_WALLED.some((re) => re.test(host))) {
    res.json({ ok: false, error: 'login_required', message: '该页面需要登录才能查看，无法自动识别，请手动填写品牌、活动名和日期。' });
    return;
  }
  try {
    const { status, html } = await fetchLimited(u.toString());
    if (!html) {
      res.json({ ok: false, error: 'fetch_failed', message: '页面打不开（返回 ' + status + '），请手动填写品牌、活动名和日期。' });
      return;
    }
    const siteName = metaContent(html, 'property', 'og:site_name');
    let title = metaContent(html, 'property', 'og:title');
    if (!title) {
      const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      title = tm ? tm[1].replace(/<[^>]+>/g, '') : '';
    }
    title = cleanTitle(title, siteName);
    const description = cleanDesc(metaContent(html, 'property', 'og:description') || metaContent(html, 'name', 'description'));
    const date = pickDate(html);
    if (!title && !description && !date) {
      res.json({ ok: false, error: 'no_content', message: '页面里没找到能填的内容，请手动填写品牌、活动名和日期。' });
      return;
    }
    res.json({ ok: true, title, description, date, site_name: siteName || '', host });
  } catch (e) {
    res.json({ ok: false, error: 'failed', message: '识别失败（' + (e && e.name === 'AbortError' ? '页面打开超时' : '网络异常') + '），请手动填写品牌、活动名和日期。' });
  }
};

// 供本地测试：node -e "require('./api/prefill').__test = ..." 不需要；测试用独立脚本直接调 fetchLimited 逻辑。
module.exports._decodeBody = decodeBody;
module.exports._cleanTitle = cleanTitle;
module.exports._pickDate = pickDate;
