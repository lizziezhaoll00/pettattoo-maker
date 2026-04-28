"use client";

/**
 * CropEditor —— 可拖拽裁切框
 *
 * 用法：
 *   <CropEditor imageUrl={url} onConfirm={(rect) => ...} onCancel={() => ...} />
 *
 * - rect 为相对于图片宽高的比例 { x, y, w, h }（0~1）
 * - 支持 8 方向 resize handle
 * - 支持 1:1 锁定
 * - 支持移动（拖拽框内部）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CropRect } from "@/store/editorStore";

type Handle =
  | "tl" | "tc" | "tr"
  | "ml" | "mr"
  | "bl" | "bc" | "br"
  | "move";

interface Props {
  imageUrl: string;
  initialRect?: CropRect;
  onConfirm: (rect: CropRect) => void;
  onCancel: () => void;
}

const HANDLE_SIZE = 10; // 手柄半径（px）

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function CropEditor({ imageUrl, initialRect, onConfirm, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // 图片在容器内的实际渲染区域（像素）
  const [imgRect, setImgRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // 裁切框（相对于图片渲染区域的比例 0-1）
  const [box, setBox] = useState<CropRect>(initialRect ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [lockAspect, setLockAspect] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1); // 锁定时的宽高比

  // 拖拽状态
  const drag = useRef<{
    handle: Handle;
    startX: number; startY: number;
    startBox: CropRect;
  } | null>(null);

  // 计算图片实际渲染区域
  const calcImgRect = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const cr = container.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    setImgRect({
      left: ir.left - cr.left,
      top: ir.top - cr.top,
      width: ir.width,
      height: ir.height,
    });
  }, []);

  useEffect(() => {
    calcImgRect();
    window.addEventListener("resize", calcImgRect);
    return () => window.removeEventListener("resize", calcImgRect);
  }, [calcImgRect]);

  // ── 鼠标事件 ──────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...box },
    };
    if (lockAspect) {
      setAspectRatio(box.w / box.h);
    }
  }, [box, lockAspect]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current || !imgRect) return;
      const { handle, startX, startY, startBox } = drag.current;
      const dx = (e.clientX - startX) / imgRect.width;
      const dy = (e.clientY - startY) / imgRect.height;

      setBox((prev) => {
        let { x, y, w, h } = { ...startBox };

        if (handle === "move") {
          x = clamp(x + dx, 0, 1 - w);
          y = clamp(y + dy, 0, 1 - h);
        } else {
          const ar = lockAspect ? aspectRatio : null;

          if (handle === "tl" || handle === "ml" || handle === "bl") {
            const newX = clamp(x + dx, 0, x + w - 0.05);
            const dxActual = newX - x;
            w = w - dxActual;
            x = newX;
          }
          if (handle === "tr" || handle === "mr" || handle === "br") {
            w = clamp(w + dx, 0.05, 1 - x);
          }
          if (handle === "tl" || handle === "tc" || handle === "tr") {
            const newY = clamp(y + dy, 0, y + h - 0.05);
            const dyActual = newY - y;
            h = h - dyActual;
            y = newY;
          }
          if (handle === "bl" || handle === "bc" || handle === "br") {
            h = clamp(h + dy, 0.05, 1 - y);
          }

          // 锁定宽高比
          if (ar !== null) {
            if (["tl", "tr", "bl", "br"].includes(handle)) {
              // 角落：以较小的变化量为准
              const hFromW = w / ar;
              const wFromH = h * ar;
              if (Math.abs(w - startBox.w) > Math.abs(h - startBox.h)) {
                h = hFromW;
              } else {
                w = wFromH;
              }
              // 修正边界
              if (handle === "tl") { y = startBox.y + startBox.h - h; x = startBox.x + startBox.w - w; }
              if (handle === "tr") { y = startBox.y + startBox.h - h; }
              if (handle === "bl") { x = startBox.x + startBox.w - w; }
              x = clamp(x, 0, 1 - w);
              y = clamp(y, 0, 1 - h);
            } else if (["tc", "bc"].includes(handle)) {
              w = h * ar;
            } else if (["ml", "mr"].includes(handle)) {
              h = w / ar;
            }
          }

          // 最终边界保护
          w = clamp(w, 0.05, 1 - x);
          h = clamp(h, 0.05, 1 - y);
        }

        return { x, y, w, h };
      });
    };

    const onUp = () => { drag.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // 触摸
    const onTouchMove = (e: TouchEvent) => {
      if (!drag.current) return;
      const t = e.touches[0];
      onMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
    };
    const onTouchEnd = () => { drag.current = null; };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [imgRect, lockAspect, aspectRatio]);

  // 触摸开始
  const onTouchStart = useCallback((e: React.TouchEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    const t = e.touches[0];
    drag.current = {
      handle,
      startX: t.clientX,
      startY: t.clientY,
      startBox: { ...box },
    };
    if (lockAspect) setAspectRatio(box.w / box.h);
  }, [box, lockAspect]);

  // 切换 1:1 锁定
  const toggleLockAspect = useCallback(() => {
    if (!lockAspect) {
      // 开启锁定时立即把框变成 1:1
      setBox((prev) => {
        const side = Math.min(prev.w, prev.h);
        const cx = prev.x + prev.w / 2;
        const cy = prev.y + prev.h / 2;
        return {
          x: clamp(cx - side / 2, 0, 1 - side),
          y: clamp(cy - side / 2, 0, 1 - side),
          w: side,
          h: side,
        };
      });
      setAspectRatio(1);
    }
    setLockAspect((v) => !v);
  }, [lockAspect]);

  // ── 渲染 ──────────────────────────────────────────────────

  // 裁切框的像素坐标（相对于 container）
  const boxPx = imgRect
    ? {
        left: imgRect.left + box.x * imgRect.width,
        top: imgRect.top + box.y * imgRect.height,
        width: box.w * imgRect.width,
        height: box.h * imgRect.height,
      }
    : null;

  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: "absolute",
    width: HANDLE_SIZE * 2,
    height: HANDLE_SIZE * 2,
    background: "white",
    border: "2px solid #f59e0b",
    borderRadius: 3,
    cursor,
    zIndex: 20,
    transform: "translate(-50%, -50%)",
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60">
        <button
          onClick={onCancel}
          className="text-white/70 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition"
        >
          取消
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLockAspect}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
              lockAspect
                ? "bg-amber-400 border-amber-400 text-white"
                : "border-white/30 text-white/70 hover:bg-white/10"
            }`}
          >
            {lockAspect ? "🔒 1:1" : "🔓 自由"}
          </button>
          <button
            onClick={() => setBox({ x: 0, y: 0, w: 1, h: 1 })}
            className="text-white/50 hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition"
          >
            重置
          </button>
        </div>
        <button
          onClick={() => onConfirm(box)}
          className="bg-amber-400 hover:bg-amber-500 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition"
        >
          确认裁切
        </button>
      </div>

      {/* 图片区 + 裁切框 */}
      <div ref={containerRef} className="flex-1 relative flex items-center justify-center overflow-hidden select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="裁切预览"
          className="max-w-full max-h-full object-contain"
          onLoad={calcImgRect}
          draggable={false}
          style={{ display: "block" }}
        />

        {boxPx && (
          <>
            {/* 遮罩四角 */}
            <div className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }}>
              {/* 上 */}
              <div className="absolute bg-black/50" style={{ left: imgRect!.left, top: imgRect!.top, width: imgRect!.width, height: boxPx.top - imgRect!.top }} />
              {/* 下 */}
              <div className="absolute bg-black/50" style={{ left: imgRect!.left, top: boxPx.top + boxPx.height, width: imgRect!.width, height: imgRect!.top + imgRect!.height - boxPx.top - boxPx.height }} />
              {/* 左 */}
              <div className="absolute bg-black/50" style={{ left: imgRect!.left, top: boxPx.top, width: boxPx.left - imgRect!.left, height: boxPx.height }} />
              {/* 右 */}
              <div className="absolute bg-black/50" style={{ left: boxPx.left + boxPx.width, top: boxPx.top, width: imgRect!.left + imgRect!.width - boxPx.left - boxPx.width, height: boxPx.height }} />
            </div>

            {/* 裁切框本体（可移动） */}
            <div
              className="absolute"
              style={{
                left: boxPx.left,
                top: boxPx.top,
                width: boxPx.width,
                height: boxPx.height,
                border: "2px solid #f59e0b",
                boxSizing: "border-box",
                cursor: "move",
                zIndex: 15,
                touchAction: "none",
              }}
              onMouseDown={(e) => onMouseDown(e, "move")}
              onTouchStart={(e) => onTouchStart(e, "move")}
            >
              {/* 三等分网格线 */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 bottom-0 border-l border-white/30" style={{ left: "33.33%" }} />
                <div className="absolute top-0 bottom-0 border-l border-white/30" style={{ left: "66.66%" }} />
                <div className="absolute left-0 right-0 border-t border-white/30" style={{ top: "33.33%" }} />
                <div className="absolute left-0 right-0 border-t border-white/30" style={{ top: "66.66%" }} />
              </div>
            </div>

            {/* 8 个 resize handle */}
            {([
              ["tl", 0, 0, "nw-resize"],
              ["tc", 0.5, 0, "n-resize"],
              ["tr", 1, 0, "ne-resize"],
              ["ml", 0, 0.5, "w-resize"],
              ["mr", 1, 0.5, "e-resize"],
              ["bl", 0, 1, "sw-resize"],
              ["bc", 0.5, 1, "s-resize"],
              ["br", 1, 1, "se-resize"],
            ] as [Handle, number, number, string][]).map(([id, rx, ry, cursor]) => (
              <div
                key={id}
                style={{
                  ...handleStyle(cursor),
                  left: boxPx.left + rx * boxPx.width,
                  top: boxPx.top + ry * boxPx.height,
                }}
                onMouseDown={(e) => onMouseDown(e, id)}
                onTouchStart={(e) => onTouchStart(e, id)}
              />
            ))}
          </>
        )}
      </div>

      {/* 底部提示 */}
      <div className="text-center text-white/40 text-xs py-2 pb-safe">
        拖拽边框调整裁切范围 · 框内拖动可移动位置
      </div>
    </div>
  );
}
