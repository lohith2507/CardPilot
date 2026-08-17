import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary that must not be traced/bundled by webpack.
  serverExternalPackages: ["@electric-sql/pglite"],
  // This repo already has its own agent instructions; don't overwrite them.
  agentRules: false,
};

export default nextConfig;
