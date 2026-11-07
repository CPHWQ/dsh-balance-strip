// 先试「整包 payload + status」让 4578 复活；失败则试 submit 带 id（看是否复用旧记录）。
var ID = Number(globalThis.__CLUB_ID || 4578);
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
    currentVersion: "0.1.2",
    sourceUrl: "https://github.com/CPHWQ/dsh-balance-strip",
    websiteUrl: "https://www.npmjs.com/package/dsh-balance-strip",
    categorySlug: "ui",
  };
  const post = async (proc, body) => {
    const r = await fetch(BASE + "/api/trpc/" + proc, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: body }),
    });
    return r.status + " " + (await r.text()).slice(0, 240);
  };
  const mine = async () => {
    const r = await fetch(
      BASE + "/api/trpc/plugin.listMine?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: {} } })),
      { credentials: "include" }
    );
    const j = (await r.json())[0];
    const items = (j.result && j.result.data && j.result.data.json && j.result.data.json.items) || [];
    return items.map((i) => i.id + ":" + i.slug + ":" + i.status + ":" + i.currentVersion).join(" | ");
  };

  const a = await post("plugin.update", Object.assign({ status: "pending_review" }, base));
  const afterA = await mine();
  let b = "skipped";
  let afterB = "";
  if (afterA.indexOf("archived") !== -1) {
    b = await post("plugin.submit", base);
    afterB = await mine();
  }
  return JSON.stringify({ update: a, afterUpdate: afterA, submit: b, afterSubmit: afterB }, null, 1);
})();
