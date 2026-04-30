"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /schemes 已在 V2.9 版本中被新的等待页（首页 waiting phase）取代。
 * 保留此路由以防旧链接访问，自动重定向回首页。
 */
export default function SchemesPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="text-center">
        <div className="text-5xl mb-3">🐾</div>
        <p className="text-gray-500 text-sm">正在跳转…</p>
      </div>
    </div>
  );
}
