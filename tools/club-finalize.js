// 收尾：4580 补齐描述/安装命令/许可，归档重复的 4579，输出最终状态。
(async () => {
  const BASE = "https://deepseek.club";
  const payload = {
    id: 4580,
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
  const post = async (proc, body) => {
    const r = await fetch(BASE + "/api/trpc/" + proc, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: body }),
    });
    return r.status + " " + (await r.text()).slice(0, 160);
  };
  const upd = await post("plugin.update", payload);
  const del = await post("plugin.delete", { id: 4579 });

  const r = await fetch(
    BASE + "/api/trpc/plugin.listMine?batch=1&input=" + encodeURIComponent(JSON.stringify({ "0": { json: {} } })),
    { credentials: "include" }
  );
  const j = (await r.json())[0];
  const items = (j.result && j.result.data && j.result.data.json && j.result.data.json.items) || [];
  return JSON.stringify(
    {
      update: upd,
      deleteDup: del,
      mine: items.map((i) => ({ id: i.id, slug: i.slug, status: i.status, v: i.currentVersion })),
    },
    null,
    1
  );
})();
