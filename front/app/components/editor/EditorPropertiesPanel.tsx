import { useEditor } from "@/context/EditorContext";
import { availableFonts } from "@/utils/fontMap";

export function EditorPropertiesPanel() {
  const { currentImage, selectedBlockId, updateBlock } = useEditor();

  if (!currentImage || !selectedBlockId) {
    return (
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4 shrink-0">
        <p className="text-gray-400 text-sm">Click a text block to edit its properties</p>
      </div>
    );
  }

  const block = currentImage.editableBlocks.find((b) => b.id === selectedBlockId);
  if (!block) return null;

  const update = (updates: Record<string, any>) => {
    updateBlock(currentImage.id, block.id, updates);
  };

  return (
    <div className="w-64 bg-gray-800 border-l border-gray-700 p-3 shrink-0 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-3 text-gray-200">Text Properties</h3>

      {/* Source text (read-only reference) */}
      {block.source_lang && block.text[block.source_lang] && (
        <>
          <label className="block text-xs text-gray-400 mb-1">
            Source ({block.source_lang})
          </label>
          <div className="w-full bg-gray-900 text-gray-400 text-xs rounded p-2 mb-2 max-h-16 overflow-y-auto">
            {block.text[block.source_lang]}
          </div>
        </>
      )}

      {/* Translated text content */}
      <label className="block text-xs text-gray-400 mb-1">
        Translation ({block.target_lang || "edited"})
      </label>
      <textarea
        value={block.editedText}
        onChange={(e) => update({ editedText: e.target.value })}
        className="w-full bg-gray-700 text-white text-sm rounded p-2 mb-3 resize-y min-h-16"
        rows={3}
      />

      {/* Font family */}
      <label className="block text-xs text-gray-400 mb-1">Font</label>
      <select
        value={block.editedFontFamily}
        onChange={(e) => update({ editedFontFamily: e.target.value })}
        className="w-full bg-gray-700 text-white text-sm rounded p-1.5 mb-3"
      >
        {availableFonts.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      {/* Font size */}
      <label className="block text-xs text-gray-400 mb-1">Font Size</label>
      <input
        type="number"
        value={block.editedFontSize}
        min={6}
        max={200}
        onChange={(e) => update({ editedFontSize: Number(e.target.value) })}
        className="w-full bg-gray-700 text-white text-sm rounded p-1.5 mb-3"
      />

      {/* Color */}
      <label className="block text-xs text-gray-400 mb-1">Color</label>
      <div className="flex gap-2 mb-3">
        <input
          type="color"
          value={block.editedColor}
          onChange={(e) => update({ editedColor: e.target.value })}
          className="w-10 h-8 rounded cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={block.editedColor}
          onChange={(e) => update({ editedColor: e.target.value })}
          className="flex-1 bg-gray-700 text-white text-sm rounded p-1.5"
        />
      </div>

      {/* Alignment */}
      <label className="block text-xs text-gray-400 mb-1">Alignment</label>
      <div className="flex gap-1 mb-3">
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            onClick={() => update({ editedAlignment: a })}
            className={`flex-1 py-1 text-xs rounded transition-colors ${
              block.editedAlignment === a
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Bold / Italic */}
      <label className="block text-xs text-gray-400 mb-1">Style</label>
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => update({ editedBold: !block.editedBold })}
          className={`flex-1 py-1 text-sm font-bold rounded transition-colors ${
            block.editedBold
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          B
        </button>
        <button
          onClick={() => update({ editedItalic: !block.editedItalic })}
          className={`flex-1 py-1 text-sm italic rounded transition-colors ${
            block.editedItalic
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          I
        </button>
      </div>

      {/* Text border / stroke */}
      <label className="block text-xs text-gray-400 mb-1">Text Border</label>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => update({ editedStrokeEnabled: !block.editedStrokeEnabled })}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            block.editedStrokeEnabled
              ? "bg-blue-600 text-white"
              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
          }`}
        >
          {block.editedStrokeEnabled ? "On" : "Off"}
        </button>
        {block.editedStrokeEnabled && (
          <>
            <input
              type="color"
              value={block.editedStrokeColor}
              onChange={(e) => update({ editedStrokeColor: e.target.value })}
              className="w-8 h-7 rounded cursor-pointer bg-transparent"
            />
            <input
              type="number"
              value={block.editedStrokeWidth}
              min={0.5}
              max={20}
              step={0.5}
              onChange={(e) => update({ editedStrokeWidth: Number(e.target.value) })}
              className="w-16 bg-gray-700 text-white text-sm rounded p-1"
              title="Stroke width"
            />
          </>
        )}
      </div>

      {/* Letter spacing */}
      <label className="block text-xs text-gray-400 mb-1">Letter Spacing</label>
      <input
        type="number"
        value={block.editedLetterSpacing}
        step={0.1}
        onChange={(e) => update({ editedLetterSpacing: Number(e.target.value) })}
        className="w-full bg-gray-700 text-white text-sm rounded p-1.5 mb-3"
      />

      {/* Line spacing */}
      <label className="block text-xs text-gray-400 mb-1">Line Spacing</label>
      <input
        type="number"
        value={block.editedLineSpacing}
        step={0.1}
        min={0.5}
        max={5}
        onChange={(e) => update({ editedLineSpacing: Number(e.target.value) })}
        className="w-full bg-gray-700 text-white text-sm rounded p-1.5 mb-3"
      />

      {/* Position */}
      <label className="block text-xs text-gray-400 mb-1">Position</label>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <span className="text-[10px] text-gray-500">X</span>
          <input
            type="number"
            value={block.editedX}
            onChange={(e) => update({ editedX: Number(e.target.value) })}
            className="w-full bg-gray-700 text-white text-sm rounded p-1.5"
          />
        </div>
        <div className="flex-1">
          <span className="text-[10px] text-gray-500">Y</span>
          <input
            type="number"
            value={block.editedY}
            onChange={(e) => update({ editedY: Number(e.target.value) })}
            className="w-full bg-gray-700 text-white text-sm rounded p-1.5"
          />
        </div>
      </div>

      {/* Size */}
      <label className="block text-xs text-gray-400 mb-1">Size</label>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <span className="text-[10px] text-gray-500">W</span>
          <input
            type="number"
            value={block.editedWidth}
            onChange={(e) => update({ editedWidth: Number(e.target.value) })}
            className="w-full bg-gray-700 text-white text-sm rounded p-1.5"
          />
        </div>
        <div className="flex-1">
          <span className="text-[10px] text-gray-500">H</span>
          <input
            type="number"
            value={block.editedHeight}
            onChange={(e) => update({ editedHeight: Number(e.target.value) })}
            className="w-full bg-gray-700 text-white text-sm rounded p-1.5"
          />
        </div>
      </div>

      {/* Source info */}
      <div className="border-t border-gray-700 pt-3 mt-2">
        <p className="text-[10px] text-gray-500">
          Source: {block.source_lang} &rarr; {block.target_lang}
        </p>
        <p className="text-[10px] text-gray-500 mt-1 break-all">
          Original: {block.text[block.source_lang] || "—"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => update({ hidden: true })}
          className="flex-1 py-1.5 text-xs bg-red-700 hover:bg-red-600 rounded transition-colors"
        >
          Hide Block
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
          className="flex-1 py-1.5 text-xs bg-gray-600 hover:bg-gray-500 rounded transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
