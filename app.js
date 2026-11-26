/* 联名日历 · 前端逻辑（纯静态，无构建步骤）
 *
 * 数据源：
 * - 已配置 Supabase（config.js 里填了真实 URL 和 anon key）：
 *   活动读写走 Supabase PostgREST，所有访客共享同一本日历；
 *   登录走 Supabase Auth（邮箱 + 密码），登录后购买记录读写云端
 *   purchases 表，换设备同步；未登录时购买记录存在本地 localStorage。
 * - 未配置（占位符）：演示模式，活动存在本地 localStorage，
 *   投稿和新增只保存在本浏览器，登录不可用，页面照常可用，不会白屏。
 * 详见 README「登录功能」和「自动搜集设置」。
 */
(function () {
  'use strict';

  /* ================= 配置与模式 ================= */
  var cfg = (window.LMRL_CONFIG || {});
  var SUPABASE_URL = (cfg.SUPABASE_URL || '').replace(/\/$/, '');
  var SUPABASE_KEY = cfg.SUPABASE_ANON_KEY || '';
  var ONLINE = SUPABASE_URL.indexOf('YOUR-PROJECT-REF') === -1 &&
               SUPABASE_KEY.indexOf('YOUR-ANON-KEY') === -1 &&
               SUPABASE_URL.indexOf('supabase.co') !== -1 &&
               SUPABASE_KEY.length > 20;

  var DEMO_EVENTS_KEY = 'lmrl_demo_events_v1';
  var PURCHASES_KEY = 'lmrl_purchases_v1';

  // Supabase JS 客户端（只用于登录与购买记录云端同步；CDN 加载失败时为 null，
  // 登录不可用，但看日历、投稿、游客记账这些功能照常可用）
  var SB = null;
  if (ONLINE && typeof window.supabase !== 'undefined' &&
      window.supabase && window.supabase.createClient) {
    try {
      SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn('Supabase 客户端初始化失败：', e);
      SB = null;
    }
  }

  /* ================= 演示数据（与 supabase/seed.sql 同源，2026-11-19 核实） ================= */
  var DEMO_EVENTS = [
    {
      id: 'demo-01', title: '喜茶 × 合味道「喜茶面馆」', brand: '喜茶', partner: '合味道',
      type: 'collab', category: '奶茶', start_date: '2026-11-13', end_date: null,
      description: '「喜茶面馆」联名上线：生打椰做汤底、芒果做拉面的「生打椰拉面」，杯身复刻合味道经典红白杯面造型；联名茶杯、拉面碗、冰箱贴等周边同步发售，208 家联名主题店上线。',
      price_note: '生打椰拉面 ¥22；茶杯套餐 ¥46；拉面碗套餐 ¥88',
      source_url: 'https://finance.sina.cn/cj/2026-11-13/detail-iniypzqc1008654.d.html',
      order_name: '喜茶GO', order_hint: '微信搜索「喜茶GO」小程序点单',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-02', title: '蜜雪冰城抽 10000 张免单券', brand: '蜜雪冰城', partner: null,
      type: 'promo', category: '奶茶', start_date: '2026-11-01', end_date: '2026-11-30',
      description: '微信粉丝群老用户及活动期间进群用户可抽奖一次，即时开奖。一等奖 7 元饮品免单券共 10000 张，另有新品 8.5 折、8.8 折、9 折券。',
      price_note: '一等奖：7 元饮品免单券（共 10000 张）',
      source_url: 'http://feng.ifeng.com/c/8y61f30ZIV6',
      order_name: '蜜雪冰城', order_hint: '微信搜索「蜜雪冰城」小程序参与',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-03', title: '霸王茶姬 9 周年买一送一券', brand: '霸王茶姬', partner: null,
      type: 'promo', category: '奶茶', start_date: '2026-11-13', end_date: '2026-11-19',
      description: '9 周年「猜口令·赢好茶」：11 月 10 日至 13 日每天 11:17 猜口令抢券，共 100 万张 9 周年限定饮品买一送一券，券有效期至 11 月 19 日。',
      price_note: '买一送一券（全品类，不含大大杯相关系列）',
      source_url: 'https://www.sina.cn/news/detail/5363652203907105.html',
      order_name: '霸王茶姬', order_hint: '微信搜索「霸王茶姬」小程序点单',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-04', title: '书亦烧仙草抽买一送一券', brand: '书亦烧仙草', partner: null,
      type: 'promo', category: '奶茶', start_date: '2026-11-06', end_date: '2026-11-19',
      description: '进入活动页面完成任务获得刮奖机会，即时开奖。奖品含富士一次性胶卷相机、限定吨吨杯、巴巴露亚单杯买一送一券 2000 张、可可系列买一送一 10000 张等。',
      price_note: '巴巴露亚单杯买一送一券、可可系列买一送一',
      source_url: 'https://news.qq.com/rain/a/20261116A0DTP900',
      order_name: '书亦烧仙草', order_hint: '微信搜索「书亦烧仙草」小程序参与',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-05', title: '奈雪的茶 × 《世界之外》联名', brand: '奈雪的茶', partner: '世界之外',
      type: 'collab', category: '奶茶', start_date: '2026-11-12', end_date: null,
      description: '与乙女手游《世界之外》联名，4 款联名茶饮：顾时夜·初雪云酪蓝莓、易遇·初雪云酪芭乐、柏源·初雪云酪苹果、夏萧因·初雪云酪葡萄。饮品口味可自选，马口铁徽章随杯附赠。',
      price_note: '联名茶饮 4 款，马口铁徽章随杯附赠',
      source_url: 'https://www.taptap.cn/moment/867844597886226266?group_id=592551',
      order_name: '奈雪点单', order_hint: '微信搜索「奈雪点单」小程序点单',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-06', title: '美团会员惊喜多选 1 · 0 元饮品', brand: '美团', partner: null,
      type: 'promo', category: '综合', start_date: '2026-01-01', end_date: '2026-12-31',
      description: 'L3 及以上会员每周五 0 点起可从权益池 0 元领 1 项权益，饮品权益覆盖蜜雪冰城、古茗、喜茶、奈雪、瑞幸、星巴克、库迪、茶百道等品牌，到店核销，每周权益池先到先得。',
      price_note: '0 元领，每周 1 项',
      source_url: 'https://source.meituan.com/meituan-member/surprise-pick-1',
      order_name: '美团 App', order_hint: '打开美团 App 搜索「会员666」',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-07', title: '茉莉奶白新联名 11.26 揭晓', brand: '茉莉奶白', partner: '待揭晓',
      type: 'collab', category: '奶茶', start_date: '2026-11-26', end_date: null,
      description: '官方预热海报「茉莉奶白 × ??」，联名对象 11 月 26 日正式揭晓。（预告：联名对象以官方正式公布为准）',
      price_note: null,
      source_url: 'https://www.threads.com/@1uan02/post/DfsCO4NlCrj',
      order_name: '茉莉奶白', order_hint: '微信搜索「茉莉奶白」小程序点单',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-08', title: '瑞幸 × 王者荣耀 KPL 十周年联名', brand: '瑞幸咖啡', partner: '王者荣耀 KPL',
      type: 'collab', category: '咖啡', start_date: '2026-10-26', end_date: '2026-11-08',
      description: '「十年此刻，开瑞全场」三方联名，十位 KPL 选手形象登上杯身、杯套与纸袋。第一弹 10 月 26 日上线，第二弹 11 月 2 日接续，共 11 款联名杯。',
      price_note: '联名杯随超大杯冷饮随机发放',
      source_url: 'https://post.smzdm.com/p/a03xw7d0/',
      order_name: '瑞幸咖啡', order_hint: '微信搜索「瑞幸咖啡」小程序点单',
      origin: 'seed', source_label: null
    },
    {
      id: 'demo-09', title: '泡泡玛特 DIMOO 双线新品开售', brand: '泡泡玛特', partner: null,
      type: 'new', category: '潮玩文创', start_date: '2026-11-05', end_date: null,
      description: '11 月 5 日晚三线齐发：DIMOO「飞行幻想」手办盲盒单盒 69 元（12 常规 + 1 隐藏）、DIMOO「今日心情预报」搪胶毛绒盲盒单只 129 元（6 常规 + 1 隐藏），线下门店 11 月 6 日跟进。是 Q3 财报后首个非 LABUBU IP 的接棒测试。',
      price_note: null,
      source_url: 'https://ibtefair.com/NewsDetail/9218540.html',
      order_name: '泡泡玛特官方渠道', order_hint: '泡泡玛特线上官方渠道或线下门店购买',
      origin: 'seed', source_label: null
    }
  ];

  /* ================= 工具函数 ================= */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 'YYYY-MM-DD' -> 本地 Date（避免 new Date('2026-11-19') 被按 UTC 解析）
  function parseDate(str) {
    var p = String(str).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return fmtDate(new Date()); }

  function shortDate(str) {
    if (!str) return '';
    var d = parseDate(str);
    return (d.getMonth() + 1) + '.' + d.getDate();
  }

  function dateRangeText(ev) {
    if (!ev.end_date) return shortDate(ev.start_date) + ' 起 · 售完即止';
    if (ev.start_date === ev.end_date) return shortDate(ev.start_date);
    return shortDate(ev.start_date) + ' – ' + shortDate(ev.end_date);
  }

  // 活动在某天是否进行中（end_date 为空视为长期进行）
  function isActiveOn(ev, dateStr) {
    if (dateStr < ev.start_date) return false;
    if (ev.end_date && dateStr > ev.end_date) return false;
    return true;
  }

  function statusOf(ev, dateStr) {
    if (dateStr < ev.start_date) return 'upcoming';
    if (ev.end_date && dateStr > ev.end_date) return 'ended';
    if (ev.end_date === dateStr) return 'ending';
    return 'active';
  }

  function typeLabel(t) {
    if (t === 'promo') return '优惠';
    if (t === 'new') return '新品';
    return '联名';
  }

  function stampText(brand) {
    var b = (brand || '?').replace(/\s/g, '');
    return b.slice(0, 1);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function loadJSON(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 存储满了就忽略 */ }
  }

  /* ================= 数据层 ================= */
  var state = {
    events: [],
    purchases: loadJSON(PURCHASES_KEY, []),
    user: null, // 登录用户（supabase auth user），未登录为 null
    view: 'today',
    typeFilter: 'all',
    categoryFilter: 'all',
    search: '',
    calMode: 'month',
    calCursor: firstOfMonth(new Date()), // 月视图：当月 1 号；周视图：当周周一
    selectedDate: todayStr()
  };

  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (x.getDay() + 6) % 7; // 周一=0
    x.setDate(x.getDate() - dow);
    return x;
  }

  function sbFetch(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['apikey'] = SUPABASE_KEY;
    options.headers['Authorization'] = 'Bearer ' + SUPABASE_KEY;
    options.headers['Content-Type'] = 'application/json';
    return fetch(SUPABASE_URL + '/rest/v1' + path, options);
  }

  function demoEvents() {
    var stored = loadJSON(DEMO_EVENTS_KEY, null);
    if (stored && stored.length) return stored;
    saveJSON(DEMO_EVENTS_KEY, DEMO_EVENTS);
    return DEMO_EVENTS.slice();
  }

  function loadEvents() {
    if (!ONLINE) {
      state.events = demoEvents();
      return Promise.resolve();
    }
    return sbFetch('/events?select=*&order=start_date.asc&order=created_at.asc')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) { state.events = rows || []; })
      .catch(function (err) {
        console.warn('Supabase 读取失败，降级为演示数据：', err);
        ONLINE = false; // 本次会话降级，避免每次操作都报错
        var banner = $('demoBanner');
        banner.querySelector('span').textContent =
          '连接 Supabase 失败，当前显示本地示例数据。请检查 config.js 里的 URL / anon key 是否正确，或查看 README 的配置方法。';
        banner.hidden = false;
        state.events = demoEvents();
      });
  }

  // 检查链接是否已投过（在线：查 submissions 表；演示：查本地记录）
  function isDuplicateUrl(url) {
    if (!ONLINE) {
      return Promise.resolve(state.events.some(function (e) {
        return e.source_url && e.source_url === url && e.origin === 'user';
      }));
    }
    return sbFetch('/submissions?select=id&url=eq.' + encodeURIComponent(url))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) { return rows && rows.length > 0; });
  }

  // 新增活动（在线：写入 Supabase；演示：写入 localStorage）
  function createEvent(ev) {
    if (!ONLINE) {
      ev.id = 'demo-' + Date.now();
      var list = demoEvents();
      list.push(ev);
      saveJSON(DEMO_EVENTS_KEY, list);
      state.events = list;
      return Promise.resolve(ev);
    }
    return sbFetch('/events', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(ev)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) { return rows && rows[0]; });
  }

  function createSubmission(url, eventId) {
    if (!ONLINE) return Promise.resolve();
    return sbFetch('/submissions', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ url: url, status: 'done', event_id: eventId || null })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
    });
  }

  /* ================= 登录（Supabase Auth）与购买记录云端同步 ================= */
  function isLoggedIn() { return !!(SB && state.user); }

  function isUuid(s) {
    return typeof s === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  // 云端购买记录 -> 本地展示结构
  function cloudToLocal(row) {
    return {
      id: row.id,
      event_id: row.event_id || null,
      title: row.title,
      brand: row.brand || '',
      price: parseFloat(row.price) || 0,
      date: row.date,
      note: row.note || ''
    };
  }

  // 本地购买记录 -> 云端写入结构（演示模式的活动 id 不是 uuid，写入云端时置空）
  function localToCloud(p, userId) {
    return {
      user_id: userId,
      event_id: isUuid(p.event_id) ? p.event_id : null,
      title: p.title,
      brand: p.brand || null,
      price: parseFloat(p.price) || 0,
      date: p.date,
      note: p.note || null
    };
  }

  // 购买记录去重键：活动 + 日期 + 价格 + 备注（用于首次登录时本地记录上云）
  function purchaseKey(p) {
    return ((p.event_id || p.title || '') + '|' + (p.date || '') + '|' +
      (parseFloat(p.price) || 0) + '|' + (p.note || '')).toLowerCase();
  }

  function loadCloudPurchases() {
    if (!SB || !state.user) return Promise.resolve([]);
    return SB.from('purchases').select('*').order('date', { ascending: false })
      .then(function (res) {
        if (res.error) throw res.error;
        state.purchases = (res.data || []).map(cloudToLocal);
        return state.purchases;
      });
  }

  // 首次登录：把本地已有的购买记录一次性上传到云端（按去重键跳过已有的），
  // 全部成功后清空本地，避免下次登录重复上传；失败则保留本地，下次登录再试。
  function migrateLocalPurchases() {
    if (!SB || !state.user) return Promise.resolve();
    var local = loadJSON(PURCHASES_KEY, []);
    if (!local.length) return Promise.resolve();
    var existing = {};
    state.purchases.forEach(function (p) { existing[purchaseKey(p)] = true; });
    var toUpload = local.filter(function (p) { return !existing[purchaseKey(p)]; });
    if (!toUpload.length) {
      saveJSON(PURCHASES_KEY, []);
      return Promise.resolve();
    }
    var payloads = toUpload.map(function (p) { return localToCloud(p, state.user.id); });
    return SB.from('purchases').insert(payloads).select()
      .then(function (res) {
        if (res.error) throw res.error;
        (res.data || []).forEach(function (row) { state.purchases.push(cloudToLocal(row)); });
        saveJSON(PURCHASES_KEY, []);
        toast('已把本地 ' + toUpload.length + ' 笔记录同步到云端');
      });
  }

  function afterLogin() {
    renderAuthUI();
    return loadCloudPurchases()
      .then(migrateLocalPurchases)
      .then(function () { renderPurchases(); })
      .catch(function (err) {
        console.warn('云端购买记录同步失败：', err);
        toast('云端记录同步失败，请检查网络');
        renderPurchases();
      });
  }

  function updateMineNote() {
    var note = $('mineNote');
    if (!note) return;
    if (isLoggedIn()) {
      note.textContent = '已登录为 ' + (state.user.email || '') + '，购买记录已同步到云端，换设备也能看到。';
    } else if (ONLINE) {
      note.textContent = '未登录：购买记录只保存在这台浏览器里。登录后会同步到云端，换设备也能看到。';
    } else {
      note.textContent = '演示模式：购买记录只保存在这台浏览器里。配置 Supabase 并登录后可同步到云端。';
    }
  }

  function renderAuthUI() {
    var area = $('authArea');
    if (!area) return;
    if (isLoggedIn()) {
      var email = state.user.email || '';
      var nick = email.split('@')[0] || '我';
      area.innerHTML =
        '<span class="user-chip" title="' + esc(email) + '">' +
          '<span class="user-stamp">' + esc(stampText(nick)) + '</span>' +
          '<span class="user-name">' + esc(nick) + '</span>' +
        '</span>' +
        '<button class="auth-btn" id="logoutBtn">退出</button>';
      var logoutBtn = $('logoutBtn');
      if (logoutBtn) logoutBtn.addEventListener('click', signOut);
    } else {
      area.innerHTML = '<button class="auth-btn" id="loginBtn">登录</button>';
      var loginBtn = $('loginBtn');
      if (loginBtn) loginBtn.addEventListener('click', openAuthModal);
    }
    updateMineNote();
  }

  var authMode = 'login'; // 'login' | 'register'

  function setAuthMode(mode) {
    authMode = mode;
    $('authTabLogin').classList.toggle('active', mode === 'login');
    $('authTabRegister').classList.toggle('active', mode === 'register');
    $('authTitle').textContent = mode === 'login' ? '登录联名日历' : '注册新账号';
    $('authHint').textContent = mode === 'login'
      ? '登录后，你的购买记录会同步到云端，换设备也能看到。看日历和投稿不需要登录，任何人都能看、能投。'
      : '注册一个账号，购买记录就能同步到云端。邮箱只用来登录，不会公开显示。';
    $('authSubmitBtn').textContent = mode === 'login' ? '登录' : '注册';
    hideError('authError');
    var ok = $('authOk');
    if (ok) ok.hidden = true;
  }

  function openAuthModal() {
    hideError('authError');
    var ok = $('authOk');
    if (ok) ok.hidden = true;
    // 演示模式 / 组件加载失败时：提示原因并禁用提交，不让用户白填表单
    $('authDemoNote').hidden = ONLINE;
    $('authLoadNote').hidden = !(ONLINE && !SB);
    $('authSubmitBtn').disabled = !ONLINE || !SB;
    setAuthMode('login');
    openModal('authModal');
  }

  function signOut() {
    if (!SB) return;
    SB.auth.signOut().catch(function (err) {
      console.warn(err);
      toast('退出失败，请重试');
    });
    // 状态清理由 onAuthStateChange 统一处理
  }

  function authErrorText(err) {
    var msg = (err && err.message) || '';
    if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不对，请重试。';
    if (/User already registered/i.test(msg)) return '这个邮箱已经注册过了，请直接登录。';
    if (/Email not confirmed/i.test(msg)) return '邮箱还没确认，请先去邮箱点击确认链接。';
    if (/Password should be at least/i.test(msg)) return '密码至少 6 位。';
    if (/network|fetch failed|Failed to fetch/i.test(msg)) return '网络有问题，请检查后重试。';
    return '操作失败：' + msg;
  }

  function initAuth() {
    renderAuthUI();
    if (!SB) return Promise.resolve();
    return SB.auth.getSession()
      .then(function (res) {
        state.user = (res.data && res.data.session) ? res.data.session.user : null;
        if (state.user) return afterLogin();
        renderAuthUI();
      })
      .catch(function (err) {
        console.warn('读取登录状态失败：', err);
        renderAuthUI();
      })
      .finally(function () {
        // getSession 之后再订阅，避免 INITIAL_SESSION 与上面重复触发同步
        SB.auth.onAuthStateChange(function (event, session) {
          var prevId = state.user && state.user.id;
          state.user = session ? session.user : null;
          if (session && state.user && state.user.id !== prevId) {
            afterLogin();
          } else if (!session && prevId) {
            state.purchases = loadJSON(PURCHASES_KEY, []);
            renderAuthUI();
            renderPurchases();
            toast('已退出登录');
          } else {
            renderAuthUI();
          }
        });
      });
  }

  // 保存购买记录：登录后写云端，未登录写本地
  function savePurchase(rec, isEdit) {
    if (!isLoggedIn()) {
      if (isEdit) {
        state.purchases = state.purchases.map(function (p) { return p.id === rec.id ? rec : p; });
      } else {
        state.purchases.push(rec);
      }
      saveJSON(PURCHASES_KEY, state.purchases);
      return Promise.resolve(rec);
    }
    var payload = localToCloud(rec, state.user.id);
    if (isEdit) {
      return SB.from('purchases').update(payload).eq('id', rec.id).select().single()
        .then(function (res) {
          if (res.error) throw res.error;
          var updated = cloudToLocal(res.data);
          state.purchases = state.purchases.map(function (p) { return p.id === rec.id ? updated : p; });
          return updated;
        });
    }
    return SB.from('purchases').insert(payload).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        var created = cloudToLocal(res.data);
        state.purchases.push(created);
        return created;
      });
  }

  // 删除购买记录：登录后删云端，未登录删本地
  function deletePurchase(id) {
    if (!isLoggedIn()) {
      state.purchases = state.purchases.filter(function (p) { return p.id !== id; });
      saveJSON(PURCHASES_KEY, state.purchases);
      return Promise.resolve();
    }
    return SB.from('purchases').delete().eq('id', id)
      .then(function (res) {
        if (res.error) throw res.error;
        state.purchases = state.purchases.filter(function (p) { return p.id !== id; });
      });
  }

  /* ================= 渲染：今日活动 ================= */
  function filteredTodayEvents() {
    var today = todayStr();
    var q = state.search.trim().toLowerCase();
    return state.events
      .filter(function (ev) { return isActiveOn(ev, today); })
      .filter(function (ev) { return ev.type !== 'new'; })
      .filter(function (ev) {
        if (state.typeFilter !== 'all' && ev.type !== state.typeFilter) return false;
        if (state.categoryFilter !== 'all' && ev.category !== state.categoryFilter) return false;
        if (q) {
          var hay = ((ev.title || '') + ' ' + (ev.brand || '') + ' ' + (ev.partner || '')).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        // 先按结束时间排（无结束日期的排后面），再按开始时间
        var ea = a.end_date || '9999-12-31', eb = b.end_date || '9999-12-31';
        if (ea !== eb) return ea < eb ? -1 : 1;
        return a.start_date < b.start_date ? -1 : 1;
      });
  }

  function eventRowHTML(ev) {
    var today = todayStr();
    var st = statusOf(ev, today);
    var start = parseDate(ev.start_date);
    var typeCls = ev.type === 'promo' ? 'promo' : (ev.type === 'new' ? 'new' : 'collab');
    var badges = '<span class="badge badge-' + typeCls + '">' +
      typeLabel(ev.type) + '</span>';
    if (ev.origin === 'user' || ev.source_label) {
      badges += '<span class="badge badge-user">' + esc(ev.source_label || '网友投稿') + '</span>';
    }
    if (st === 'ending') badges += '<span class="badge badge-ending">今日截止</span>';
    if (st === 'upcoming') badges += '<span class="badge badge-upcoming">即将开始</span>';

    return '<button class="event-row type-' + esc(ev.type) + '" data-event-id="' + esc(ev.id) + '">' +
      '<span class="date-col">' +
        '<span class="mm">' + (start.getMonth() + 1) + '月</span>' +
        '<span class="dd">' + start.getDate() + '</span>' +
        '<span class="range">' + esc(dateRangeText(ev)) + '</span>' +
      '</span>' +
      '<span class="body-col">' +
        '<span class="row-top">' +
          '<span class="stamp">' + esc(stampText(ev.brand)) + '</span>' +
          '<span class="event-title">' + esc(ev.title) + '</span>' +
          badges +
        '</span>' +
        (ev.description ? '<span class="event-desc">' + esc(ev.description) + '</span>' : '') +
        '<span class="event-meta">' +
          '<span>' + esc(ev.brand) + (ev.partner ? ' × ' + esc(ev.partner) : '') + '</span>' +
          '<span>' + esc(ev.category) + '</span>' +
          (ev.price_note ? '<span class="price">' + esc(ev.price_note) + '</span>' : '') +
        '</span>' +
      '</span>' +
    '</button>';
  }

  function renderToday() {
    var today = todayStr();
    var active = state.events.filter(function (ev) {
      return isActiveOn(ev, today) && ev.type !== 'new';
    });
    var ending = active.filter(function (ev) { return ev.end_date === today; });

    // 顶部摘要
    var upcomingCount = state.events.filter(function (ev) {
      return ev.start_date > today && ev.type !== 'new';
    }).length;
    $('todaySummary').textContent = '今天 ' + active.length + ' 个活动进行中' +
      (ending.length ? ' · ' + ending.length + ' 个今日截止' : '') +
      (upcomingCount ? ' · ' + upcomingCount + ' 个即将上线' : '');

    // 今日截止提醒
    var box = $('endingSoon');
    if (ending.length) {
      box.hidden = false;
      box.innerHTML = '⏰ <strong>今日截止：</strong>' +
        ending.map(function (ev) { return esc(ev.title); }).join('、') + '，别错过了。';
    } else {
      box.hidden = true;
    }

    var list = filteredTodayEvents();
    $('todayList').innerHTML = list.map(eventRowHTML).join('');
    $('todayEmpty').hidden = list.length > 0;
  }

  /* ================= 渲染：新品上新 ================= */
  function renderNew() {
    var list = state.events
      .filter(function (ev) { return ev.type === 'new'; })
      .sort(function (a, b) { return a.start_date < b.start_date ? 1 : -1; });
    $('newList').innerHTML = list.map(eventRowHTML).join('');
    $('newEmpty').hidden = list.length > 0;
  }

  /* ================= 渲染：纵览日历 ================= */
  function eventsOn(dateStr) {
    return state.events
      .filter(function (ev) { return isActiveOn(ev, dateStr); })
      .sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; });
  }

  function renderCalendar() {
    var grid = $('calendarGrid');
    var weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    var html = '<div class="cal-weekdays">' +
      weekdays.map(function (w) { return '<span>周' + w + '</span>'; }).join('') + '</div>';

    var today = todayStr();
    var cells = [];

    if (state.calMode === 'month') {
      var first = state.calCursor;
      $('calTitle').textContent = first.getFullYear() + '年' + (first.getMonth() + 1) + '月';
      var startOffset = (first.getDay() + 6) % 7; // 当月 1 号是周几（周一起）
      var daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      var total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
      for (var i = 0; i < total; i++) {
        var d = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset + i);
        cells.push({ date: d, inMonth: d.getMonth() === first.getMonth() });
      }
    } else {
      var monday = mondayOf(state.calCursor);
      var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      $('calTitle').textContent =
        (monday.getMonth() + 1) + '月' + monday.getDate() + '日 – ' +
        (sunday.getMonth() + 1) + '月' + sunday.getDate() + '日';
      for (var j = 0; j < 7; j++) {
        cells.push({
          date: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + j),
          inMonth: true
        });
      }
    }

    html += '<div class="cal-grid">' + cells.map(function (c) {
      var ds = fmtDate(c.date);
      var evs = eventsOn(ds);
      var dots = '';
      var seen = {};
      evs.slice(0, 3).forEach(function (ev) {
        var cls = ev.origin === 'user' ? 'dot-user' : (ev.type === 'promo' ? 'dot-promo' : (ev.type === 'new' ? 'dot-new' : 'dot-collab'));
        if (!seen[cls]) { seen[cls] = true; dots += '<i class="dot ' + cls + '"></i>'; }
      });
      var classes = 'cal-day' +
        (c.inMonth ? '' : ' other-month') +
        (ds === today ? ' today' : '') +
        (ds === state.selectedDate ? ' selected' : '');
      return '<button class="' + classes + '" data-date="' + ds + '">' +
        '<span class="dnum">' + c.date.getDate() + '</span>' +
        '<span class="cal-dots">' + dots + '</span>' +
        (evs.length ? '<span class="cal-count">' + evs.length + ' 个活动</span>' : '<span class="cal-count">&nbsp;</span>') +
      '</button>';
    }).join('') + '</div>';

    grid.innerHTML = html;
    renderDayDetail();
  }

  function renderDayDetail() {
    var ds = state.selectedDate;
    var d = parseDate(ds);
    var weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    $('dayDetailTitle').textContent =
      (d.getMonth() + 1) + '月' + d.getDate() + '日 · 星期' + weekNames[d.getDay()] +
      (ds === todayStr() ? '（今天）' : '');
    var evs = eventsOn(ds);
    $('dayList').innerHTML = evs.map(eventRowHTML).join('');
    $('dayEmpty').hidden = evs.length > 0;
  }

  /* ================= 渲染：我购买的 ================= */
  function renderPurchases() {
    var total = state.purchases.reduce(function (sum, p) {
      return sum + (parseFloat(p.price) || 0);
    }, 0);
    $('spendTotal').textContent = '¥' + total.toFixed(2).replace(/\.00$/, '');
    $('spendCount').textContent = state.purchases.length + ' 笔入手记录';

    var sorted = state.purchases.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : -1;
    });
    $('purchaseList').innerHTML = sorted.map(function (p) {
      return '<div class="purchase-row">' +
        '<div class="p-main">' +
          '<p class="p-title">' + esc(p.title) + '</p>' +
          '<p class="p-sub">' + esc(p.brand || '') + (p.brand ? ' · ' : '') + esc(p.date) +
            (p.note ? ' · ' + esc(p.note) : '') + '</p>' +
        '</div>' +
        '<div class="p-price">¥' + esc(String(p.price)) + '</div>' +
        '<div class="p-actions">' +
          '<button class="link-btn" data-edit-purchase="' + esc(p.id) + '">编辑</button>' +
          '<button class="link-btn danger" data-del-purchase="' + esc(p.id) + '">删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
    $('purchaseEmpty').hidden = state.purchases.length > 0;
  }

  function renderAll() {
    renderToday();
    renderNew();
    renderCalendar();
    renderPurchases();
  }

  /* ================= 弹窗 ================= */
  function openModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(id) { $(id).hidden = true; document.body.style.overflow = ''; }

  function showError(elId, msg) {
    var el = $(elId);
    el.textContent = msg;
    el.hidden = false;
  }
  function hideError(elId) { $(elId).hidden = true; }

  function openDetail(eventId) {
    var ev = null;
    for (var i = 0; i < state.events.length; i++) {
      if (String(state.events[i].id) === String(eventId)) { ev = state.events[i]; break; }
    }
    if (!ev) return;
    var today = todayStr();
    var st = statusOf(ev, today);
    var typeCls = ev.type === 'promo' ? 'promo' : (ev.type === 'new' ? 'new' : 'collab');
    var badges = '<span class="badge badge-' + typeCls + '">' +
      typeLabel(ev.type) + '</span><span class="badge badge-upcoming">' + esc(ev.category) + '</span>';
    if (ev.origin === 'user' || ev.source_label) {
      badges += '<span class="badge badge-user">' + esc(ev.source_label || '网友投稿') + '</span>';
    }
    if (st === 'ending') badges += '<span class="badge badge-ending">今日截止</span>';
    if (st === 'upcoming') badges += '<span class="badge badge-upcoming">即将开始</span>';
    if (st === 'ended') badges += '<span class="badge badge-upcoming">已结束</span>';

    var html =
      '<div class="detail-head">' +
        '<span class="stamp">' + esc(stampText(ev.brand)) + '</span>' +
        '<h2 id="detailTitle">' + esc(ev.title) + '</h2>' +
      '</div>' +
      '<div class="detail-badges">' + badges + '</div>' +
      '<p class="detail-dates">' + esc(ev.brand) + (ev.partner ? ' × ' + esc(ev.partner) : '') +
        ' · ' + esc(dateRangeText(ev)) + '</p>' +
      (ev.description ? '<p class="detail-desc">' + esc(ev.description) + '</p>' : '') +
      (ev.price_note ? '<p class="detail-price">' + esc(ev.price_note) + '</p>' : '') +
      (ev.order_name
        ? '<div class="order-card"><div class="oc-label">点单入口</div>' +
          '<div class="oc-name">' + esc(ev.order_name) + '</div>' +
          '<p class="oc-hint">' + esc(ev.order_hint || '微信搜索该小程序点单') + '（微信小程序无法从网页直接跳转）</p></div>'
        : '') +
      '<div class="detail-actions">' +
        (ev.source_url
          ? '<a class="btn btn-ghost" href="' + esc(ev.source_url) + '" target="_blank" rel="noopener">查看来源</a>'
          : '') +
        '<button class="btn btn-primary" id="detailBuyBtn">我买了</button>' +
      '</div>';

    $('detailBody').innerHTML = html;
    openModal('detailModal');
    $('detailBuyBtn').addEventListener('click', function () {
      closeModal('detailModal');
      openPurchaseForm({ event_id: ev.id, title: ev.title, brand: ev.brand });
    });
  }

  function openPurchaseForm(prefill) {
    prefill = prefill || {};
    $('purId').value = prefill.id || '';
    $('purEventId').value = prefill.event_id || '';
    $('purTitle').value = prefill.title || '';
    $('purBrand').value = prefill.brand || '';
    $('purPrice').value = (prefill.price != null ? prefill.price : '');
    $('purDate').value = prefill.date || todayStr();
    $('purNote').value = prefill.note || '';
    $('purchaseTitle').textContent = prefill.id ? '编辑入手记录' : '记一笔入手';
    hideError('purchaseError');
    openModal('purchaseModal');
  }

  /* ================= 投稿：从链接预填（诚实版） ================= */
  // 只根据域名判断平台，不假装能读到页面正文。
  var PLATFORM_MAP = [
    [/weibo\.com|weibo\.cn/, '微博'],
    [/xiaohongshu\.com|xhslink\.com/, '小红书'],
    [/mp\.weixin\.qq\.com/, '微信公众号'],
    [/douyin\.com/, '抖音'],
    [/bilibili\.com/, '哔哩哔哩'],
    [/zhihu\.com/, '知乎'],
    [/taptap\.cn/, 'TapTap'],
    [/sina\.cn|sina\.com\.cn/, '新浪新闻'],
    [/qq\.com/, '腾讯新闻'],
    [/ifeng\.com/, '凤凰网'],
    [/smzdm\.com/, '什么值得买']
  ];

  function platformOf(url) {
    for (var i = 0; i < PLATFORM_MAP.length; i++) {
      if (PLATFORM_MAP[i][0].test(url)) return PLATFORM_MAP[i][1];
    }
    try {
      var host = new URL(url).hostname.replace(/^www\./, '');
      return host || '其他网站';
    } catch (e) { return '其他网站'; }
  }

  function collectEventFromForm(prefix) {
    return {
      title: $(prefix + 'Title').value.trim(),
      brand: $(prefix + 'Brand').value.trim(),
      partner: $(prefix + 'Partner').value.trim() || null,
      type: $(prefix + 'Type').value,
      category: $(prefix + 'Category').value,
      start_date: $(prefix + 'Start').value,
      end_date: $(prefix + 'End').value || null,
      description: $(prefix + 'Desc').value.trim(),
      price_note: $(prefix + 'Price').value.trim() || null,
      source_url: null, // 调用方填写
      order_name: $(prefix + 'Order').value.trim() || null,
      order_hint: null, // 调用方按点单名生成
      origin: 'user',
      source_label: '网友投稿'
    };
  }

  function orderHintFor(name) {
    if (!name) return null;
    if (/美团|饿了么/.test(name)) return '打开 ' + name + ' App 搜索活动';
    return '微信搜索「' + name + '」小程序点单';
  }

  /* ================= 初始化与事件绑定 ================= */
  function setView(view) {
    state.view = view;
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t.getAttribute('data-view') === view;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + view);
    });
    if (view === 'calendar') renderCalendar();
    if (view === 'mine') renderPurchases();
    if (view === 'new') renderNew();
  }

  function initHeader() {
    var now = new Date();
    var weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    $('bigDay').textContent = now.getDate();
    $('bigMeta').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · 星期' + weekNames[now.getDay()];
  }

  function bindEvents() {
    // 顶部导航
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { setView(t.getAttribute('data-view')); });
    });

    // 类型筛选
    $('typeChips').addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      btn.classList.add('active');
      state.typeFilter = btn.getAttribute('data-type');
      renderToday();
    });

    // 品类 + 搜索
    $('categoryFilter').addEventListener('change', function (e) {
      state.categoryFilter = e.target.value;
      renderToday();
    });
    $('searchInput').addEventListener('input', function (e) {
      state.search = e.target.value;
      renderToday();
    });

    // 活动行点击（事件委托：今日列表 + 日期详情共用）
    document.addEventListener('click', function (e) {
      var row = e.target.closest('.event-row');
      if (row) { openDetail(row.getAttribute('data-event-id')); return; }
      var day = e.target.closest('.cal-day');
      if (day) {
        state.selectedDate = day.getAttribute('data-date');
        renderCalendar();
      }
    });

    // 日历翻页与视图切换
    $('calPrev').addEventListener('click', function () {
      if (state.calMode === 'month') {
        state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() - 1, 1);
      } else {
        var m = mondayOf(state.calCursor);
        m.setDate(m.getDate() - 7);
        state.calCursor = m;
      }
      renderCalendar();
    });
    $('calNext').addEventListener('click', function () {
      if (state.calMode === 'month') {
        state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() + 1, 1);
      } else {
        var m = mondayOf(state.calCursor);
        m.setDate(m.getDate() + 7);
        state.calCursor = m;
      }
      renderCalendar();
    });
    document.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        state.calMode = b.getAttribute('data-mode');
        if (state.calMode === 'week') state.calCursor = mondayOf(new Date());
        else state.calCursor = firstOfMonth(new Date());
        renderCalendar();
      });
    });

    // 弹窗开关
    $('openSubmitBtn').addEventListener('click', function () {
      hideError('submitError');
      $('prefillNote').hidden = true;
      openModal('submitModal');
    });
    $('openAddBtn').addEventListener('click', function () {
      hideError('addError');
      $('addStart').value = state.selectedDate;
      openModal('addModal');
    });
    $('openPurchaseBtn').addEventListener('click', function () { openPurchaseForm({}); });
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeModal(b.getAttribute('data-close')); });
    });
    document.querySelectorAll('.modal-backdrop').forEach(function (bd) {
      bd.addEventListener('click', function (e) {
        if (e.target === bd) closeModal(bd.id);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop').forEach(function (bd) {
          if (!bd.hidden) closeModal(bd.id);
        });
      }
    });

    // 登录 / 注册弹窗
    $('authTabLogin').addEventListener('click', function () { setAuthMode('login'); });
    $('authTabRegister').addEventListener('click', function () { setAuthMode('register'); });
    $('authForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!SB || !ONLINE) {
        showError('authError', '登录暂不可用：请先按 README 配置 Supabase。');
        return;
      }
      hideError('authError');
      var email = $('authEmail').value.trim();
      var pw = $('authPassword').value;
      if (!email || !pw) { showError('authError', '请填写邮箱和密码。'); return; }
      if (pw.length < 6) { showError('authError', '密码至少 6 位。'); return; }
      var btn = $('authSubmitBtn');
      btn.disabled = true;
      btn.textContent = authMode === 'login' ? '登录中…' : '注册中…';
      var req = authMode === 'login'
        ? SB.auth.signInWithPassword({ email: email, password: pw })
        : SB.auth.signUp({ email: email, password: pw });
      req.then(function (res) {
        if (res.error) throw res.error;
        if (authMode === 'register' && !(res.data && res.data.session)) {
          // 开启了邮箱确认：注册成功但还没登录，提示去邮箱确认
          setAuthMode('login');
          var ok = $('authOk');
          ok.textContent = '注册成功！请去邮箱点击确认链接，再回来登录。';
          ok.hidden = false;
          return;
        }
        // 登录成功（或注册后直接登录）：onAuthStateChange 会处理同步
        closeModal('authModal');
        $('authForm').reset();
        toast(authMode === 'login' ? '登录成功，欢迎回来' : '注册并登录成功');
      }).catch(function (err) {
        showError('authError', authErrorText(err));
      }).finally(function () {
        btn.disabled = false;
        btn.textContent = authMode === 'login' ? '登录' : '注册';
      });
    });

    // 投稿：从链接预填
    $('prefillBtn').addEventListener('click', function () {
      var url = $('subUrl').value.trim();
      var note = $('prefillNote');
      if (!url) {
        note.textContent = '请先粘贴活动链接。';
        note.hidden = false;
        return;
      }
      try { new URL(url); } catch (e) {
        note.textContent = '链接格式不对，请检查后重试。';
        note.hidden = false;
        return;
      }
      var platform = platformOf(url);
      note.textContent = '已识别来源：' + platform +
        '。浏览器无法直接读取该页面的正文，请手动确认品牌、活动名和日期，核对无误后发布。';
      note.hidden = false;
    });

    // 投稿提交
    $('submitForm').addEventListener('submit', function (e) {
      e.preventDefault();
      hideError('submitError');
      var url = $('subUrl').value.trim();
      if (!url) { showError('submitError', '请填写活动链接。'); return; }
      try { new URL(url); } catch (err) { showError('submitError', '链接格式不对，请检查后重试。'); return; }

      var ev = collectEventFromForm('sub');
      ev.source_url = url;
      ev.order_hint = orderHintFor(ev.order_name);
      if (!ev.brand || !ev.title || !ev.start_date || !ev.description) {
        showError('submitError', '请把品牌、活动名、开始日期和活动简介填完整。');
        return;
      }
      if (ev.end_date && ev.end_date < ev.start_date) {
        showError('submitError', '结束日期不能早于开始日期。');
        return;
      }

      var btn = $('submitBtn');
      btn.disabled = true;
      btn.textContent = '发布中…';
      isDuplicateUrl(url)
        .then(function (dup) {
          if (dup) throw new Error('DUPLICATE');
          return createEvent(ev);
        })
        .then(function (created) { return createSubmission(url, created && created.id); })
        .then(function () { return loadEvents(); })
        .then(function () {
          renderAll();
          closeModal('submitModal');
          $('submitForm').reset();
          toast(ONLINE ? '已发布，所有人都能在日历上看到啦' : '已发布到本地演示日历（配置 Supabase 后可共享给所有人）');
          setView('today');
        })
        .catch(function (err) {
          if (err && err.message === 'DUPLICATE') {
            showError('submitError', '这个链接已经投过了，请换一个链接，或直接在日历里查看已有活动。');
          } else {
            console.warn(err);
            showError('submitError', '发布失败，请检查网络后重试。');
          }
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = '发布到日历';
        });
    });

    // 手动补录提交
    $('addForm').addEventListener('submit', function (e) {
      e.preventDefault();
      hideError('addError');
      var ev = collectEventFromForm('add');
      ev.origin = 'manual';
      ev.source_label = null;
      var url = $('addUrl').value.trim();
      if (url) {
        try { new URL(url); } catch (err) {
          showError('addError', '来源链接格式不对，请检查后重试。');
          return;
        }
        ev.source_url = url;
      }
      ev.order_hint = orderHintFor(ev.order_name);
      if (!ev.brand || !ev.title || !ev.start_date || !ev.description) {
        showError('addError', '请把品牌、活动名、开始日期和活动简介填完整。');
        return;
      }
      if (ev.end_date && ev.end_date < ev.start_date) {
        showError('addError', '结束日期不能早于开始日期。');
        return;
      }
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = '发布中…';
      createEvent(ev)
        .then(function () { return loadEvents(); })
        .then(function () {
          renderAll();
          closeModal('addModal');
          $('addForm').reset();
          toast(ONLINE ? '已补录，所有人都能在日历上看到啦' : '已补录到本地演示日历');
        })
        .catch(function (err) {
          console.warn(err);
          showError('addError', '发布失败，请检查网络后重试。');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = '发布到日历';
        });
    });

    // 购买记录提交
    $('purchaseForm').addEventListener('submit', function (e) {
      e.preventDefault();
      hideError('purchaseError');
      var title = $('purTitle').value.trim();
      var price = parseFloat($('purPrice').value);
      var date = $('purDate').value;
      if (!title || isNaN(price) || price < 0 || !date) {
        showError('purchaseError', '请填写买了什么、价格和购买日期。');
        return;
      }
      var id = $('purId').value;
      var rec = {
        id: id || ('p' + Date.now()),
        event_id: $('purEventId').value || null,
        title: title,
        brand: $('purBrand').value.trim(),
        price: price,
        date: date,
        note: $('purNote').value.trim()
      };
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      savePurchase(rec, !!id)
        .then(function () {
          renderPurchases();
          closeModal('purchaseModal');
          $('purchaseForm').reset();
          toast('已记好');
          setView('mine');
        })
        .catch(function (err) {
          console.warn(err);
          showError('purchaseError', '保存失败，请检查网络后重试。');
        })
        .finally(function () { btn.disabled = false; });
    });

    // 购买记录编辑 / 删除（事件委托）
    $('purchaseList').addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-edit-purchase]');
      var delBtn = e.target.closest('[data-del-purchase]');
      if (editBtn) {
        var rec = null;
        state.purchases.forEach(function (p) { if (p.id === editBtn.getAttribute('data-edit-purchase')) rec = p; });
        if (rec) openPurchaseForm(rec);
      }
      if (delBtn) {
        var delId = delBtn.getAttribute('data-del-purchase');
        if (window.confirm('确定删除这条入手记录吗？')) {
          deletePurchase(delId)
            .then(function () {
              renderPurchases();
              toast('已删除');
            })
            .catch(function (err) {
              console.warn(err);
              toast('删除失败，请检查网络后重试');
            });
        }
      }
    });
  }

  /* ================= 启动 ================= */
  initHeader();
  bindEvents();
  if (!ONLINE) { $('demoBanner').hidden = false; }
  renderAuthUI();
  initAuth();
  loadEvents().then(function () { renderAll(); });
})();
