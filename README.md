# 联名日历 · 独立部署版

每天的奶茶咖啡联名与优惠活动，一本大家共享的日历。

这是联名日历的可部署版本（独立代码，不依赖 Muse）：静态前端 + Supabase 免费数据库。
部署上线后，所有人打开同一个网址，看到的是同一本日历；任何人投稿的活动，所有人都能看到。

## 功能

- **今日活动**：今天进行中的联名 / 买一送一活动，按结束时间排序，今日截止的突出提醒；支持按类型（联名 / 优惠）、品类（奶茶 / 咖啡 / 综合）筛选和关键词搜索
- **纵览日历**：月视图 / 周视图切换，日期圆点按类型着色（联名红、优惠绿、网友投稿黄），点开日期看当天全部活动；可手动补录活动
- **我购买的**：从活动详情点「我买了」记价格、日期、备注，也可手动记、编辑、删除，汇总总花费
- **投稿一个活动**：贴微博 / 小红书 / 公众号 / 新闻链接，确认信息后一键发布，立即登上共享日历并带「网友投稿」标记；重复链接会被拦下
- **登录与同步**：邮箱 + 密码注册/登录（Supabase Auth，免费），登录后购买记录同步到云端，换设备也能看到；不登录也能以游客模式使用，购买记录只存本浏览器
- **每天自动 AI 搜集**：GitHub Actions 每天早上 8 点自动跑：Tavily 免费搜索 + Gemini 免费版整理，新活动自动写进共享日历（按 README 开启后生效；不开启也不影响网站使用）
- 每个活动带来源链接和点单入口；微信小程序无法从网页直接跳转，点单入口做成标注名称的入口牌，提示在微信里搜对应小程序

## 技术栈（全部免费，不用构建步骤）

- 前端：`index.html` + `styles.css` + `app.js`，纯静态，直接部署
- 数据：Supabase 免费版 Postgres（`supabase/schema.sql` 建表 + RLS 策略，`supabase/seed.sql` 种子活动）
- 登录：Supabase Auth（邮箱 + 密码，免费），购买记录按用户存云端同步
- 自动搜集：GitHub Actions 定时任务（公开仓库免费不限分钟）+ Tavily 搜索免费额度 + Google Gemini API 免费版，见 `scripts/collect.mjs`
- 部署：Vercel 免费版（也可以用任何静态托管：Netlify、GitHub Pages、Cloudflare Pages 等）

## 本地预览

```bash
cd lian-ming-ri-li-deploy
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

没有配置 Supabase 时，网站会进入**演示模式**：显示内置的本地示例数据（与种子活动相同），投稿和新增只保存在本浏览器，不会白屏报错。页面顶部会有黄色提示条说明。

## 上线步骤

### 第 1 步：注册 Supabase 并建项目（免费）

1. 打开 https://supabase.com ，用 GitHub 账号登录（没有 GitHub 账号就先注册一个，免费）。
2. 点 **New project**，随便起个名字（如 `lian-ming-ri-li`），设一个数据库密码（记下来，以后用不到但别丢），地区选离中国近的（如 Singapore / Tokyo），点 Create。
3. 等一两分钟，项目建好后，点左侧 **SQL Editor** → **New query**：
   - 先把 `supabase/schema.sql` 的全部内容粘贴进去，点 **Run**（建 `events`、`submissions`、`purchases` 三张表和行级安全策略；已跑过旧版 schema 的再跑一次也没关系，文件是幂等的，会自动补上新表）。
   - 再新建一个 query，把 `supabase/seed.sql` 的全部内容粘贴进去，点 **Run**（导入首批 8 条真实活动）。
4. 点左侧 **Settings → API**，复制两个值备用：
   - **Project URL**（如 `https://abcdefghijk.supabase.co`）
   - **anon public key**（很长的一串，以 `eyJ` 开头）
   
   ⚠️ 只用 anon key，千万不要把 `service_role` key 放到前端代码里。

### 第 2 步：把代码传到 GitHub

1. 在 GitHub 上新建一个仓库（如 `lian-ming-ri-li`），不要勾选 README（本地已经有了）。
2. 把本目录推送上去：
   ```bash
   git init
   git add .
   git commit -m "联名日历独立部署版 v1"
   git branch -M main
   git remote add origin https://github.com/你的用户名/lian-ming-ri-li.git
   git push -u origin main
   ```

### 第 3 步：填入 Supabase 配置

打开 `config.js`，把两项占位符换成第 1 步复制的真实值，提交并推送：

```js
window.LMRL_CONFIG = {
  SUPABASE_URL: "https://abcdefghijk.supabase.co",  // 你的 Project URL
  SUPABASE_ANON_KEY: "eyJ..."                 // 你的 anon public key
};
```

anon key 是公开可用的前端密钥（配合 RLS 策略使用），放在前端代码里是 Supabase 官方推荐的做法，不用担心。

### 第 4 步：部署到 Vercel（免费）

1. 打开 https://vercel.com ，用 GitHub 账号登录。
2. 点 **Add New → Project**，选择刚才的 GitHub 仓库，点 **Import**。
3. Framework Preset 选 **Other**（纯静态，不用构建），其他保持默认，点 **Deploy**。
4. 一两分钟后会得到一个网址（如 `https://lian-ming-ri-li.vercel.app`），发给朋友就能一起用了。

以后改代码：往 GitHub 推新提交，Vercel 会自动重新部署。

## 登录功能

顶栏有「登录」按钮，点开可以注册 / 登录（邮箱 + 密码）。登录后：

- 购买记录存在云端 `purchases` 表，换设备、换浏览器也能看到；
- 首次登录时，浏览器里已有的购买记录会一次性上传到云端（按活动 + 日期 + 价格 + 备注去重，不会重复）；
- 退出登录后，页面回到游客模式，只显示本浏览器的本地记录，云端记录不受影响；
- 看日历、投稿、补录不需要登录，任何人都能看、能投。

开启说明：Supabase 新项目默认就开启了邮箱登录，不用额外配置，跑完 `schema.sql`（含 `purchases` 表）即可用。

两个可能需要调整的设置（都在 Supabase 后台，位置以当前界面为准）：

- **确认邮件**：默认开启时，用户注册后要去邮箱点击确认链接才能登录。嫌麻烦可以在 Dashboard → Authentication → Providers → Email 里关掉「Confirm email」，注册后直接能登录（安全性低一点，但这个站没有敏感操作，可以接受）。
- **确认邮件的跳转地址**：确认链接会跳回项目的 Site URL。部署后请在 Authentication → URL Configuration 里把 Site URL 改成你的 Vercel 网址，否则用户点确认链接可能跳到 localhost 打不开。

## 自动搜集设置（全免费，不用绑卡）

每天北京时间 08:00，GitHub Actions 自动运行 `scripts/collect.mjs`：Tavily 搜最近一周的奶茶 / 咖啡联名新闻 → Gemini 免费版整理成活动 → 严格校验（品牌、活动名、来源链接缺一不可，来源链接必须来自搜索原文，绝不编造）+ 去重后写入共享日历。

### 需要注册的两个免费服务

1. **Tavily**（搜索）：打开 https://tavily.com 注册，登录后在 Dashboard 找到 API key。
2. **Google AI Studio**（模型）：打开 https://aistudio.google.com ，用 Google 账号登录，点 **Get API key** 创建一个 key。免费版不用绑卡、不用开通结算。

### 填到 GitHub Secrets

仓库页面 → Settings → Secrets and variables → Actions → **New repository secret**，逐个新建这 4 个：

| Secret 名 | 去哪里拿 |
| --- | --- |
| `TAVILY_API_KEY` | Tavily Dashboard 的 API key |
| `GEMINI_API_KEY` | Google AI Studio 的 API key |
| `SUPABASE_URL` | Supabase 项目 Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 项目 Settings → API → service_role key |

⚠️ `service_role` key 拥有数据库的全部权限，只能放在 GitHub Secrets 里，绝不能出现在前端代码、Git 仓库或聊天记录里。

### 手动触发测试一次

配好 Secrets 后不用等到明天早上：仓库页面 → **Actions** → 左侧选 **每日搜集联名情报** → **Run workflow**。等一两分钟，看日志确认写入了几条新活动，再打开网站检查。

本地也可以先模拟测试（不调任何 API、不写库）：

```bash
node scripts/collect.mjs --mock --dry-run
```

### 费用说明（2026-11-19 核实，额度以官方页面为准）

全免费路线不需要绑卡、不需要付费，所有服务都有免费额度：

- **Tavily**：免费版每月 1000 credits，不用绑卡；basic 搜索 1 credit/次。本项目每天 4 条查询，每月约 120 次，远在额度内。额度用完当月停搜，下月 1 号重置，网站本身不受影响。
- **Gemini API 免费版**：不用绑卡；本项目每天只调 1 次，远在免费额度内。Google 不再公布固定限额数字，具体以 AI Studio 里显示的为准。免费版提交的内容可能被 Google 用于改进服务，不要在搜集里放隐私内容（本项目只搜公开新闻，没有隐私）。
- **GitHub Actions**：公开仓库的标准 runner 免费不限分钟；私有仓库每月免费额度也远够每天跑几分钟。
- **Supabase / Vercel**：免费版够用。

官方页面：Tavily https://tavily.com 、Google AI Studio https://aistudio.google.com 、GitHub Actions 计费说明见 GitHub 官方文档。

### 没配 key 时会怎样

完全不影响网站使用：定时任务会因缺少 key 失败退出，但网站照常打开，日历靠大家投稿和手动补录更新。什么时候配好 key，下一次定时运行就自动开始搜集。

### 免费额度不够用怎么办

Tavily 额度用完的当月、或者 Gemini 临时限流，自动搜集会暂停（日志里能看到原因），下月重置或第二天自动恢复。过渡期靠下面这个零 key 备选 + 大家投稿，日历不会断更。

## 零 key 备选：RSS + 关键词

不用任何 key、不用注册任何账号的兜底办法，覆盖面和准确率比 AI 搜集低一些，但零成本、零配置：

1. **订阅新闻 RSS**：用任意 RSS 阅读器订阅 Google News 的关键词搜索源，例如 `https://news.google.com/rss/search?q=奶茶联名&hl=zh-CN&gl=CN`，关键词换成「咖啡联名」「买一送一」「新品限定」等，多订几个。
2. **订阅品牌动态**：用 RSSHub 公共实例（https://rsshub.app）订阅品牌官方微博 / 公众号的更新（注：公共实例可能不稳定、随时可能限流，仅作备选）。
3. **看到新联名就投稿**：打开网站，点「投稿一个活动」，把链接贴进来确认发布，立即登上共享日历。

平时也可以这样用：AI 搜集负责大面，RSS 负责补漏，小众品牌靠大家投稿，三条线一起，日历基本不会漏。

## 诚实说明

- **自动搜集可能整理出错**：模型再严格也可能把日期、价格理解错，每个活动都带了来源链接，点开原文核对一下再冲；发现错的请到 Supabase 后台 Table Editor 里改。
- **小众品牌搜不到**：搜索引擎覆盖不到的小众奶茶、地方品牌，AI 搜不到很正常，靠大家投稿补，这是投稿功能存在的意义。
- **搜集频率**：每天一次，不是实时的；正在进行的大促、限时活动以官方页面为准。

## 其他说明

- **购买记录**：登录后存在云端 `purchases` 表，按用户隔离（RLS 策略：每个人只能读写自己的）；未登录时存在本浏览器 localStorage。首次登录会自动把本地记录上传云端（去重）。
- **投稿识别**：浏览器端无法直接跨域抓取微博 / 小红书 / 公众号页面，所以投稿是「粘贴链接后按域名识别平台 + 用户确认补填」的诚实流程，不假装能自动读到正文。后续可在服务端（Edge Function）实现真正的链接解析。
- **数据安全**：日历的 RLS 策略只开放「所有人可读、所有人可插入」，不开放修改和删除，避免有人恶意清空共享日历。改错、删错请到 Supabase 后台 Table Editor 处理。
- **种子活动**：首批 8 条全部来自真实新闻报道（2026-11-19 核实，品牌、活动名、日期、价格、来源链接均可查），过期活动不会出现在「进行中」。

## 文件结构

```
lian-ming-ri-li-deploy/
├── index.html          前端页面（三个页面 + 弹窗，含登录弹窗）
├── styles.css          撕页台历风格样式
├── app.js              全部前端逻辑（数据读写、渲染、表单、登录与云端同步）
├── config.js           Supabase 配置（上线前填真实值）
├── .env.example        环境变量说明（含自动搜集的 GitHub Secrets 清单）
├── vercel.json         Vercel 部署配置
├── .github/
│   └── workflows/
│       └── daily-collect.yml   每天 08:00 自动搜集的 GitHub Actions 定时任务
├── scripts/
│   └── collect.mjs     自动搜集脚本（Tavily 搜索 + Gemini 整理 + 校验去重后写库）
├── supabase/
│   ├── schema.sql      建表 + RLS 策略（events / submissions / purchases）
│   └── seed.sql        首批 8 条真实种子活动
└── README.md           本文件
```
