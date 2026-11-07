// 在 deepseek.club 页面上下文里提交插件（同源 fetch，浏览器自动带登录态）。
// 用法：node tools/cdp.mjs --file tools/club-submit.js --await
(async () => {
  const BASE = "https://deepseek.club";
  const payload = {
    name: "余额胶囊 Balance Strip",
    slug: "dsh-balance-strip",
    summary:
      "在 DSH 会话页顶部标签行右侧常驻一枚胶囊：余额、今日已用（按余额下降估算）、峰/谷时段，一眼可见，不用点击。",
    categorySlug: "ui",
    summaryEn:
      "An always-visible pill on the DSH session tab bar showing balance, today's spend (estimated) and the peak / off-peak pricing window.",
    hubType: "dsh",
    authorName: "CPHWQ",
    currentVersion: "0.1.0",
    sourceUrl: "https://github.com/CPHWQ/dsh-balance-strip",
    websiteUrl: "https://www.npmjs.com/package/dsh-balance-strip",
  };
  const r = await fetch(BASE + "/api/trpc/plugin.submit", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: payload }),
  });
  const text = await r.text();
  return r.status + " " + text.slice(0, 1500);
})();
