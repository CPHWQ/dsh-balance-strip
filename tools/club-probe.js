// 探测 deepseek.club 有没有「撤回/删除自己提交」的接口。
// 用法：node tools/cdp.mjs --file tools/club-probe.js --await
(async () => {
  const BASE = "https://deepseek.club";
  const out = {};
  const names = [
    "plugin.delete", "plugin.remove", "plugin.withdraw", "plugin.cancel",
    "plugin.myPlugins", "plugin.mySubmissions", "plugin.submissions", "plugin.mine",
    "submission.list", "submission.delete",
  ];
  for (const name of names) {
    try {
      const r = await fetch(BASE + "/api/trpc/" + name, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { id: 4578 } }),
      });
      const t = (await r.text()).slice(0, 200);
      out[name] = r.status + " " + t;
    } catch (e) {
      out[name] = "ERR " + e.message;
    }
  }
  return JSON.stringify(out, null, 1);
})();
