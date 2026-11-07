// 把 4579 的 slug 改回规范值，顺带补齐安装命令 / 许可证 / 详细描述。
// 用法：node tools/cdp.mjs --file tools/club-apply.js --await
var ID = Number(globalThis.__CLUB_ID || 4578);
(async () => {
  const BASE = "https://deepseek.club";
  const payload = {
    id: ID,
    slug: "dsh-balance-strip",
    name: "余额胶囊 Balance Strip",
    summary:
      "在 DSH 会话页顶部标签行右侧常驻一枚胶囊：余额、今日已用（按余额下降估算）、峰/谷时段，一眼可见，不用点击。层级低于系统弹窗，弹窗打开时会被盖住。",
    summaryEn:
      "An always-visible pill on the DSH session tab bar showing balance, today's spend (estimated) and the peak / off-peak pricing window. It sits below system dialogs, so modals cover it.",
    description: [
      "## 它是什么",
      "",
      "在 DSH 会话页顶部标签行右侧常驻一枚胶囊，显示三样东西：账户余额、今日已用（估算）、当前是峰还是谷。不用点击、不用悬停。",
      "",
      "## 阅读方式",
      "",
      "- **余额**：行内唯一的强信息，来自账户余额接口。",
      "- **今日 ¥x.xx 估**：按余额下降估算，不是账单。只在余额减少时记账，充值与赠金只移动基线，跨天清零。",
      "- **峰 / 谷**：北京时间 00:30–08:30 为谷（绿），其余为峰（红）。整枚胶囊的底色与描边跟着切换。",
      "",
      "## 形态",
      "",
      "- 位置锚定「对话」标签：量的是文字框而不是容器，字号跟随标签字号，窗口缩放/最大化都不漂。",
      "- 右边缘对齐底部输入框右缘，数字变长时向左撑开，右边缘不动。",
      "- 深浅底色自适应，弹窗打开时会被弹窗盖住（z-index 40）。",
      "",
      "## 安装",
      "",
      "```sh",
      "dsh plugin --profile web add dsh-balance-strip",
      "```",
    ].join("\n"),
    hubType: "dsh",
    currentVersion: "0.1.2",
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
    body: JSON.stringify({ json: payload }),
  });
  const text = (await r.text()).slice(0, 600);

  const chk = await fetch(
    BASE + "/api/trpc/plugin.getByIdForEdit?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: { id: ID } } })),
    { credentials: "include" }
  );
  const cj = (await chk.json())[0];
  const d = cj.result && cj.result.data && cj.result.data.json;
  return JSON.stringify({ update: r.status + " " + text, now: d && { slug: d.slug, status: d.status, version: d.currentVersion } }, null, 1);
})();
