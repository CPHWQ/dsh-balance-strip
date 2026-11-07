// 在个人主页点开「插件」标签，列出自己名下的条目（用来确认有没有重复）。
// 用法：node tools/cdp.mjs --file tools/club-tab.js --await
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hits = [...document.querySelectorAll("div,button,span,a")].filter((n) => {
    const t = (n.textContent || "").trim();
    return /^插件\s*\d*$/.test(t) && n.children.length <= 3;
  });
  if (!hits.length) return "no tab found";
  const tab = hits[hits.length - 1];
  tab.click();
  await sleep(2500);
  const text = document.body.innerText.replace(/\s+/g, " ");
  const i = text.indexOf("插件 ");
  return JSON.stringify({
    clicked: tab.textContent.trim(),
    section: text.slice(Math.max(0, i - 80), i + 700),
  });
})();
