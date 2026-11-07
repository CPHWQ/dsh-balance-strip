// 把插件库里已有条目的版本号改到指定值（默认读 globalThis.__CLUB_VERSION）。
var ID = Number(globalThis.__CLUB_ID || 4580);
var VERSION = String(globalThis.__CLUB_VERSION || "0.1.3");
(async () => {
  const BASE = "https://deepseek.club";
  const base = {
    id: ID,
    slug: "dsh-balance-strip",
    name: "余额胶囊 Balance Strip",
    summary:
      "在 DSH 会话页顶部标签行右侧常驻一枚胶囊：余额、今日已用（按余额下降估算）、峰/谷时段，一眼可见，不用点击。层级低于系统弹窗，弹窗打开时会被盖住。",
    summaryEn:
      "An always-visible pill on the DSH session tab bar showing balance, today's spend (estimated) and the peak / off-peak pricing window. It sits below system dialogs, so modals cover it.",
    hubType: "dsh",
    currentVersion: VERSION,
    sourceUrl: "https://github.com/CPHWQ/dsh-balance-strip",
    websiteUrl: "https://www.npmjs.com/package/dsh-balance-strip",
    installCommand: "dsh plugin --profile web add dsh-balance-strip",
    license: "MIT",
    categorySlug: "ui",
  };
  const r = await fetch(BASE + "/api/trpc/plugin.update", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: base }),
  });
  const text = (await r.text()).slice(0, 200);
  const chk = await fetch(
    BASE + "/api/trpc/plugin.getByIdForEdit?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: { id: ID } } })),
    { credentials: "include" }
  );
  const cj = (await chk.json())[0];
  const d = cj.result && cj.result.data && cj.result.data.json;
  return JSON.stringify({ update: r.status + " " + text, now: d && { slug: d.slug, status: d.status, version: d.currentVersion } }, null, 1);
})();
