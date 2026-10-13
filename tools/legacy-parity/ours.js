// Transpiles the HR site's src/lib/** to CommonJS in a temp dir (TypeScript from frontend/hr-web/node_modules),
// so the site's calc modules run next to the legacy functions.
const fs = require("fs"), os = require("os"), path = require("path");

const WEB = path.resolve(__dirname, "../../frontend/hr-web");
const SRC = path.join(WEB, "src/lib");

module.exports = function buildOurs() {
  const ts = require(path.join(WEB, "node_modules/typescript"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ariba-parity-"));
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.tsx?$/.test(f)) continue;
      const code = fs.readFileSync(p, "utf8").replace(/from "@\/lib\//g, 'from "' + out + "/");
      const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
      const o = path.join(out, path.relative(SRC, p)).replace(/\.tsx?$/, ".js");
      fs.mkdirSync(path.dirname(o), { recursive: true });
      fs.writeFileSync(o, js);
    }
  })(SRC);
  return (mod) => require(path.join(out, mod));
};
