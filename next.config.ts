import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The New Relic agent loads ~74 of its own files via Node subpath-imports
  // (`require('#agentlib/*.js')`) plus dynamically-required instrumentation.
  // @vercel/nft can't statically resolve those, so a webpack build under-traces
  // the package and the Lambda crashes with "Cannot find module". Force the full
  // agent (and its scoped deps) into every server trace.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/newrelic/**/*",
    ],
  },
};

export default nextConfig;
