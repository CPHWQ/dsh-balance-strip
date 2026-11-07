// 读出一条自己的提交详情，再把 slug 改回规范值（plugin.update）。
// 用法：node tools/cdp.mjs --file tools/club-fixslug.js --await
(async () => {
  const BASE = "https://deepseek.club";
  const q = (proc, body) =>
    fetch(BASE + "/api/trpc/" + proc + "?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: body } })), {
      credentials: "include",
    });

  const r = await q("plugin.getByIdForEdit", { id: 4579 });
  const detail = (await r.json())[0];
  const d = detail.result && detail.result.data && detail.result.data.json;
  return JSON.stringify({ status: r.status, detail: d || detail }, null, 1).slice(0, 1800);
})();
