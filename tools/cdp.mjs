// 通过 Chrome DevTools Protocol 在页面上下文里执行 JS。
// 用法：node tools/cdp.mjs "<表达式>" [--await]
//       node tools/cdp.mjs --file <脚本.js> [--await]
// 前提：有一个带 --remote-debugging-port=9222 的 Chrome 实例。
import fs from "node:fs";

const PORT = process.env.CDP_PORT || 9222;

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
let expr;
if (fileIdx >= 0) {
  expr = fs.readFileSync(args[fileIdx + 1], "utf8");
} else {
  expr = args[0];
}
const wait = args.includes("--await");
if (!expr) {
  console.error("usage: node tools/cdp.mjs \"<js expression>\" [--await] | --file <script.js>");
  process.exit(64);
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
const page = pages.find((t) => t.url.includes("deepseek.club")) || pages[0];
if (!page) {
  console.error("no page target");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();

function send(method, params) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
});

const res = await send("Runtime.evaluate", {
  expression: expr,
  awaitPromise: wait,
  returnByValue: true,
  userGesture: true,
});

const r = res.result || {};
if (r.exceptionDetails) {
  console.error("EXCEPTION:", JSON.stringify(r.exceptionDetails).slice(0, 800));
  process.exit(1);
}
const value = r.result?.value;
console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
ws.close();
