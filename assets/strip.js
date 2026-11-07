// dsh-balance-strip —— 顶部标题栏右侧的一行余额读数（无底色、不贯通、只读）
//
// 三个细节：
//  ① 自带热替换：每次轮询拿到后端给的 build（strip.js 的 mtime），一旦和当前运行的不一样，
//     就把自己拆掉、重新加载新版本 —— 改样式不用重启客户端，也不用 Ctrl+R。
//  ② 错误态不吵人：冷启动时后端还没取到数，只显示「同步中」；拿到过一次之后就一直显示旧数，
//     只用一个琥珀色小点提示「还没刷上」，鼠标悬停才给出具体原因。
//  ③ 自适应轮询：正常 20 秒一跳；连续失败时 6 秒一跳，自己追着恢复，不等人去动窗口。
;(function () {
  var BUILD = window.__dshStripBuild || ''
  if (!BUILD) {
    try {
      var cs = document.currentScript
      var m = cs && cs.src && /[?&]v=(\d+)/.exec(cs.src)
      if (m) BUILD = m[1]
    } catch (e) {}
  }
  if (window.__dshStripLoaded) return
  window.__dshStripLoaded = true

  var ENDPOINT = '/dsh-strip/data.json'
  var POLL_OK = 20000
  var POLL_ERR = 6000
  // 位置：底部状态栏那一行的右侧。BOTTOM 越大越往上，RIGHT 越大越往左
  var BOTTOM = 5
  var RIGHT = 70

  // 界面语言跟随系统/浏览器：zh* 用汉字，其它语言用英文。
  // 只影响这几个字，跟余额本身无关。
  var LANG = (function () {
    var l = ''
    try {
      l = (navigator.languages && navigator.languages[0]) || navigator.language || ''
    } catch (e) {}
    return /^zh/i.test(String(l)) ? 'zh' : 'en'
  })()
  var T = LANG === 'zh'
    ? { bal: '余额', today: '今日', est: '估', on: '峰', off: '谷', sync: '同步中', retry: '待恢复' }
    : { bal: 'Balance', today: 'Today', est: 'est.', on: 'Peak', off: 'Off-peak', sync: 'Syncing', retry: 'Retrying' }

  var dead = false
  var bar = null
  var dotEl, balEl, usedEl, peakEl, msgEl
  var lastGood = null
  var fails = 0
  var timer = null
  var inflight = false
  // 热替换时旧实例要能把自己挂的事件/计时器/观察器全撤掉，否则每换一次就多一份
  var disposers = []
  var intervals = []

  function on(target, type, fn, opts) {
    if (!target || !target.addEventListener) return
    target.addEventListener(type, fn, opts)
    disposers.push(function () { target.removeEventListener(type, fn, opts) })
  }

  function every(ms, fn) {
    var id = setInterval(fn, ms)
    intervals.push(id)
    return id
  }

  function teardown() {
    var i
    for (i = 0; i < disposers.length; i++) { try { disposers[i]() } catch (e) {} }
    disposers = []
    for (i = 0; i < intervals.length; i++) clearInterval(intervals[i])
    intervals = []
    if (typeof ro !== 'undefined' && ro) { try { ro.disconnect() } catch (e) {} }
    if (timer) clearTimeout(timer)
    timer = null
  }

  function make(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  function styleOnce() {
    if (document.getElementById('dsh-strip-style')) return
    var css = [
      '#dsh-strip-bar{position:fixed;bottom:' + BOTTOM + 'px;right:' + RIGHT + 'px;',
      'display:inline-flex;align-items:baseline;gap:.62em;margin:0;padding:.34em .80em .34em .70em;',
      'font-size:13px;',
      'border-radius:999px;background:var(--bg);border:1px solid var(--bd);',
      'box-shadow:var(--sh);',
      'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
      // 深底/浅底两套变量：运行时会量一下背后到底是什么底色，再挂 .is-light
      '--k:rgba(255,255,255,.44);--v:rgba(255,255,255,.94);--u:rgba(255,255,255,.64);',
      '--s:rgba(255,255,255,.14);--e:rgba(255,255,255,.30);',
      '--bg:rgba(255,255,255,.07);--bd:rgba(255,255,255,.12);',
      '--sh:0 2px 8px rgba(0,0,0,.28),0 1px 2px rgba(0,0,0,.18);',
      '--off-fg:#5cc98f;',
      '--on-fg:#e8837a;',
      'font-family:"Segoe UI Variable Text","Segoe UI","Microsoft YaHei",system-ui,sans-serif;',
      'line-height:1;white-space:nowrap;user-select:none;pointer-events:none;',
      'z-index:2147483000;-webkit-font-smoothing:antialiased;',
      'transition:background-color .25s ease,border-color .25s ease,box-shadow .25s ease;}',
      '#dsh-strip-bar.is-light{--k:rgba(15,18,22,.48);--v:rgba(15,18,22,.90);--u:rgba(15,18,22,.58);',
      '--s:rgba(15,18,22,.14);--e:rgba(15,18,22,.32);',
      '--bg:rgba(15,18,22,.055);--bd:rgba(15,18,22,.07);',
      '--sh:0 1px 3px rgba(15,18,22,.07);',
      '--off-fg:#187a4b;',
      '--on-fg:#ad3b31;}',
      // 胶囊底色跟随峰 / 谷：谷=绿、峰=红，浓度压得很低，只做一层"气压"，
      // 真正读信息靠徽章文字的颜色。浅底比深底再淡一档，否则发脏。
      '#dsh-strip-bar.is-off{--bg:rgba(92,201,143,.11);--bd:rgba(92,201,143,.22);}',
      '#dsh-strip-bar.is-peak{--bg:rgba(232,131,122,.09);--bd:rgba(232,131,122,.18);}',
      '#dsh-strip-bar.is-light.is-off{--bg:rgba(24,122,75,.055);--bd:rgba(24,122,75,.15);}',
      '#dsh-strip-bar.is-light.is-peak{--bg:rgba(173,59,49,.045);--bd:rgba(173,59,49,.12);}',
      '#dsh-strip-bar .dshs-grp{display:inline-flex;align-items:baseline;gap:.42em;}',
      '#dsh-strip-bar .dshs-k{font-size:.86em;font-weight:400;letter-spacing:.04em;color:var(--k);}',
      '#dsh-strip-bar .dshs-v{font-size:1em;font-weight:600;letter-spacing:.01em;',
      'font-variant-numeric:tabular-nums;color:var(--v);}',
      '#dsh-strip-bar .dshs-v.is-used{font-weight:500;color:var(--u);}',
      '#dsh-strip-bar .dshs-est{font-size:.66em;font-weight:400;color:var(--e);margin-left:.12em;transform:translateY(-.30em);}',
      '#dsh-strip-bar .dshs-sep{width:1px;height:.88em;border-radius:1px;',
      'background:var(--s);align-self:center;}',
      // 峰 / 谷：常驻，不再自带底色（底色交给整枚胶囊），所以字号可以放大一档
      '#dsh-strip-bar .dshs-peak{font-size:.92em;font-weight:700;letter-spacing:.05em;',
      'color:var(--on-fg);}',
      '#dsh-strip-bar .dshs-peak.is-off{color:var(--off-fg);}',
      '#dsh-strip-bar .dshs-dot{width:.3em;height:.3em;border-radius:50%;background:var(--off-fg);',
      'align-self:center;margin-right:-.36em;display:none;}',
      '#dsh-strip-bar.is-warn .dshs-dot{display:block;}',
      '#dsh-strip-bar .dshs-msg{font-size:.78em;font-weight:500;letter-spacing:.04em;',
      'color:var(--k);align-self:center;}',
    ].join('')
    var st = make('style', '')
    st.id = 'dsh-strip-style'
    st.textContent = css
    ;(document.head || document.documentElement).appendChild(st)
  }

  function ensureBar() {
    if (dead) return null
    if (bar && document.body && document.body.contains(bar)) return bar
    if (!document.body) return null
    styleOnce()

    bar = make('div', '')
    bar.id = 'dsh-strip-bar'

    var g1 = make('span', 'dshs-grp')
    g1.appendChild(make('span', 'dshs-k', T.bal))
    balEl = make('span', 'dshs-v', '—')
    g1.appendChild(balEl)

    var g2 = make('span', 'dshs-grp')
    g2.appendChild(make('span', 'dshs-k', T.today))
    usedEl = make('span', 'dshs-v is-used', '—')
    g2.appendChild(usedEl)
    // 「估」跟在数字后面，做上标小字：今日 ¥1.42 估
    g2.appendChild(make('span', 'dshs-est', T.est))

    dotEl = make('span', 'dshs-dot')
    peakEl = make('span', 'dshs-peak', T.on)
    msgEl = make('span', 'dshs-msg', '')

    // 顺序：今日 → 余额 → 峰/谷（今日在前，余额在后）
    bar.appendChild(dotEl)
    bar.appendChild(g2)
    bar.appendChild(make('span', 'dshs-sep'))
    bar.appendChild(g1)
    bar.appendChild(peakEl)
    bar.appendChild(msgEl)
    document.body.appendChild(bar)
    syncTheme()
    return bar
  }

  // 币种跟着账户走：宿主返回 data.currency，这里换成对应符号；认不出的币种就直接写代码
  var SYM = {
    CNY: '¥', RMB: '¥', USD: '$', EUR: '€', GBP: '£', JPY: 'JP¥', HKD: 'HK$',
    TWD: 'NT$', SGD: 'S$', KRW: '₩', INR: '₹', RUB: '₽', BRL: 'R$', AUD: 'A$',
    CAD: 'C$', CHF: 'CHF ', MYR: 'RM ', THB: '฿', VND: '₫', PHP: '₱', IDR: 'Rp '
  }
  var ZERO_DEC = { JPY: 1, KRW: 1, VND: 1 }
  var CUR = 'CNY'

  function money(v) {
    var n = Number(v)
    if (!isFinite(n)) return '—'
    var code = String(CUR || 'CNY').toUpperCase()
    var sym = SYM[code] || code + ' '
    return sym + n.toFixed(ZERO_DEC[code] ? 0 : 2)
  }

  // —— 底色探测 ——
  // 标题栏这块在深色主题下是深灰、在某些窗口状态下会被画成近白（.dsh 的标题栏底色跟窗口状态走），
  // 写死白字就会出现「几乎什么都看不见」。这里量一下背后真实底色，浅底就切成深色字。
  function parseColor(str) {
    var m = /^rgba?\(([^)]+)\)$/i.exec(String(str || '').trim())
    if (!m) return null
    var p = m[1].split(',')
    var r = parseFloat(p[0])
    var g = parseFloat(p[1])
    var b = parseFloat(p[2])
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return null
    var a = p.length > 3 ? parseFloat(p[3]) : 1
    return { r: r, g: g, b: b, a: isFinite(a) ? a : 1 }
  }

  function luminance(c) {
    function f(v) {
      v = v / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }

  function backdropIsLight() {
    if (!bar || !bar.getBoundingClientRect || !document.elementFromPoint) return false
    var r = bar.getBoundingClientRect()
    if (!r || !(r.width > 0)) return false
    var x = Math.min(window.innerWidth - 2, Math.max(1, r.left + r.width / 2))
    var y = Math.min(window.innerHeight - 2, Math.max(1, r.top + r.height / 2))
    var node = null
    try {
      node = document.elementFromPoint(x, y)
    } catch (e) {
      node = null
    }
    var guard = 0
    while (node && guard++ < 60) {
      var c = parseColor(getComputedStyle(node).backgroundColor)
      if (c && c.a >= 0.55) return luminance(c) > 0.55
      node = node.parentElement
    }
    var body = parseColor(getComputedStyle(document.body).backgroundColor)
    return !!(body && body.a >= 0.55 && luminance(body) > 0.55)
  }

  // 主题判定：应用自己声明的 > 整页背景明度 > 胶囊背后的实际底色 > 系统偏好
  // 四条里任意一条给出确定答案就停，避免单条失效时整块变瞎
  function declaredTheme() {
    var els = [document.documentElement, document.body]
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      if (!el) continue
      var vals = [el.getAttribute('data-theme'), el.getAttribute('data-color-scheme'), el.className]
      for (var j = 0; j < vals.length; j++) {
        var v = vals[j]
        if (typeof v !== 'string' || !v) continue
        var s = ' ' + v.toLowerCase().replace(/[\s_-]+/g, ' ') + ' '
        if (s.indexOf(' dark ') >= 0 || s.indexOf(' night ') >= 0) return true
        if (s.indexOf(' light ') >= 0) return false
      }
    }
    return null
  }

  function pageBgLum() {
    var nodes = [document.body, document.documentElement]
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) continue
      var c = parseColor(getComputedStyle(nodes[i]).backgroundColor)
      if (c && c.a >= 0.5) return luminance(c)
    }
    return null
  }

  function themeIsDark() {
    var declared = declaredTheme()
    if (declared !== null) return declared
    var lum = pageBgLum()
    if (lum !== null) return lum < 0.45
    if (bar) return !backdropIsLight()
    if (window.matchMedia) return window.matchMedia('(prefers-color-scheme: dark)').matches
    return false
  }

  function syncTheme() {
    if (!bar || dead) return
    var dark = themeIsDark()
    bar.classList.toggle('is-dark', dark)
    bar.classList.toggle('is-light', !dark)
  }

  // 挂在会话顶部那排标签（对话 / 上下文 / 编队）的右侧：
  // 垂直按标签文字的中线对齐，字号直接取标签的 computed font-size，右边缘贴住正文栏。

  function textRect(n) {
    try {
      var range = document.createRange()
      range.selectNodeContents(n)
      return range.getBoundingClientRect()
    } catch (e) {
      return n.parentElement ? n.parentElement.getBoundingClientRect() : null
    }
  }

  function findTabAnchor() {
    if (!document.body || !document.createTreeWalker) return null
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
    var best = null
    var n
    var guard = 0
    while ((n = walker.nextNode()) && guard++ < 40000) {
      var t = n.nodeValue
      if (!t || t.length > 8) continue
      if (!/^\s*(对话|上下文|Chat|Context)\s*$/i.test(t)) continue
      var want = /^\s*(对话|Chat)\s*$/i.test(t) ? 0 : 1
      var r = textRect(n)
      if (!r || r.width <= 0 || r.height <= 0) continue
      // 只在窗口顶部 260px 内找，避开正文里出现的「对话」二字
      if (r.top < 0 || r.top > 260) continue
      if (!best || want < best.want || (want === best.want && r.left < best.rect.left)) {
        best = { rect: r, el: n.parentElement, want: want }
      }
    }
    return best
  }

  // 会话栏的右边界：从标签本身往上找，最宽的那个「没顶满窗口」的祖先，它的右边缘就是正文栏那条线。
  // 不能用 elementFromPoint 猜：右侧可能压着别的面板/浮层，取到的宽度会把胶囊推到窗口边上去。
  function paneRightFrom(el) {
    var best = 0
    var node = el
    var guard = 0
    while (node && node !== document.body && node !== document.documentElement && guard++ < 18) {
      var r = node.getBoundingClientRect()
      if (r.width > 380) {
        if (r.right >= window.innerWidth - 4) break // 已经顶到窗口边，再往上只会更宽
        if (r.right > best) best = r.right
      }
      node = node.parentElement
    }
    return best || window.innerWidth - 6
  }

  // 底部输入框（「对话框」）本体：textarea 或可编辑区里面积最大的那个
  function composerHit() {
    if (!document.querySelectorAll) return null
    var list = document.querySelectorAll('textarea,[contenteditable="true"],[contenteditable=""]')
    var pick = null
    var el = null
    var i
    for (i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect()
      if (r.width < 220 || r.height < 14 || r.bottom < 0) continue
      if (!pick || r.width * r.height > pick.width * pick.height) { pick = r; el = list[i] }
    }
    return el
  }

  // 用户说的「对话框右侧」，就是底部输入框那圈圆角容器的右边缘。
  // 消息栏的容器可能比它宽（左右有内边距），所以直接量输入框本身往上 6 层内最宽的那层。
  function composerRight() {
    var el = composerHit()
    if (!el) return 0
    var pick = el.getBoundingClientRect()
    var right = pick.right
    var node = el.parentElement
    var guard = 0
    while (node && node !== document.body && guard++ < 6) {
      var rr = node.getBoundingClientRect()
      if (rr.width - pick.width > 140) break // 已经不是同一块输入框，往上就是整栏了，停
      if (rr.width >= pick.width && rr.right > right) right = rr.right
      node = node.parentElement
    }
    return right
  }

  function place() {
    if (!bar || dead) return
    var a = findTabAnchor()
    if (!a) {
      bar.style.fontSize = ''
      bar.style.left = 'auto'
      bar.style.top = 'auto'
      bar.style.right = RIGHT + 'px'
      bar.style.bottom = BOTTOM + 'px'
      return
    }
    // 字号跟标签一致；先设字号再量高度，否则量到的是上一次的尺寸
    var fs = parseFloat(getComputedStyle(a.el).fontSize)
    bar.style.fontSize = (isFinite(fs) && fs > 8 ? fs : 13) + 'px'
    var bh = bar.getBoundingClientRect().height
    // 右边缘是锚点：不再「量自己的宽度再算 left」，而是用 right 定位。
    // 这样金额从 88.15 变到 100.15 时，胶囊自己向左长，右边缘一像素都不动。
    var base = composerRight() || paneRightFrom(a.el)
    var vw = document.documentElement.clientWidth || window.innerWidth
    var inset = vw - base
    if (inset < 0) inset = 0
    bar.style.right = inset.toFixed(2) + 'px'
    bar.style.left = 'auto'
    bar.style.top = Math.max(1, a.rect.top + a.rect.height / 2 - bh / 2).toFixed(2) + 'px'
    bar.style.bottom = 'auto'
  }

  var placeQueued = false
  function schedulePlace() {
    if (dead || placeQueued) return
    placeQueued = true
    var run = function () {
      placeQueued = false
      place()
    }
    if (window.requestAnimationFrame) window.requestAnimationFrame(run)
    else setTimeout(run, 16)
  }

  // 面板抽屉、窗口吸附这类变化带过渡动画，只量一帧会停在中间态。
  // 这里在 0.5 秒内连续跟帧，动画一停自然结束（最多 30 帧，约 3% 的单核占用）。
  function settle() {
    if (dead) return
    watchLayout()
    var n = 0
    var tick = function () {
      place()
      if (++n < 30 && !dead) {
        if (window.requestAnimationFrame) window.requestAnimationFrame(tick)
        else setTimeout(tick, 16)
      }
    }
    if (window.requestAnimationFrame) window.requestAnimationFrame(tick)
    else setTimeout(tick, 16)
  }

  // 只监听会影响胶囊位置的几个盒子：标签行、输入框、以及它们各自往上两层。
  // 侧栏收起/展开、右侧面板开合、输入框由单行变多行，都会让这些盒子改变尺寸——
  // 那类变化不触发 window.resize，只靠 20 秒轮询会一直停在旧位置。
  var ro = null
  var watched = []
  function watchLayout() {
    if (dead || typeof ResizeObserver !== 'function') return
    var targets = []
    // 胶囊自己也盯着：金额位数一变它的宽度就变，宽度变了就要重新钉右边缘，
    // 否则文字变长时右边缘会往外顶出几个像素。
    if (bar) targets.push(bar)
    var a = findTabAnchor()
    if (a && a.el) {
      targets.push(a.el)
      if (a.el.parentElement) targets.push(a.el.parentElement)
      if (a.el.parentElement && a.el.parentElement.parentElement) targets.push(a.el.parentElement.parentElement)
    }
    var hit = composerHit()
    if (hit) {
      targets.push(hit)
      if (hit.parentElement) targets.push(hit.parentElement)
      if (hit.parentElement && hit.parentElement.parentElement) targets.push(hit.parentElement.parentElement)
    }
    var same = targets.length === watched.length && targets.length > 0
    for (var i = 0; same && i < targets.length; i++) if (targets[i] !== watched[i]) same = false
    if (same) return
    if (ro) ro.disconnect()
    watched = targets
    if (!targets.length) { ro = null; return }
    ro = new ResizeObserver(function () { schedulePlace() })
    for (var j = 0; j < targets.length; j++) ro.observe(targets[j])
  }


  function reason(err) {
    var s = String(err || '')
    if (s === 'starting') return '正在取数'
    if (s.indexOf('no-api-key') >= 0 && s.indexOf('no-account-service') >= 0) return '没有 API key，宿主也没有账号服务'
    if (s.indexOf('account-timeout') >= 0) return '账号余额请求超时'
    if (s.indexOf('account-not-logged-in') >= 0 || s.indexOf('account-unauthorized') >= 0) return '客户端还没登录 DeepSeek 账号'
    if (s.indexOf('no-account-service') >= 0) return '宿主没有账号服务（老版本？）'
    if (s.indexOf('account-') >= 0) return '账号余额不可用：' + s.replace(/^.*account-/, '')
    if (s.indexOf('no-api-key') >= 0) return '没配 API key'
    if (s.indexOf('http-') >= 0) return '接口返回 ' + s
    return '读取失败：' + s.slice(0, 60)
  }

  function swap(next) {
    dead = true
    teardown()
    // 拆干净，才能让新的自己重新装上
    var old = document.getElementById('dsh-strip-bar')
    if (old && old.parentNode) old.parentNode.removeChild(old)
    var sty = document.getElementById('dsh-strip-style')
    if (sty && sty.parentNode) sty.parentNode.removeChild(sty)
    var tags = document.querySelectorAll('script[data-dsh-strip]')
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].parentNode) tags[i].parentNode.removeChild(tags[i])
    }
    try { delete window.__dshStripLoaded } catch (e) { window.__dshStripLoaded = false }
    window.__dshStripBuild = next
    var s = document.createElement('script')
    s.src = '/dsh-strip/strip.js?v=' + next
    s.setAttribute('data-dsh-strip', '1')
    s.onerror = function () {}
    ;(document.body || document.documentElement).appendChild(s)
  }

  function render(data) {
    if (dead) return
    if (data && data.build && BUILD && data.build !== BUILD) {
      swap(data.build)
      return
    }
    if (!ensureBar()) return

    var ok = !!(data && data.ok)
    if (ok) {
      lastGood = data
      fails = 0
    } else {
      fails++
    }

    var src = ok ? data : lastGood
    if (src && src.currency) CUR = String(src.currency).toUpperCase()
    balEl.textContent = src ? money(src.balance) : '—'
    usedEl.textContent = src ? money(src.todayUsed) : '—'

    var off = !!(data && data.offPeak)
    peakEl.textContent = off ? T.off : T.on
    peakEl.classList.toggle('is-off', off)
    bar.classList.toggle('is-off', off)
    bar.classList.toggle('is-peak', !off)

    bar.classList.toggle('is-warn', !ok)
    if (ok) {
      msgEl.textContent = ''
      bar.removeAttribute('title')
    } else {
      // 冷启动：只写「同步中」，不把报错怼到标题栏上
      msgEl.textContent = !src ? (fails < 2 ? T.sync : T.retry) : ''
      bar.setAttribute('title', 'dsh-balance-strip：' + reason(data && data.error))
    }
    place()
  }

  function schedule(ms) {
    if (dead) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(poll, ms)
  }

  function poll() {
    if (dead) return
    if (inflight) return
    inflight = true
    var xhr = new XMLHttpRequest()
    xhr.open('GET', ENDPOINT + '?t=' + Date.now(), true)
    xhr.timeout = 12000
    function done() {
      inflight = false
      if (dead) return
      schedule(fails > 0 ? POLL_ERR : POLL_OK)
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return
      if (xhr.status !== 200) {
        render({ ok: false, error: 'http-' + xhr.status })
      } else {
        try {
          render(JSON.parse(xhr.responseText))
        } catch (err) {
          render({ ok: false, error: 'bad-json' })
        }
      }
      done()
    }
    xhr.onerror = function () { render({ ok: false, error: 'network' }); done() }
    xhr.ontimeout = function () { render({ ok: false, error: 'timeout' }); done() }
    try {
      xhr.send()
    } catch (err) {
      render({ ok: false, error: 'send-failed' })
      done()
    }
  }

  function boot() {
    if (dead) return false
    if (!ensureBar()) return false
    place()
    watchLayout()
    // 字体是晚一步加载的：加载完字宽会变，右边缘要重新钉一次
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () { schedulePlace() }).catch(function () {})
    }
    poll()
    // 唤醒、切回窗口、改窗口大小时都补一次，避免数字停在几分钟前
    on(document, 'visibilitychange', function () {
      if (!document.hidden) { syncTheme(); settle(); poll() }
    })
    on(window, 'focus', function () { syncTheme(); settle() })
    // 最大化/还原/拖边缘：先跟几帧布局，再补一次轮询
    on(window, 'resize', function () {
      syncTheme()
      settle()
      poll()
    })
    // 输入框变高（多行）、面板开合也会改变胶囊该在的位置，resize 事件抓不到，靠 ResizeObserver 兜
    on(window, 'orientationchange', function () { settle() })
    if (window.visualViewport) on(window.visualViewport, 'resize', function () { schedulePlace() })
    // 窗口从失焦到聚焦时标题栏底色会变，兜底每 5 秒量一次
    every(5000, syncTheme)
    // 布局元素可能被整块替换（切页面、换会话），隔一阵重新挂一次监听
    every(5000, watchLayout)
    return true
  }

  if (!boot()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true })
    } else {
      var tries = 0
      var wait = setInterval(function () {
        if (boot() || ++tries > 40) clearInterval(wait)
      }, 250)
    }
  }
})()
