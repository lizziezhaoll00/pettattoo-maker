/**
 * 一次性脚本：把 public/*-refs/ 下的参考图上传到 Vercel Blob
 * 运行：node scripts/upload-refs-to-blob.mjs
 * 需要先在 .env.local 中配置 BLOB_READ_WRITE_TOKEN
 */

import { put } from "@vercel/blob";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

// 手动加载 .env.local（不依赖 dotenv，直接解析）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  process.env[key] = val;
}

const STYLES = ["lineart", "watercolor", "cartoon", "kawaii", "outline"];
const publicDir = path.join(__dirname, "../public");

const results = {};

for (const style of STYLES) {
  const refsDir = path.join(publicDir, `${style}-refs`);
  if (!fs.existsSync(refsDir)) {
    console.log(`[skip] ${style}-refs/ 目录不存在`);
    results[style] = [];
    continue;
  }

  const files = fs
    .readdirSync(refsDir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort()
    .slice(0, 3);

  if (files.length === 0) {
    console.log(`[skip] ${style}-refs/ 目录为空`);
    results[style] = [];
    continue;
  }

  results[style] = [];
  for (const file of files) {
    const filePath = path.join(refsDir, file);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : "image/webp";
    const blobPath = `style-refs/${style}/${file}`;

    try {
      const { url } = await put(blobPath, buffer, {
        access: "public",
        contentType: mimeType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      console.log(`[ok] ${style}/${file} → ${url}`);
      results[style].push(url);
    } catch (e) {
      console.error(`[err] ${style}/${file}:`, e.message);
    }
  }
}

console.log("\n========== 上传完成，复制以下内容到代码中 ==========\n");
console.log("const STYLE_REFS_URLS: Record<ArtStyle, string[]> = {");
for (const style of STYLES) {
  const urls = results[style] ?? [];
  console.log(`  ${style}: ${JSON.stringify(urls)},`);
}
console.log("};");
