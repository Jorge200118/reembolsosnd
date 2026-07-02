import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

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
  ]),
  // Architectural boundaries: the domain layer (packages/domain) is the base
  // layer and MUST NOT import from the app (src/lib, src/components, src/app).
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["packages/domain/**", "src/**"],
      "boundaries/elements": [
        { type: "domain", pattern: "packages/domain/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "app", pattern: "src/app/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: "domain" },
              disallow: { to: { type: ["lib", "components", "app"] } },
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
