import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许外部图片域名（Replicate 返回的图片 URL）
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "pbxt.replicate.delivery" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // 增大 API 请求体限制（处理图片上传）
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
