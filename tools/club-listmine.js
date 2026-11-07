// 列出自己名下的插件条目（plugin.listMine），用于核对重复提交。
// 用法：node tools/cdp.mjs --file tools/club-listmine.js --await
(async () => {
  const BASE = "https://deepseek.club";
  const tries = [{}, { page: 1, pageSize: 20 }, { status: "all" }];
  const out = [];
  for (const body of tries) {
    const r = await fetch(BASE + "/api/trpc/plugin.listMine?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: body } })), {
      credentials: "include",
    });
    const t = await r.text();
    out.push(JSON.stringify(body) + " -> " + r.status + " " + t.slice(0, 700));
    if (r.status === 200) break;
  }
  return out.join("\n\n");
})();
