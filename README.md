# 余额胶囊 · dsh-balance-strip

在 DeepSeek Harness 会话页顶部标签行右侧，常驻一枚小胶囊：**余额、今日已用（估算）、峰/谷**，一眼看完，不用点、不用悬停、不用打开别的面板。界面语言是中文时显示汉字，其它语言自动换成英文。

> 非官方社区插件，与 DeepSeek 官方无隶属关系，也未获其背书。

[![npm](https://img.shields.io/npm/v/dsh-balance-strip.svg)](https://www.npmjs.com/package/dsh-balance-strip)
[![license](https://img.shields.io/npm/l/dsh-balance-strip.svg)](LICENSE)

源码与问题反馈：<https://github.com/CPHWQ/dsh-balance-strip> · npm：<https://www.npmjs.com/package/dsh-balance-strip>

## 预览

```text
  对话   上下文   上下文   编队   …            ┌───────────────────────────────────┐
  ─────                                        │ 今日 ¥0.40 估 │ 余额 ¥89.24   峰 │
                                               └───────────────────────────────────┘

  低谷时段（北京时间 00:30–08:30）整枚胶囊转绿，字换成「谷」：

  ┌───────────────────────────────────┐
  │ 今日 ¥0.40 估 │ 余额 ¥89.24   谷 │
  └───────────────────────────────────┘

  界面语言不是中文时自动换成英文：Balance / Today ≈ / Peak / Off-peak
```

- 贴在**标签行右侧**：垂直按「对话」两个字的中线对齐，字号直接取标签的 `computed font-size`，所以改界面字号、换缩放比例、最大化/还原窗口，它都跟着走。
- 右边缘**始终贴住会话栏的右边界**，不跟窗口边缘走——窗口变宽、右侧留白变多，它不会跟着漂。
- 胶囊底色与描边跟随峰谷：峰偏红、谷偏绿，字色与底色是同一套变量，深色主题下自动换成另一组值。
- 整枚胶囊 `pointer-events: none`，点哪儿都穿透到底下的真实界面，不会挡输入框。

## 显示内容

| 读数 | 含义 |
| --- | --- |
| **余额** | 充值余额 + 赠金，按币种合计（优先 CNY）。符号跟着账户币种走：CNY ¥ / USD $ / EUR € / JPY JP¥ …，认不出的币种直接显示代码（如 SGD 12.34）。 |
| **今日** | 今天零点（北京时间）以来的余额下降额，**估算值**，所以数字后跟一个上标的「估」。账户币种变了（切账号）会清零重算，不会把两种钱加在一起。 |
| **峰 / 谷** | 当前处于 DeepSeek 的哪一个计价时段（谷 00:30–08:30，峰 08:30–次日 00:30）。 |

## 安装

环境要求：

- DeepSeek Harness `0.2.1-rc.2` 至 `0.2.x`（写进 `engines.dsh`，不兼容的版本会拒绝加载而不是半加载）。
- 已登录 DeepSeek 账户，**或** profile 里配了 `DEEPSEEK_API_KEY` 凭据。两者都没有时会显示 `余额 —`，其它读数照常。

从 npm 安装：

```sh
dsh plugin --profile web add dsh-balance-strip
```

包是纯 JavaScript，没有构建步骤，因此不需要 `allowBuilds` 授权。

从 GitHub 安装（npm 装不上时的备选，适合跟着主干走）：

```sh
dsh plugin --profile web add github:CPHWQ/dsh-balance-strip
```

若你的网络访问 GitHub 需要代理，先给 git 配好代理（`git config --global http.proxy http://127.0.0.1:7897`，端口按你自己的客户端改）再安装。

从本地 checkout 安装：

```sh
dsh plugin --profile web add link:/绝对路径/dsh-balance-strip
```

`web` 是 CLI Web 应用用的 profile 名，桌面版通常叫 `desktop`（桌面版的 profile 由 Electron 应用独占，CLI 改不了，请在应用的插件页里装，或让助手用它内置的插件工具装）。

**装完要重启客户端（含系统托盘退出）**：插件往页面里注入脚本的通道只在宿主启动时收集一次，热装上的当次窗口不会出现胶囊。之后改样式就不用重启了——见下面「热替换」。

### 和别的余额类插件共存

同一块地方不要装两份。本插件与 `dsh-whale-widget`（小鲸鱼）位置不同但都显示余额，两个都开会看到两个读数，关掉其中一个即可。

### 卸载

```sh
dsh plugin --profile web remove dsh-balance-strip
```

桌面版在插件页里关掉开关。插件不写任何全局状态，卸载即完全还原；`$DSH_HOME/.dsh-strip.json` 是它唯一的落盘文件（今日累计与上一次余额），可以直接删。

## 工作原理

一半在宿主、一半在页面：

1. **宿主**（`lib/index.js`）注册两条路由，并把一段内联脚本注入页面：
   - `GET /dsh-strip/data.json` —— 现读余额、算今日已用、给峰谷与时段，返回 JSON；
   - `GET /dsh-strip/strip.js` —— 现读 `assets/strip.js` 的内容返回（不缓存），所以改完样式一次请求就生效。
2. **页面**（`assets/strip.js`）每 20 秒拉一次 `data.json`，画那枚胶囊。失败时间隔缩到 6 秒重试。

余额两条来源，按顺序试：

| 顺序 | 来源 | 说明 |
| --- | --- | --- |
| 1 | `DEEPSEEK_API_KEY` 凭据 → `GET https://api.deepseek.com/user/balance` | 取 `balance_infos[].total_balance`。 |
| 2 | `deepseekAccount` 服务（账号登录态） | 充值钱包 + 赠金钱包按币种求和，与官方的 `total_balance` 同口径。头、令牌、401 清理都由该服务负责。 |

### 热替换

`data.json` 里的 `build` 是 `assets/strip.js` 的 mtime，每次请求现算。页面发现自己手里的 `build` 和返回的不一样，就拆掉旧胶囊、删掉自己的 `<script>`、重新加载 `strip.js?v=<build>`。所以**改前端不用重启、不用刷新页面**，20 秒内自己换过来。

## 口径与误差

- **今日已用是估算的，不是账单。** 插件没有账单接口，只能每 60 秒采一次余额，把下降额记进当天。
- 充值与赠金**只移动基线**，不会记成负数消费。
- 采样间隔内的多次小额请求会被合并；插件没跑的那段时间不计入。
- 同一天跨过北京时间零点会清零重算。
- 想看准确到每一次请求的账，得读会话事件算 token——那是另一件事，这一版不做。

## 隐私与安全

- `data.json` **没有认证**，但只服务本机：非回环 socket 的对端、以及 `sec-fetch-site: cross-site` 的请求一律 403。同一台机器上的其它进程仍能读到余额数字。
- 路由只返回金额、币种、时段与估算值：没有账户 ID、没有资料、没有令牌、没有流水。
- 余额查询走的是宿主已有的凭据/账号服务，插件自己不落盘任何凭据。
- 页面脚本不加载远程内容、不用 `eval`、不上报遥测。
- 如果你把 Harness 公开部署到局域网/公网，胶囊在这些远端页面上会显示 `余额 —`（被上面那条规则挡住了），这是有意为之。

## 兼容性

| 组件 | 支持范围 |
| --- | --- |
| DeepSeek Harness | `>=0.2.1-rc.2 <0.3.0`（`engines.dsh`） |
| 界面 | 桌面版 Web GUI；CLI `web` profile 同样可用 |
| 余额来源 | `DEEPSEEK_API_KEY` 凭据 或 `deepseekAccount` 账户服务，二者其一 |
| Node（仅开发） | `^22.19.0` 或 `>=24.0.0` |
| 运行时依赖 | 无 |

## 故障排查

| 现象 | 检查 |
| --- | --- |
| 完全没有胶囊，控制台也不报错 | 多半是装完没重启客户端。注入通道只在宿主启动时收集一次，托盘退出重开即可。 |
| 显示 `余额 —` + 「同步中」 | 冷启动第一轮还没回来，等 6～20 秒；一直不动就是两条来源都不可用，看悬停提示里的原因码。 |
| 悬停提示 `no-api-key / no-account-service` | profile 里既没有 API key 凭据，组合里也没有 `deepseekAccount` 服务。 |
| `account-timeout` | 账号服务 12 秒没回，通常是网络或平台侧抖动，会自己重试。 |
| 数字很久不动 | 每 60 秒才采一次；余额本身也只有账单结算后才变。 |
| 胶囊位置飘了 | 它靠找「对话」这两个字的文本节点定位。换语言包或改了标签文案时可能找不到，此时退回右下角固定位（`assets/strip.js` 里的 `RIGHT` / `BOTTOM`）。 |
| 远端访问时显示 `余额 —` | 本机以外的请求被 403 挡住了，见「隐私与安全」。 |

## 可调项

都在 `assets/strip.js` 顶部，改完 20 秒内自动生效（前端热替换）：

| 常量 | 作用 |
| --- | --- |
| `GAP` | 与标签行的水平间距 |
| `EDGE` | 距会话栏右边缘的间距 |
| `RIGHT` / `BOTTOM` | 找不到标签时的兜底固定位 |
| `POLL_OK` / `POLL_ERR` | 正常/失败时的轮询间隔（毫秒） |

配色是两套 CSS 变量：`:root` 给深色底，`#dsh-strip-bar.is-light` 覆盖成浅色底；峰谷各自一组 `--off-*` / `--on-*`。

## 开发

没有构建步骤，没有运行时依赖：

```sh
node --check lib/index.js
node --check assets/strip.js
pnpm pack --dry-run
```

目录：

```text
lib/index.js        宿主侧：注入行、两条路由、余额两条来源、估算记账、回环栅栏
assets/strip.js     页面侧：定位、配色、轮询、热替换
cordis.patch.yml    补丁层（插入本插件行）
icon.png            插件图标
```

在真实 Harness 里调试：把本目录 `link:` 进你正在用的 profile，重启客户端，然后改 `assets/strip.js`——前端改动 20 秒生效，改 `lib/index.js` 才需要重启。

## 发布

1. `pnpm pack --dry-run` 核对内容（应当只有 `lib/`、`assets/`、`cordis.patch.yml`、`icon.png`、三个 md、`LICENSE`）。
2. `pnpm publish --access public`。
3. 在干净的 profile 里 `dsh plugin --profile demo add dsh-balance-strip` 验证真实安装路径（`link:` 与 npm 的解析不一样，这一步不能省）。
4. 给仓库打 `dsh-plugin` topic，README 里保留可复制的安装命令，然后提交到社区插件库。

## 许可证

[MIT](LICENSE)
