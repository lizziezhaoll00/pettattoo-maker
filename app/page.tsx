import Uploader from "@/components/Uploader";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
      {/* Header */}
      <div className="text-center pt-12 pb-8 px-4">
        <div className="text-5xl mb-3">🐾</div>
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
          PetTattoo Maker
        </h1>
        <p className="text-gray-500 mt-2 text-base whitespace-nowrap">
          上传你家主子的照片，一键生成专属纹身贴素材
        </p>
      </div>

      {/* 上传区域 */}
      <div className="px-4 pb-16">
        <Uploader />
      </div>

      {/* Footer */}
      <div className="text-center pb-8 text-xs text-gray-300">
        made with 🐾 & ❤️
      </div>
    </main>
  );
}
