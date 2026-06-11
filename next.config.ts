import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The New Relic agent loads ~74 of its own files via Node subpath-imports
  // (`require('#agentlib/*.js')`) plus dynamically-required instrumentation.
  // @vercel/nft can't statically resolve those, so a webpack build under-traces
  // the package and the Lambda crashes with "Cannot find module". Force the full
  // agent (and its scoped deps) into every server trace.
  //
  // The ESM instrumentation chain (--import newrelic/esm-loader.mjs) wires its
  // transform hooks via `module.register('<pkg>/hook.mjs', ...)`. nft does
  // static require/import analysis and can't see those string specifiers, so
  // `@apm-js-collab/tracing-hooks/hook.mjs` and `import-in-the-middle/hook.mjs`
  // get dropped from the Lambda and pino is never instrumented on Vercel
  // (it works locally only because the files exist in node_modules). Force the
  // whole hook packages into the trace too.
  // @apm-js-collab/code-transformer parses with these (imported as ESM .mjs,
  // which nft also misses — it only traced their CJS builds). Without them the
  // agent throws "Cannot find module meriyah/dist/meriyah.mjs" on bootstrap.
  //outputFileTracingIncludes: {
  //  "/*": [
  //    "./node_modules/newrelic/**/*",
  //    "./node_modules/@apm-js-collab/**/*",
  //    "./node_modules/import-in-the-middle/**/*",
  //    "./node_modules/meriyah/**/*",
  //    "./node_modules/astring/**/*",
  //    "./node_modules/esquery/**/*",
  //    "./node_modules/source-map/**/*",
  //    "./node_modules/semifies/**/*",
  //  ],
  //},
};

export default nextConfig;
