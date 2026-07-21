import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
    // proxy.ts가 /admin 경로에서 요청을 가로채는데, 기본 10MB 버퍼 제한 때문에
    // serverActions.bodySizeLimit을 올려도 프록시 단계에서 먼저 잘려 "Unexpected end of form"이 났다.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
