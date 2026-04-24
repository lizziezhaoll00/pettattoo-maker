/**
 * 将图片压缩到最长边 1024px 以内，返回压缩后的 Blob
 */
async function compressImage(file: File, maxSize = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxSize / Math.max(w, h));
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);

      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      canvas.getContext("2d")!.drawImage(img, 0, 0, dw, dh);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("压缩失败"))),
        "image/jpeg",
        0.97
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 调用 /api/remove-bg，上传图片文件，返回透明 PNG 的 Blob URL
 */
export async function removeBg(file: File): Promise<string> {
  // 先压缩，避免请求体过大
  const compressed = await compressImage(file, 2048);
  const formData = new FormData();
  formData.append("image", compressed, "image.jpg");

  const res = await fetch("/api/remove-bg", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "抠图失败" }));
    throw new Error(err.error || "抠图失败");
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
