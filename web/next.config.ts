import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://localhost:8090";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Кабинет и шлюз живут на одном домене: cookie сессии и /v1 проксируются на Go-сервер.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/v1/:path*", destination: `${backend}/v1/:path*` },
    ];
  },
};

export default config;
