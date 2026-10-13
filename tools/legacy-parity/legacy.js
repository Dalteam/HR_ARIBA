// Boots the split legacy HR portal (frontend/legacy/hr-portal) in jsdom: every <script src="js/..."> is inlined in
// load order, so the window holds each function's final patched version. Network is stubbed; no real data is loaded.
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "../../frontend/legacy/hr-portal");

// Applies [{ file, from, to, all? }] text patches to the legacy sources; a patch that no longer matches throws.
function patched(src, code, patches) {
  for (const p of patches.filter((x) => x.file === src)) {
    if (!code.includes(p.from)) throw new Error(`correction ${p.id}: "${p.from}" not found in ${src}`);
    code = p.all ? code.split(p.from).join(p.to) : code.replace(p.from, p.to);
  }
  return code;
}

module.exports = async function boot({ emps = [], extra = {}, patches = [] } = {}) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script([^>]*)\ssrc="(js\/[^"]+)"([^>]*)><\/script>/g, (_, a, src, b) =>
    "<script" + a + b + ">" + patched(src, fs.readFileSync(path.join(ROOT, src), "utf8"), patches).replace(/<\/script>/gi, "<\\/script>") + "\n//# sourceURL=" + src + "\n</script>");
  html = html.replace(/<link[^>]+href="https?:[^"]+"[^>]*>/g, "").replace(/<script[^>]+src="https?:[^"]+"[^>]*><\/script>/g, "");
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem("hr7_emps", JSON.stringify(emps));
      for (const [k, v] of Object.entries(extra)) w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
      w.fetch = () => Promise.resolve({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
      w.XMLHttpRequest.prototype.send = function () {};
      w.alert = w.confirm = w.prompt = () => true;
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.Chart = function () { return { destroy() {}, update() {} }; };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
    },
  });
  await new Promise((r) => setTimeout(r, 2500));
  return dom.window;
};
module.exports.patched = patched;
