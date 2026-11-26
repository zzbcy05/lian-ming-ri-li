#!/usr/bin/env node
/**
* 活动日历 · 每日自动搜集新活动（全免费路线）
*
* 每天由 GitHub Actions 定时运行一次（见.github/workflows/daily-collect.yml），
* 流程分三步：
* 1) 搜：调 Tavily 搜索 API（免费额度），搜最近一周的品牌联名、优惠与新品发售新闻；
* 2) 理：调 Google Gemini API 免费版，把搜索结果整理成结构化活动；
* 3) 写：严格校验 + 去重后，写入 Supabase events 表（service_role key 走 REST）。
*
* 全免费说明（2026-11-19 核实，额度以官方页面为准）：
* - Tavily 免费版每月 1000 credits，不用绑卡；basic 搜索 1 credit/次。
* 本脚本每天 10 条查询，每月约 300 次，远在额度内。用完当月停搜，下月 1 号重置。
* https://tavily.com
* - Gemini API 免费版不用绑卡；本脚本每天只调 1 次，远在免费额度内。
* 具体限额 Google 不再公布固定数字，以 AI Studio 里显示的为准。
* https://aistudio.google.com
* - GitHub Actions 公开仓库免费不限分钟；Supabase / Vercel 免费版。
*
* 需要的环境变量（生产运行放 GitHub Secrets，绝不写进代码）：
* TAVILY_API_KEY Tavily 搜索 API 密钥
* GEMINI_API_KEY Google Gemini API 密钥（默认模型）
* SUPABASE_URL Supabase 项目 URL
* SUPABASE_SERVICE_ROLE_KEY Supabase service_role key（只给服务端脚本用）
* 可选（想用 OpenAI 兼容接口时才需要，默认不启用）：
* LLM_PROVIDER=openai-compatible、LLM_API_KEY、LLM_BASE_URL、LLM_MODEL
*
* 用法：
* node scripts/collect.mjs 正常跑一次（会写库）
* node scripts/collect.mjs --dry-run 只打印将要写入的内容，不写库
* node scripts/collect.mjs --mock --dry-run 用内置模拟数据跑通全流程，不调任何 API
* node scripts/collect.mjs --help 查看帮助
*
* 注意：--mock 会强制进入 dry-run，模拟数据永远不会写进真实日历。
*/
'use strict';

// ================= 配置区（想改搜集范围、查询词、模型，只改这里） =================
const CONFIG = {
// 搜索查询词：每天跑一次，每条查询消耗 1 个 Tavily credit。
// 10 条查询 × 30 天 ≈ 300 credits/月，Tavily 免费额度每月 1000 credits，仍在额度内。
QUERIES: [
'奶茶 联名 新品 活动',
'咖啡 联名 限定 活动',
'奶茶 买一送一 优惠',
'喜茶 瑞幸 霸王茶姬 奈雪 新联名',
'肯德基 麦当劳 买一送一 优惠',
'零食饮料 联名 限定 新品',
'泡泡玛特 潮玩 联名 新品',
'美妆 联名 限定 系列',
'服饰 鞋包 联名 发售',
'数码 家电 双11 优惠',
],
DAYS_BACK: 7, // 只搜最近一周内的新闻（Tavily time_range=week）
SEARCH_RESULTS_PER_QUERY: 8, // 每条查询取几条结果

// 模型：默认 Gemini 免费版。'gemini-3.5-flash-lite' 是当前免费额度的新项目推荐模型
// （gemini-2.5-flash 已对新用户停用，2026 年 12 月 1 日下线）。
// 模型名变化很快，如果某天报 404，请去 AI Studio 看当前可用的免费模型 ID，改这里即可。
LLM_PROVIDER: 'gemini', // 'gemini' | 'openai-compatible'
GEMINI_MODEL: 'gemini-3.5-flash-lite',
GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',

// 可选：OpenAI 兼容接口（需自行提供 key；默认不启用，仅作备选）
OPENAI_BASE_URL: '', // 如 'https://api.openai.com/v1'
OPENAI_MODEL: '', // 如 'gpt-4o-mini'

// 写入 Supabase 前的限制
MAX_EVENTS_PER_RUN: 20, // 一次最多写入几条，避免某天异常刷屏
};

// 品类白名单：模型输出不在此列的一律归为「综合」
const CATEGORIES = ['奶茶', '咖啡', '综合', '餐饮快餐', '零食饮料', '潮玩文创', '美妆个护', '服饰鞋包', '数码家电', '零售便利', '游戏文娱', '生活日用', '其他'];

// ================= 模拟数据（仅 --mock 测试用，明显是假的，绝不会写库） =================
const MOCK_SEARCH_RESULTS = [
{
title: '测试品牌 × 测试联名上线：限定茶饮与周边同步发售',
url: 'https://example.com/mock-news-1',
content: '测试品牌今日宣布与测试联名合作，11 月 19 日起在全国门店推出两款联名茶饮，售价 22 元起，联名杯套随机附赠。',
published_date: '2026-11-19',
},
{
title: '测试咖啡买一送一：本周末限定两天',
url: 'https://example.com/mock-news-2',
content: '测试咖啡宣布本周六、周日全场第二杯半价，会员可再领一张买一送一券，活动 11 月 22 日结束。',
published_date: '2026-11-18',
},
];

const MOCK_LLM_EVENTS = [
{
title: '测试品牌 × 测试联名',
brand: '测试品牌',
partner: '测试联名',
type: 'collab',
category: '奶茶',
start_date: '2026-11-19',
end_date: null,
description: '两款联名茶饮 11 月 19 日起全国发售，联名杯套随机附赠。',
price_note: '联名茶饮 ¥22 起',
source_url: 'https://example.com/mock-news-1',
order_name: '测试品牌点单',
},
{
title: '测试咖啡买一送一',
brand: '测试咖啡',
partner: null,
type: 'promo',
category: '咖啡',
start_date: '2026-11-21',
end_date: '2026-11-22',
description: '周末全场第二杯半价，会员再领买一送一券。',
price_note: '第二杯半价',
source_url: 'https://example.com/mock-news-2',
order_name: null,
},
];

// ================= 工具函数 =================
function log(msg) {
console.log(`[${new Date().toISOString()}] ${msg}`);
}

function parseArgs(argv) {
const args = { dryRun: false, mock: false, help: false};
for (const a of argv) {
if (a === '--dry-run') args.dryRun = true;
else if (a === '--mock') args.mock = true;
else if (a === '--help' || a === '-h') args.help = true;
else {
console.error(`未知参数：${a}（可用：--dry-run、--mock、--help）`);
process.exit(2);
}
}
if (args.mock) args.dryRun = true; // 模拟数据永远不写库
return args;
}

function printHelp() {
console.log(`
活动日历 · 每日自动搜集

用法：
node scripts/collect.mjs 正常跑一次（会写库）
node scripts/collect.mjs --dry-run 只打印将要写入的内容，不写库
node scripts/collect.mjs --mock --dry-run 用内置模拟数据跑通全流程，不调任何 API

环境变量：TAVILY_API_KEY、GEMINI_API_KEY、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
（生产运行请放 GitHub Secrets；本地测试请用 --mock --dry-run，不要把真实 key 写进任何文件）
`);
}

function normalizeUrl(u) {
return String(u || '').trim().replace(/\/+$/, '');
}

function isValidDate(s) {
if (typeof s!== 'string' ||!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
const d = new Date(s + 'T00:00:00Z');
return!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function todayStr() {
const d = new Date();
const y = d.getFullYear();
const m = String(d.getMonth() + 1).padStart(2, '0');
const day = String(d.getDate()).padStart(2, '0');
return `${y}-${m}-${day}`;
}

async function fetchJson(url, options, timeoutMs = 30000) {
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
const res = await fetch(url, {...options, signal: controller.signal});
const text = await res.text();
let data = null;
try { data = text? JSON.parse(text): null;} catch { /* 非 JSON 响应 */}
if (!res.ok) {
const detail = (data && (data.error?.message || data.message)) || text.slice(0, 300);
throw new Error(`HTTP ${res.status}：${detail}`);
}
return data;
} finally {
clearTimeout(timer);
}
}

// ================= 第 1 步：Tavily 搜索 =================
async function tavilySearch(apiKey, query) {
const data = await fetchJson('https://api.tavily.com/search', {
method: 'POST',
headers: { 'Content-Type': 'application/json'},
body: JSON.stringify({
api_key: apiKey,
query,
search_depth: 'basic', // 1 credit/次；advanced 要 2 credits，没必要
time_range: 'week',
max_results: CONFIG.SEARCH_RESULTS_PER_QUERY,
include_answer: false,
include_raw_content: false,
}),
});
return (data.results || []).map((r) => ({
title: r.title || '',
url: r.url || '',
content: (r.content || '').slice(0, 800),
published_date: r.published_date || '',
}));
}

async function searchAll(apiKey) {
const all = [];
const seen = new Set();
for (const q of CONFIG.QUERIES) {
log(`搜索：${q}`);
const results = await tavilySearch(apiKey, q);
log(` → ${results.length} 条结果`);
for (const r of results) {
const key = normalizeUrl(r.url);
if (!key || seen.has(key)) continue;
seen.add(key);
all.push(r);
}
}
return all;
}

// ================= 第 2 步：模型整理成结构化活动 =================
function buildPrompt(results) {
const numbered = results.map((r, i) =>
`[${i + 1}] 标题：${r.title}\n 链接：${r.url}\n 日期：${r.published_date || '未知'}\n 摘要：${r.content}`
).join('\n\n');

return `你是一个联名活动整理助手。下面是最近一周品牌联名、优惠活动与新品发售的搜索结果，请把它们整理成活动列表。

搜索结果：
${numbered}

要求（必须严格遵守）：
1. 只输出一个 JSON 数组，不要输出任何其他文字、不要用 markdown 代码块包裹。
2. 每个活动一个对象，字段如下（字段名必须是英文）：
- title（必填）：活动名，如「喜茶 × 合味道「喜茶面馆」」
- brand（必填）：品牌，如「喜茶」
- partner（可空）：联名对象，如「合味道」；纯优惠活动填 null
- type（必填）：只能是 "collab"（联名）、"promo"（优惠活动）或 "new"（新品发售）；新品发售指没有联名对象、没有优惠、只是新产品上市
- category（必填）：只能是 "奶茶"、"咖啡"、"综合"、"餐饮快餐"、"零食饮料"、"潮玩文创"、"美妆个护"、"服饰鞋包"、"数码家电"、"零售便利"、"游戏文娱"、"生活日用"、"其他" 之一（共 13 个）
- start_date（必填）：开始日期，格式 YYYY-MM-DD；未知则填搜索结果里的发布日期
- end_date（可空）：结束日期，格式 YYYY-MM-DD；未知或售完即止填 null
- description（必填）：一两句话介绍活动内容，只写搜索结果里提到的信息
- price_note（可空）：价格信息，如「单品 ¥22」；没提到填 null
- source_url（必填）：来源链接，必须从上面搜索结果里逐字复制，绝不能编造、绝不能改写
- order_name（可空）：购买入口名称，如「喜茶GO」「小米商城 mi.com」；没提到填 null
3. source_url 必须能在上面的搜索结果里找到原文；找不到来源的活动直接丢弃，不要输出。
4. 不要编造任何信息：日期、价格、联名对象，搜索结果里没有就填 null 或合理留空，绝不猜测。
5. 同一活动在多个搜索结果里出现时只保留一条（选信息最全的那条）。
6. 不是品牌联名、优惠活动或新品发售的不要输出；已经明确结束的活动不要输出。
7. 最多输出 ${CONFIG.MAX_EVENTS_PER_RUN} 条。`;
}

function extractJson(text) {
let t = String(text || '').trim();
// 模型有时会包一层 ```json... ```，先剥掉
const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
if (fence) t = fence[1].trim();
const parsed = JSON.parse(t);
if (!Array.isArray(parsed)) throw new Error('模型返回的不是 JSON 数组');
return parsed;
}

async function callGemini(apiKey, model, prompt) {
const url = `${CONFIG.GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
const data = await fetchJson(url, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
body: JSON.stringify({
contents: [{ parts: [{ text: prompt}]}],
generationConfig: { responseMimeType: 'application/json', temperature: 0.2},
}),
}, 60000);
const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
if (!text) throw new Error('Gemini 没有返回文本内容');
return extractJson(text);
}

async function callOpenAiCompatible(apiKey, baseUrl, model, prompt) {
const data = await fetchJson(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
body: JSON.stringify({
model,
messages: [
{ role: 'system', content: '你是一个联名活动整理助手，只输出 JSON 数组。'},
{ role: 'user', content: prompt},
],
temperature: 0.2,
}),
}, 60000);
const text = data?.choices?.[0]?.message?.content;
if (!text) throw new Error('模型没有返回文本内容');
return extractJson(text);
}

// ================= 第 3 步：严格校验 + 去重 =================
function validateEvents(candidates, allowedUrls) {
const valid = [];
const skipped = [];
const seenUrls = new Set();

for (const raw of candidates) {
const ev = raw && typeof raw === 'object'? raw: {};
const title = String(ev.title || '').trim();
const brand = String(ev.brand || '').trim();
const sourceUrl = normalizeUrl(ev.source_url);

if (!title ||!brand ||!sourceUrl) {
skipped.push({ title: title || '(无标题)', reason: '品牌、活动名、来源链接缺一不可'});
continue;
}
if (!allowedUrls.has(sourceUrl)) {
skipped.push({ title, reason: '来源链接不在搜索结果原文里（疑似编造），已丢弃'});
continue;
}
if (seenUrls.has(sourceUrl)) {
skipped.push({ title, reason: '本批次内重复链接'});
continue;
}
seenUrls.add(sourceUrl);

const start = isValidDate(ev.start_date)? ev.start_date: todayStr();
const end = isValidDate(ev.end_date)? ev.end_date: null;
valid.push({
title: title.slice(0, 60),
brand: brand.slice(0, 20),
partner: ev.partner? String(ev.partner).trim().slice(0, 30): null,
type: (ev.type === 'promo' || ev.type === 'bogo')? 'promo': (ev.type === 'new'? 'new': 'collab'),
category: CATEGORIES.includes(ev.category)? ev.category: '综合',
start_date: start,
end_date: end && end >= start? end: null,
description: String(ev.description || '').trim().slice(0, 500) || '详情见来源链接。',
price_note: ev.price_note? String(ev.price_note).trim().slice(0, 60): null,
source_url: sourceUrl,
order_name: ev.order_name? String(ev.order_name).trim().slice(0, 30): null,
order_hint: ev.order_name? `在「${String(ev.order_name).trim().slice(0, 30)}」购买`: null,
origin: 'auto',
source_label: '自动搜集',
});
}
return { valid, skipped};
}

// ================= Supabase 读写（service_role key，只从环境变量读） =================
function sbHeaders(serviceKey) {
return {
apikey: serviceKey,
Authorization: `Bearer ${serviceKey}`,
'Content-Type': 'application/json',
};
}

async function fetchExistingEvents(supabaseUrl, serviceKey) {
const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/events?select=source_url,title,brand`;
const rows = await fetchJson(url, { headers: sbHeaders(serviceKey)});
return Array.isArray(rows)? rows: [];
}

function dedupeAgainstDb(valid, existingRows) {
const existingUrls = new Set(existingRows.map((r) => normalizeUrl(r.source_url)).filter(Boolean));
const existingTitles = new Set(
existingRows.map((r) => `${String(r.brand || '').trim().toLowerCase()}|${String(r.title || '').trim().toLowerCase()}`)
);
const fresh = [];
const skipped = [];
for (const ev of valid) {
if (existingUrls.has(normalizeUrl(ev.source_url))) {
skipped.push({ title: ev.title, reason: '来源链接已在日历里'});
continue;
}
if (existingTitles.has(`${ev.brand.toLowerCase()}|${ev.title.toLowerCase()}`)) {
skipped.push({ title: ev.title, reason: '同品牌同名活动已在日历里'});
continue;
}
fresh.push(ev);
}
return { fresh, skipped};
}

async function insertEvents(supabaseUrl, serviceKey, events) {
const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/events`;
const rows = await fetchJson(url, {
method: 'POST',
headers: {...sbHeaders(serviceKey), Prefer: 'return=representation'},
body: JSON.stringify(events),
});
return Array.isArray(rows)? rows: [];
}

// 把新活动的来源链接记进 submissions 表，避免网友重复投稿同一条链接
async function recordSubmissions(supabaseUrl, serviceKey, inserted) {
const rows = inserted
.filter((ev) => ev.source_url)
.map((ev) => ({ url: ev.source_url, status: 'done', event_id: ev.id || null, note: 'auto-collect'}));
if (!rows.length) return;
try {
await fetchJson(
`${supabaseUrl.replace(/\/$/, '')}/rest/v1/submissions?on_conflict=url`,
{
method: 'POST',
headers: {...sbHeaders(serviceKey), Prefer: 'resolution=merge-duplicates,return=minimal'},
body: JSON.stringify(rows),
}
);
} catch (e) {
log(`⚠️ submissions 记录失败（不影响已写入的活动）：${e.message}`);
}
}

// ================= 主流程 =================
async function main() {
const args = parseArgs(process.argv.slice(2));
if (args.help) { printHelp(); return;}

const env = process.env;
const provider = (env.LLM_PROVIDER || CONFIG.LLM_PROVIDER).toLowerCase();
const supabaseUrl = env.SUPABASE_URL || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

log(`活动日历自动搜集开始（模式：${args.mock? '模拟数据': '真实 API'}${args.dryRun? ' + dry-run，不写库': ''}）`);

if (!args.mock) {
if (!env.TAVILY_API_KEY) throw new Error('缺少环境变量 TAVILY_API_KEY');
if (provider === 'gemini' &&!env.GEMINI_API_KEY) throw new Error('缺少环境变量 GEMINI_API_KEY');
if (provider === 'openai-compatible' &&!env.LLM_API_KEY) throw new Error('缺少环境变量 LLM_API_KEY');
}
if (!args.dryRun && (!supabaseUrl ||!serviceKey)) {
throw new Error('缺少环境变量 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（dry-run 模式下可不配）');
}
if (args.dryRun && (!supabaseUrl ||!serviceKey)) {
log('⚠️ dry-run：未配置 Supabase，去重时按空库处理（正式运行时会与已有活动去重）');
}

// 第 1 步：搜索
let results;
if (args.mock) {
results = MOCK_SEARCH_RESULTS;
log(`模拟搜索：${results.length} 条结果`);
} else {
results = await searchAll(env.TAVILY_API_KEY);
log(`搜索完成：去重后 ${results.length} 条结果`);
}
if (!results.length) {
log('没有搜到结果，今天不写入任何活动。');
return;
}

// 第 2 步：模型整理
let candidates;
if (args.mock) {
candidates = MOCK_LLM_EVENTS;
log(`模拟整理：${candidates.length} 条候选活动`);
} else {
const prompt = buildPrompt(results);
if (provider === 'gemini') {
const model = env.GEMINI_MODEL || CONFIG.GEMINI_MODEL;
log(`调用 Gemini（模型：${model}）整理…`);
candidates = await callGemini(env.GEMINI_API_KEY, model, prompt);
} else if (provider === 'openai-compatible') {
const baseUrl = env.LLM_BASE_URL || CONFIG.OPENAI_BASE_URL;
const model = env.LLM_MODEL || CONFIG.OPENAI_MODEL;
if (!baseUrl ||!model) throw new Error('OpenAI 兼容模式需要配置 LLM_BASE_URL 和 LLM_MODEL');
log(`调用 OpenAI 兼容接口（模型：${model}）整理…`);
candidates = await callOpenAiCompatible(env.LLM_API_KEY, baseUrl, model, prompt);
} else {
throw new Error(`不支持的 LLM_PROVIDER：${provider}（可选：gemini / openai-compatible）`);
}
log(`模型返回 ${candidates.length} 条候选活动`);
}

// 第 3 步：严格校验 + 去重
const allowedUrls = new Set(results.map((r) => normalizeUrl(r.url)).filter(Boolean));
const { valid, skipped: skippedValidate} = validateEvents(candidates, allowedUrls);
for (const s of skippedValidate) log(` 丢弃「${s.title}」：${s.reason}`);
log(`校验通过 ${valid.length} 条，丢弃 ${skippedValidate.length} 条`);

let fresh = valid;
if (supabaseUrl && serviceKey) {
const existing = await fetchExistingEvents(supabaseUrl, serviceKey);
const deduped = dedupeAgainstDb(valid, existing);
for (const s of deduped.skipped) log(` 跳过「${s.title}」：${s.reason}`);
fresh = deduped.fresh;
log(`与日历去重后剩余 ${fresh.length} 条新活动`);
}
fresh = fresh.slice(0, CONFIG.MAX_EVENTS_PER_RUN);

if (!fresh.length) {
log('没有新活动需要写入，今天到此为止。');
return;
}

// 输出将要写入的内容
console.log('\n将要写入的活动：');
for (const ev of fresh) {
console.log(` - ${ev.brand} × ${ev.partner || ''}「${ev.title}」[${ev.type}/${ev.category}] ${ev.start_date} ~ ${ev.end_date || '售完即止'}`);
console.log(` 来源：${ev.source_url}`);
}

if (args.dryRun) {
log(`dry-run：以上 ${fresh.length} 条不会真正写入。`);
return;
}

const inserted = await insertEvents(supabaseUrl, serviceKey, fresh);
log(`✅ 已写入 ${inserted.length} 条新活动`);
await recordSubmissions(supabaseUrl, serviceKey, inserted);
log('完成。');
}

main().catch((e) => {
console.error(`❌ 搜集失败：${e.message}`);
process.exit(1);
});
