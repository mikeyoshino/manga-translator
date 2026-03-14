import { useEditor } from "@/context/EditorContext";
import { availableFonts } from "@/utils/fontMap";
import { getEditorLocale, editorT } from "@/utils/editorI18n";

export function EditorPropertiesPanel() {
  const { currentImage, selectedBlockId, updateBlock } = useEditor();
  const locale = getEditorLocale();
  const i = editorT[locale];

  if (!currentImage || !selectedBlockId) {
    return (
      <div className="w-64 bg-white border-l border-slate-200 p-4 shrink-0">
        <p className="text-slate-400 text-sm">{i.clickToEdit}</p>
      </div>
    );
  }

  const block = currentImage.editableBlocks.find((b) => b.id === selectedBlockId);
  if (!block) return null;

  const update = (updates: Record<string, any>) => {
    updateBlock(currentImage.id, block.id, updates);
  };

  return (
    <div className="w-64 bg-white border-l border-slate-200 p-3 shrink-0 overflow-y-auto">
      <h3 className="text-sm font-bold mb-3 text-slate-700">{i.textProperties}</h3>

      {/* Source text (read-only reference) */}
      {block.source_lang && block.text[block.source_lang] && (
        <>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {i.source} ({block.source_lang})
          </label>
          <div className="w-full bg-slate-50 border border-slate-200 text-slate-500 text-xs rounded-lg p-2 mb-2 max-h-16 overflow-y-auto">
            {block.text[block.source_lang]}
          </div>
        </>
      )}

      {/* Translated text content */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">
        {i.translation} ({block.target_lang || "edited"})
      </label>
      <textarea
        value={block.editedText}
        onChange={(e) => update({ editedText: e.target.value })}
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-2 mb-3 resize-y min-h-16 focus:ring-2 focus:ring-indigo-500/20 outline-none"
        rows={3}
      />

      {/* Font family */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.font}</label>
      <select
        value={block.editedFontFamily}
        onChange={(e) => update({ editedFontFamily: e.target.value })}
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
      >
        {availableFonts.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      {/* Font size */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.fontSize}</label>
      <input
        type="number"
        value={block.editedFontSize}
        min={6}
        max={200}
        onChange={(e) => update({ editedFontSize: Number(e.target.value) })}
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
      />

      {/* Color */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.color}</label>
      <div className="flex gap-2 mb-3">
        <input
          type="color"
          value={block.editedColor}
          onChange={(e) => update({ editedColor: e.target.value })}
          className="w-10 h-8 rounded-lg cursor-pointer bg-transparent border border-slate-200"
        />
        <input
          type="text"
          value={block.editedColor}
          onChange={(e) => update({ editedColor: e.target.value })}
          className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
        />
      </div>

      {/* Alignment */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.alignment}</label>
      <div className="flex gap-1 mb-3">
        {([
          ["left", i.left],
          ["center", i.center],
          ["right", i.right],
        ] as const).map(([a, label]) => (
          <button
            key={a}
            onClick={() => update({ editedAlignment: a })}
            className={`flex-1 py-1 text-xs rounded-lg transition-colors font-semibold ${
              block.editedAlignment === a
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bold / Italic */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.style}</label>
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => update({ editedBold: !block.editedBold })}
          className={`flex-1 py-1 text-sm font-bold rounded-lg transition-colors ${
            block.editedBold
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          B
        </button>
        <button
          onClick={() => update({ editedItalic: !block.editedItalic })}
          className={`flex-1 py-1 text-sm italic rounded-lg transition-colors ${
            block.editedItalic
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          I
        </button>
      </div>

      {/* Text border / stroke */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.textBorder}</label>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => update({ editedStrokeEnabled: !block.editedStrokeEnabled })}
          className={`px-2 py-1 text-xs rounded-lg transition-colors font-semibold ${
            block.editedStrokeEnabled
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {block.editedStrokeEnabled ? i.on : i.off}
        </button>
        {block.editedStrokeEnabled && (
          <>
            <input
              type="color"
              value={block.editedStrokeColor}
              onChange={(e) => update({ editedStrokeColor: e.target.value })}
              className="w-8 h-7 rounded-lg cursor-pointer bg-transparent border border-slate-200"
            />
            <input
              type="number"
              value={block.editedStrokeWidth}
              min={0.5}
              max={20}
              step={0.5}
              onChange={(e) => update({ editedStrokeWidth: Number(e.target.value) })}
              className="w-16 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              title="Stroke width"
            />
          </>
        )}
      </div>

      {/* Letter spacing */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.letterSpacing}</label>
      <input
        type="number"
        value={block.editedLetterSpacing}
        step={0.1}
        onChange={(e) => update({ editedLetterSpacing: Number(e.target.value) })}
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
      />

      {/* Line spacing */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.lineSpacing}</label>
      <input
        type="number"
        value={block.editedLineSpacing}
        step={0.1}
        min={0.5}
        max={5}
        onChange={(e) => update({ editedLineSpacing: Number(e.target.value) })}
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
      />

      {/* Position */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.position}</label>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <span className="text-[10px] text-slate-400">X</span>
          <input
            type="number"
            value={block.editedX}
            onChange={(e) => update({ editedX: Number(e.target.value) })}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>
        <div className="flex-1">
          <span className="text-[10px] text-slate-400">Y</span>
          <input
            type="number"
            value={block.editedY}
            onChange={(e) => update({ editedY: Number(e.target.value) })}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>
      </div>

      {/* Size */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.size}</label>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <span className="text-[10px] text-slate-400">W</span>
          <input
            type="number"
            value={block.editedWidth}
            onChange={(e) => update({ editedWidth: Number(e.target.value) })}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>
        <div className="flex-1">
          <span className="text-[10px] text-slate-400">H</span>
          <input
            type="number"
            value={block.editedHeight}
            onChange={(e) => update({ editedHeight: Number(e.target.value) })}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>
      </div>

      {/* Source info */}
      <div className="border-t border-slate-200 pt-3 mt-2">
        <p className="text-[10px] text-slate-400">
          {i.source}: {block.source_lang} &rarr; {block.target_lang}
        </p>
        <p className="text-[10px] text-slate-400 mt-1 break-all">
          {i.original}: {block.text[block.source_lang] || "—"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => update({ hidden: true })}
          className="flex-1 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-lg transition-colors"
        >
          {i.hideBlock}
        </button>
        <button
          onClick={() =>
            update({
              editedX: block.minX,
              editedY: block.minY,
              editedWidth: block.maxX - block.minX,
              editedHeight: block.maxY - block.minY,
              editedFontSize: block.font_size > 0 ? block.font_size : 24,
            })
          }
          className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
        >
          {i.reset}
        </button>
      </div>
    </div>
  );
}
