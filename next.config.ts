import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// next.config.ts가 있는 폴더 = 실제 Next 앱 루트 (상위 워크스페이스로 잡히면 tailwindcss resolve 실패 방지)
const configDir = path.dirname(fileURLToPath(import.meta.url));

// 프로젝트 루트의 .env / .env.local을 next.config 로드 시점에 확실히 읽음 (API 라우트용)
loadEnvConfig(configDir);

const nextConfig: NextConfig = {
  turbopack: {
    root: configDir,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ddragon.leagueoflegends.com",
        pathname: "/cdn/**",
      },
      {
        protocol: "https",
        hostname: "raw.communitydragon.org",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
