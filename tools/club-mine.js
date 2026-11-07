// 核对 deepseek.club 上的条目：数一下自己名下还有几条（删重复用）。
// 用法：node tools/cdp.mjs --file tools/club-mine.js --await
(async () => {
  const BASE = "https://deepseek.club";
  const before = (document.body.innerText.match(/插件\s*(\d+)/) || [])[1];

  // 试几种删除参数形态，看哪一种真的生效
  const shapes = [{ id: 4578 }, { pluginId: 4578 }, { ids: [4578] }, { slug: "dsh-balance-strip", id: 4578 }];
  const results = [];
  for (const s of shapes) {
    const r = await fetch(BASE + "/api/trpc/plugin.delete", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: s }),
    });
    results.push(JSON.stringify(s) + " -> " + r.status + " " + (await r.text()).slice(0, 120));
  }
  return JSON.stringify({ before, results }, null, 1);
})();
