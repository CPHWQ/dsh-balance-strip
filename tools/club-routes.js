// 从前端已加载的 JS 里抽取所有 tRPC procedure 名，避免瞎猜接口。
// 用法：node tools/cdp.mjs --file tools/club-routes.js --await
(async () => {
  const urls = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => /\.js(\?|$)/.test(u));
  const seen = new Set();
  for (const u of urls.slice(0, 80)) {
    try {
      const t = await (await fetch(u)).text();
      const m = t.match(/\b(plugin|user|auth|category|upload|skill)\.[a-zA-Z][a-zA-Z0-9_]{1,40}/g) || [];
      m.forEach((x) => seen.add(x));
    } catch (e) {}
  }
  const names = [...seen].sort();
  return JSON.stringify({ scripts: urls.length, count: names.length, names }, null, 1);
})();
