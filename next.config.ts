import type { NextConfig } from "next"

const dev = process.env.NODE_ENV === "development"

// Production: a static export served by the Cloudflare Worker (see wrangler.jsonc).
// Development: `next dev` proxies /api to `wrangler dev` on :8790.
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  ...(dev
    ? { rewrites: async () => [{ source: "/api/:path*", destination: "http://localhost:8790/api/:path*" }] }
    : { output: "export", images: { unoptimized: true } }),
}

export default nextConfig
