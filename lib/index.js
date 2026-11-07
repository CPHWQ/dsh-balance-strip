// dsh-balance-strip —— 窗口最底部的常驻余额细条
//
// 设计要点（照抄 dsh-whale-widget 已经踩平的坑）：
//  ① 桌面壳的 index.html 是**从安装包静态 dist 直出**的（dsh-app://app/），永远不经过宿主的
//     renderIndex()/tapIndex，所以桌面端唯一的注入通道是 `webserver/index-inject` 推的结构化行，
//     而那张表是**宿主启动时一次性收集**的 ⇒ 行必须在 apply() 的第一件事就注册。
//  ② 页面解释器对 `script-src` 行是「加载失败即 reject 整个 boot」，所以这里推**内联 script 行**：
//     由我们自己在页面里 createElement 一个 <script src>，并吞掉 onerror —— 路由在就正常加载，
//     路由不在就静默失败，宿主永远不会因为我们起不来。
//  ③ 数据不依赖任何别的插件：直接读 DSH 官方凭据里的 DEEPSEEK_API_KEY，打官方 /user/balance。
//
// 「今日已用」是**按余额下降估算**的：每 60s 采一次余额，正差额记入当天，负差额（充值/赠金）忽略。
// 它不是账单，误差来自采样间隔与充值；细条上会标「估」。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ASSET_FILE = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  'assets',
  'strip.js',
)
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const STATE_FILE = path.join(DSH_HOME, '.dsh-strip.json')
const POLL_MS = 60_000
const STALE_MS = 45_000

// 内联注入行：先查重，再插 <script>，onerror 吞掉（issue #154 的教训）
// build 取 strip.js 的 mtime：前端轮询时比对，发现文件变了就自我热替换（不用重启客户端、不用 Ctrl+R）
function assetBuild() {
  try {
    return String(Math.round(fs.statSync(ASSET_FILE).mtimeMs))
  } catch (err) {
    return '0'
  }
}

function injectText(build) {
  return (
    '(function(){try{var d=document.body||document.head||document.documentElement;if(!d)return;' +
    'if(window.__dshStripLoaded)return;if(document.querySelector("script[data-dsh-strip]"))return;' +
    'window.__dshStripBuild="' + build + '";' +
    'var s=document.createElement("script");s.src="/dsh-strip/strip.js?v=' + build + '";' +
    's.setAttribute("data-dsh-strip","1");s.onerror=function(){};d.appendChild(s)}catch(e){}})()'
  )
}

// —— 时间：北京时间没有夏令时，固定 +8 小时即精确 ——
function shanghaiNow() {
  return new Date(Date.now() + 8 * 3600 * 1000)
}
function todayKey() {
  return shanghaiNow().toISOString().slice(0, 10)
}
// DeepSeek 优惠时段：北京时间 00:30–08:30
function isOffPeak() {
  const t = shanghaiNow()
  const minutes = t.getUTCHours() * 60 + t.getUTCMinutes()
  return minutes >= 30 && minutes < 8 * 60 + 30
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') {
      return {
        date: typeof parsed.date === 'string' ? parsed.date : todayKey(),
        used: Number.isFinite(Number(parsed.used)) ? Number(parsed.used) : 0,
        lastBalance: Number.isFinite(Number(parsed.lastBalance)) ? Number(parsed.lastBalance) : null,
        // 必须一起恢复：漏了它，进程重启后首次记账会以为「换了币种」而把今日用量清零
        currency: typeof parsed.currency === 'string' ? parsed.currency : null,
      }
    }
  } catch (err) {}
  return { date: todayKey(), used: 0, lastBalance: null }
}

let state = loadState()

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8')
  } catch (err) {}
}

function rollDay() {
  const today = todayKey()
  if (state.date !== today) {
    state.date = today
    state.used = 0
  }
}

// 用余额差记账：只有「余额变少」才算消费；变多视为充值/赠金，不计负消费
function observe(balance, currency) {
  rollDay()
  // 只在「两个已知币种确实不同」时清零。之前漏存 currency，重启后旧值是 undefined，
  // 被当成换了币种 → 今日已用被清零（2026-11-07 换外观触发插件重载时复现）。
  if (currency && state.currency && state.currency !== currency) {
    state.used = 0
    state.lastBalance = null
  }
  if (currency) state.currency = currency
  if (state.lastBalance !== null && Number.isFinite(state.lastBalance)) {
    const deltaCents = Math.round(state.lastBalance * 100) - Math.round(balance * 100)
    if (deltaCents > 0) state.used = (Math.round(state.used * 100) + deltaCents) / 100
  }
  state.lastBalance = balance
  saveState()
}

export default {
  name: 'balance-strip',

  apply(root) {
    const disposers = []

    root.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
    })

    // ① 注入行：桌面端唯一生效的通道（必须最先注册，见表收集时机）
    const build = assetBuild()
    disposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script-src' && String(row.src || '').indexOf('/dsh-strip/strip.js') >= 0) return
          if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf('/dsh-strip/strip.js') >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: injectText(build) })
      } catch (err) {}
    }))

    // ② 路由与轮询：等 webServer 就绪；credentials / deepseekAccount 都是可选的
    //    （缺了只降级，绝不写进 inject —— 否则老宿主的插件会永远等不到服务而不 apply）
    root.inject(['webServer'], (ctx) => {
      let cache = { ok: false, error: 'starting', at: 0 }
      let inflight = null
      let lastAttempt = 0

      // 路 1：官方 /user/balance（需要 DEEPSEEK_API_KEY 凭据）
      async function keyBalance() {
        let creds = null
        try {
          creds = typeof ctx.get === 'function' ? ctx.get('credentials') : null
        } catch (err) {
          creds = null
        }
        if (!creds) return { ok: false, error: 'no-credentials-service' }
        let cred = null
        try {
          cred = await creds.resolve('DEEPSEEK_API_KEY')
        } catch (err) {
          return { ok: false, error: 'credential-error' }
        }
        if (!cred || !cred.value) return { ok: false, error: 'no-api-key' }
        try {
          const res = await fetch(BALANCE_URL, {
            headers: { Authorization: 'Bearer ' + cred.value },
            signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) return { ok: false, error: 'http-' + res.status }
          const data = await res.json()
          const infos = Array.isArray(data && data.balance_infos) ? data.balance_infos : []
          const info = infos.find((x) => x && String(x.currency) === 'CNY') || infos[0]
          const balance = info ? Number(info.total_balance) : NaN
          if (!Number.isFinite(balance)) return { ok: false, error: 'bad-payload' }
          return { ok: true, balance, currency: (info && info.currency) || 'CNY', source: 'key' }
        } catch (err) {
          return { ok: false, error: 'fetch-failed' }
        }
      }

      // 路 2：DSH 账号登录态（只登录客户端、没配 API key 的用户走这条）
      // token 注入、x-client-* 头、401 清理全部由 DSH 的 deepseekAccount 服务负责，这里不拼 HTTP。
      async function accountBalance() {
        // 每轮现取：账号服务可能在 apply 之后才就绪；老宿主则根本没有这个服务
        let account = null
        try {
          account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null
        } catch (err) {
          account = null
        }
        if (!account || typeof account.getBalance !== 'function') return { ok: false, error: 'no-account-service' }
        let result = null
        try {
          result = await Promise.race([
            account.getBalance({
              version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || '') || 'unknown',
              locale: String(process.env.DSH_LOCALE || '') || 'zh_CN',
              timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
            }),
            new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
          ])
        } catch (err) {
          return { ok: false, error: 'account-error' }
        }
        if (!result) return { ok: false, error: 'account-timeout' }
        if (result.status !== 'ready') return { ok: false, error: 'account-' + String(result.status || 'unknown') }

        const num = (v) => {
          const n = Number(v)
          return Number.isFinite(n) ? n : null
        }
        const norm = (Array.isArray(result.value) ? result.value : []).filter((w) => w && num(w.balance) !== null)
        const bonus = (Array.isArray(result.bonusWallets) ? result.bonusWallets : []).filter((w) => w && num(w.balance) !== null)
        const all = norm.concat(bonus)
        if (all.length === 0) return { ok: false, error: 'account-empty' }

        const curOf = (w) => String((w && w.currency) || 'CNY').toUpperCase()
        const currency = curOf(all.find((w) => curOf(w) === 'CNY' && Number(w.balance) > 0) || all.find((w) => curOf(w) === 'CNY') || all[0])
        const sum = (list) => list.filter((w) => curOf(w) === currency).reduce((s, w) => s + Number(w.balance), 0)
        // 充值 + 赠金，与 API key 路的 total_balance 同口径，否则余额差估算会偏小
        return { ok: true, balance: Number((sum(norm) + sum(bonus)).toFixed(6)), currency, source: 'account' }
      }

      async function refresh() {
        if (inflight) return inflight
        lastAttempt = Date.now()
        inflight = (async () => {
          const done = (payload) => {
            cache = Object.assign({ at: Date.now() }, payload)
            return cache
          }
          try {
            let result = await keyBalance()
            if (!result.ok) {
              const byAccount = await accountBalance()
              result = byAccount.ok ? byAccount : { ok: false, error: result.error + ' / ' + byAccount.error }
            }
            if (!result.ok) return done(result)

            observe(result.balance, result.currency)
            return done({
              ok: true,
              balance: result.balance,
              currency: result.currency,
              source: result.source,
              todayUsed: state.used,
              date: state.date,
            })
          } catch (err) {
            return done({ ok: false, error: 'failed: ' + String((err && err.message) || err).slice(0, 120) })
          } finally {
            inflight = null
          }
        })()
        return inflight
      }

      // 轻量栅栏：只服务回环上的同源页面，跨站直接拒（GET 也会泄露余额数字）
      function crossSite(req) {
        return String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site'
      }

      // 对端不是回环就拒。只查 socket 地址、不查 Host 头：
      //   · 桌面端页面可能从 dsh-app:// 经宿主代理发出，Host 头形态不可靠，查它会误杀；
      //   · 而 socket 对端在"本机访问"时恒为 127.0.0.1 / ::1，只有别人从局域网连进来才会变，
      //     这正是要挡的那一种（公开部署时余额不该被外网读者看到）。
      // 地址取不到时放行——宁可漏挡，也不能把本机正常用户挡在外面。
      function remoteIsForeign(req) {
        const addr = (req.socket && (req.socket.remoteAddress || req.socket.localAddress)) || ''
        if (!addr) return false
        const a = String(addr).replace(/^::ffff:/i, '')
        if (a === '::1' || a === 'localhost') return false
        if (a.startsWith('127.')) return false
        if (a.startsWith('/') || a.startsWith('\\\\') || a.includes('pipe')) return false
        return true
      }

      disposers.push(
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-strip/strip.js',
          handler: (req, res) => {
            let body = ''
            try {
              body = fs.readFileSync(ASSET_FILE, 'utf8')
            } catch (err) {
              body = '/* strip.js missing */'
            }
            res.writeHead(200, {
              'Content-Type': 'application/javascript; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(body)
          },
        }),
      )

      disposers.push(
        ctx.webServer.register({
          kind: 'exact',
          path: '/dsh-strip/data.json',
          handler: (req, res) => {
            if (crossSite(req) || remoteIsForeign(req)) {
              res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end('{"ok":false,"error":"local-only"}')
              return
            }
            // 出错时 4 秒就能再试一次（刚开机时账号服务可能还没就绪），正常时按 60 秒采样
            const now = Date.now()
            const due = cache.ok ? now - cache.at > STALE_MS : now - lastAttempt > 4000
            if (due) void refresh()
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(
              JSON.stringify(
                Object.assign({}, cache, {
                  offPeak: isOffPeak(),
                  serverTime: now,
                  pollMs: POLL_MS,
                  // 现读现算：注入行里那份是宿主启动时的值，两边一比对就能发现文件变了
                  build: assetBuild(),
                }),
              ),
            )
          },
        }),
      )

      // 浏览器形态（dsh web）走 tapIndex；桌面端走上面的注入行，两条并存、各自去重
      disposers.push(
        ctx.webServer.tapIndex((html) => {
          if (html.indexOf('/dsh-strip/strip.js') !== -1) return html
          const tag = '<script defer src="/dsh-strip/strip.js"></script>'
          if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
          return html + tag
        }),
      )

      void refresh()
      // 10 秒一跳的看门狗：失败后 4 秒内可重试，成功后按 STALE_MS 兜底
      const timer = setInterval(() => {
        const now = Date.now()
        if (cache.ok ? now - cache.at > STALE_MS : now - lastAttempt > 4000) void refresh()
      }, 10_000)
      disposers.push(() => clearInterval(timer))
    })
  },
}
