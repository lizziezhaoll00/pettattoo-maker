"use client";

interface LoadingCatProps {
  text?: string;
}

export default function LoadingCat({ text = "AI 处理中..." }: LoadingCatProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      {/* 猫爪动画 */}
      <div className="relative w-16 h-16">
        <div className="animate-bounce text-5xl select-none">🐾</div>
      </div>
      <div className="flex gap-1 items-center">
        <span className="text-sm text-gray-500">{text}</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
