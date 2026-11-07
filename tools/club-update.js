// 更新 deepseek.club 上已有条目的版本号：先试着再提交一次，看是覆盖还是报重复。
// 用法：node tools/cdp.mjs --file tools/club-update.js --await
(async () => {
  const BASE = "https://deepseek.club";
  const payload = {
    name: "余额胶囊 Balance Strip",
    slug: "dsh-balance-strip",
    summary:
      "在 DSH 会话页顶部标签行右侧常驻一枚胶囊：余额、今日已用（按余额下降估算）、峰/谷时段，一眼可见，不用点击。层级低于系统弹窗，弹窗打开时会被盖住。",
    categorySlug: "ui",
    summaryEn:
      "An always-visible pill on the DSH session tab bar showing balance, today's spend (estimated) and the peak / off-peak pricing window. It sits below system dialogs, so modals cover it.",
    hubType: "dsh",
    authorName: "CPHWQ",
    currentVersion: "0.1.2",
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
  return r.status + " " + text.slice(0, 900);
})();
