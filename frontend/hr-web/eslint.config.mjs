import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, copied verbatim (MIT, see src/lib/vendor/qrcode-README.md): the QR encoder the business cards
    // draw with. Its own style is not ours to lint.
    "src/lib/vendor/**",
  ]),
]);

export default eslintConfig;
