/* 联名日历 · 前端配置
 *
 * 上线前把下面两项换成你自己的 Supabase 项目信息：
 *   1. 登录 Supabase → 打开你的项目 → Settings → API
 *   2. 把 Project URL 填到 SUPABASE_URL，把 anon public key 填到 SUPABASE_ANON_KEY
 *
 * 注意：
 * - anon key 是公开可用的前端密钥（配合行级安全策略 RLS 使用），
 *   可以放在前端代码里；千万不要把 service_role key 放到这里。
 * - 登录用 Supabase Auth（邮箱 + 密码），新项目默认已开启，不用额外配置；
 *   购买记录登录后会同步到云端 purchases 表（见 supabase/schema.sql）。
 * - 保持下面两个占位符不变时，网站会进入「演示模式」：
 *   显示内置的本地示例数据，投稿和新增只保存在本浏览器，不会报错白屏。
 */
window.LMRL_CONFIG = {
  SUPABASE_URL: "https://nhdbpmdivaptjzwjdayu.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZGJwbWRpdmFwdGp6d2pkYXl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NjcyNzAsImV4cCI6MjExMTI0MzI3MH0.lFcZ9K5ImiKeBSMqsnoi-491Wqnhj0-JDKiBMDGw_R8"
};
