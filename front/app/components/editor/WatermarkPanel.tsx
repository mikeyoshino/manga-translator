import { useEditor } from "@/context/EditorContext";
import { useT } from "@/context/LocaleContext";
import { availableFonts } from "@/utils/fontMap";
import { loadFont } from "@/utils/fontLoader";
import type { WatermarkPosition, WatermarkSettings } from "@/utils/drawWatermark";
import { useCallback, useRef } from "react";

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "TL" },
  { value: "top-center", label: "TC" },
  { value: "top-right", label: "TR" },
  { value: "center-left", label: "CL" },
  { value: "center", label: "C" },
  { value: "center-right", label: "CR" },
  { value: "bottom-left", label: "BL" },
  { value: "bottom-center", label: "BC" },
  { value: "bottom-right", label: "BR" },
];

export function WatermarkPanel() {
  const { watermarkSettings: ws, setWatermarkSettings, images } = useEditor();
  const i = useT().editor;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (partial: Partial<WatermarkSettings>) => {
      setWatermarkSettings((prev) => ({ ...prev, ...partial }));
    },
    [setWatermarkSettings],
  );

  const handleFontChange = useCallback(
    (family: string) => {
      loadFont(family);
      update({ fontFamily: family });
    },
    [update],
  );

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Get natural dimensions
        const img = new Image();
        img.onload = () => {
          update({
            imageDataUrl: dataUrl,
            imageWidth: Math.min(img.naturalWidth, 200),
            imageHeight: Math.min(
              img.naturalHeight,
              Math.round((Math.min(img.naturalWidth, 200) / img.naturalWidth) * img.naturalHeight),
            ),
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [update],
  );

  const togglePage = useCallback(
    (imageId: string) => {
      setWatermarkSettings((prev) => {
        const next = new Set(prev.selectedPageIds);
        if (next.has(imageId)) {
          next.delete(imageId);
        } else {
          next.add(imageId);
        }
        return { ...prev, selectedPageIds: next };
      });
    },
    [setWatermarkSettings],
  );

  return (
    <div className="w-64 h-full bg-white border-l border-slate-200 p-3 shrink-0 overflow-y-auto">
      <h3 className="text-sm font-bold mb-3 text-indigo-700">{i.watermark}</h3>

      {/* Enable toggle */}
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-semibold text-slate-500">{i.watermarkEnable}</label>
        <button
          onClick={() => update({ enabled: !ws.enabled })}
          className={`px-2 py-1 text-xs rounded-lg transition-colors font-semibold ${
            ws.enabled
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {ws.enabled ? i.on : i.off}
        </button>
      </div>

      {!ws.enabled && (
        <p className="text-xs text-slate-400">{i.watermarkPreview}</p>
      )}

      {ws.enabled && (
        <>
          {/* Apply scope */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkApplyTo}</label>
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => update({ applyTo: "all" })}
              className={`flex-1 py-1 text-xs rounded-lg transition-colors font-semibold ${
                ws.applyTo === "all"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {i.watermarkAllPages}
            </button>
            <button
              onClick={() => update({ applyTo: "specific" })}
              className={`flex-1 py-1 text-xs rounded-lg transition-colors font-semibold ${
                ws.applyTo === "specific"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {i.watermarkSpecificPages}
            </button>
          </div>

          {/* Page selection list */}
          {ws.applyTo === "specific" && (
            <div className="mb-3 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1">
              {images.map((img, idx) => (
                <label key={img.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ws.selectedPageIds.has(img.id)}
                    onChange={() => togglePage(img.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="truncate">{idx + 1}. {img.originalFilename}</span>
                </label>
              ))}
            </div>
          )}

          {/* Type selector */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkType}</label>
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => update({ type: "text" })}
              className={`flex-1 py-1 text-xs rounded-lg transition-colors font-semibold ${
                ws.type === "text"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {i.watermarkText}
            </button>
            <button
              onClick={() => update({ type: "image" })}
              className={`flex-1 py-1 text-xs rounded-lg transition-colors font-semibold ${
                ws.type === "image"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {i.watermarkImage}
            </button>
          </div>

          {/* Text settings */}
          {ws.type === "text" && (
            <>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkContent}</label>
              <input
                type="text"
                value={ws.text}
                onChange={(e) => update({ text: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />

              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkFont}</label>
              <select
                value={ws.fontFamily}
                onChange={(e) => handleFontChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              >
                {availableFonts.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>

              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkFontSize}</label>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="range"
                  min={8}
                  max={120}
                  value={ws.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-slate-600 w-8 text-right">{ws.fontSize}px</span>
              </div>

              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkColor}</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="color"
                  value={ws.color}
                  onChange={(e) => update({ color: e.target.value })}
                  className="w-10 h-8 rounded-lg cursor-pointer bg-transparent border border-slate-200"
                />
                <input
                  type="text"
                  value={ws.color}
                  onChange={(e) => update({ color: e.target.value })}
                  className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>

              {/* Text border */}
              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkBorder}</label>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => update({ borderEnabled: !ws.borderEnabled })}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors font-semibold ${
                    ws.borderEnabled
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {ws.borderEnabled ? i.on : i.off}
                </button>
                {ws.borderEnabled && (
                  <>
                    <input
                      type="color"
                      value={ws.borderColor}
                      onChange={(e) => update({ borderColor: e.target.value })}
                      className="w-8 h-7 rounded-lg cursor-pointer bg-transparent border border-slate-200"
                    />
                    <input
                      type="number"
                      value={ws.borderWidth}
                      min={0.5}
                      max={10}
                      step={0.5}
                      onChange={(e) => update({ borderWidth: Number(e.target.value) })}
                      className="w-16 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                  </>
                )}
              </div>
            </>
          )}

          {/* Image settings */}
          {ws.type === "image" && (
            <>
              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkUpload}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors mb-3"
              >
                {i.watermarkUpload}
              </button>

              {ws.imageDataUrl && (
                <div className="mb-3 border border-slate-200 rounded-lg p-2">
                  <img
                    src={ws.imageDataUrl}
                    alt="watermark preview"
                    className="max-w-full max-h-20 mx-auto object-contain"
                  />
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkImageWidth}</label>
                  <input
                    type="number"
                    value={ws.imageWidth}
                    min={10}
                    max={2000}
                    onChange={(e) => update({ imageWidth: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkImageHeight}</label>
                  <input
                    type="number"
                    value={ws.imageHeight}
                    min={10}
                    max={2000}
                    onChange={(e) => update({ imageHeight: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* Opacity */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkOpacity}</label>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(ws.opacity * 100)}
              onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
              className="flex-1"
            />
            <span className="text-xs text-slate-600 w-8 text-right">{Math.round(ws.opacity * 100)}%</span>
          </div>

          {/* Position grid */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkPosition}</label>
          <div className="grid grid-cols-3 gap-1 mb-3">
            {POSITIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => update({ position: value })}
                className={`py-1.5 text-[10px] font-semibold rounded-md transition-colors ${
                  ws.position === value
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Offset */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkOffsetX}</label>
              <input
                type="number"
                value={ws.offsetX}
                onChange={(e) => update({ offsetX: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">{i.watermarkOffsetY}</label>
              <input
                type="number"
                value={ws.offsetY}
                onChange={(e) => update({ offsetY: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              />
            </div>
          </div>

          <p className="text-[10px] text-slate-400">{i.watermarkPreview}</p>
        </>
      )}
    </div>
  );
}
