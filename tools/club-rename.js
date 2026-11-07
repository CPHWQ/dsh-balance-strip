// 再删一次 4578（看是否为硬删除），释放 slug 后把 4580 的 slug 改回规范值。
(async () => {
  const BASE = "https://deepseek.club";
  const post = async (proc, body) => {
    const r = await fetch(BASE + "/api/trpc/" + proc, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: body }),
    });
    return r.status + " " + (await r.text()).slice(0, 200);
  };
  const mine = async () => {
    const r = await fetch(
      BASE + "/api/trpc/plugin.listMine?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: {} } })),
      { credentials: "include" }
    );
    const j = (await r.json())[0];
    const items = (j.result && j.result.data && j.result.data.json && j.result.data.json.items) || [];
    return items.map((i) => i.id + ":" + i.slug + ":" + i.status).join(" | ");
  };
  const del = await post("plugin.delete", { id: 4578 });
  const afterDel = await mine();
  const payload = {
    id: 4580,
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
  const upd = await post("plugin.update", payload);
  const afterUpd = await mine();
  return JSON.stringify({ del, afterDel, upd, afterUpd }, null, 1);
})();
