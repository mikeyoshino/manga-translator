import { useEditor } from "@/context/EditorContext";
import { availableFonts } from "@/utils/fontMap";
import { getEditorLocale, editorT } from "@/utils/editorI18n";

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group ml-1 inline-flex">
      <svg
        className="w-3.5 h-3.5 text-slate-400 cursor-help"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-normal w-48 z-50 pointer-events-none shadow-lg">
        {text}
      </span>
    </span>
  );
}

const PRESET_COLORS = [
  "#000000", "#ffffff", "#ef4444", "#3b82f6",
  "#22c55e", "#eab308", "#f97316", "#ec4899",
];

function DrawingToolsPanel() {
  const {
    activeTool, penColor, setPenColor, penSize, setPenSize,
    currentImage, drawingLines, undoDrawingLine, clearDrawingLines,
  } = useEditor();
  const locale = getEditorLocale();
  const i = editorT[locale];

  const currentLines = currentImage ? (drawingLines.get(currentImage.id) || []) : [];

  if (activeTool === "eraser") {
    return (
      <div className="w-64 bg-white border-l border-slate-200 p-3 shrink-0 overflow-y-auto">
        <h3 className="text-sm font-bold mb-3 text-slate-700">{i.drawingTools}</h3>

        <label className="block text-xs font-semibold text-slate-500 mb-1">{i.eraserSize}</label>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="range"
            min={5}
            max={50}
            value={penSize}
            onChange={(e) => setPenSize(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs text-slate-600 w-8 text-right">{penSize}px</span>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => currentImage && undoDrawingLine(currentImage.id)}
            disabled={currentLines.length === 0}
            className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
          >
            {i.undo}
          </button>
          <button
            onClick={() => {
              if (currentImage && confirm(i.confirmClearDrawing)) {
                clearDrawingLines(currentImage.id);
              }
            }}
            disabled={currentLines.length === 0}
            className="flex-1 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 disabled:opacity-40 rounded-lg transition-colors"
          >
            {i.clearDrawing}
          </button>
        </div>
      </div>
    );
  }

  // Pen mode
  return (
    <div className="w-64 bg-white border-l border-slate-200 p-3 shrink-0 overflow-y-auto">
      <h3 className="text-sm font-bold mb-3 text-slate-700">{i.drawingTools}</h3>

      {/* Color picker */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.color}</label>
      <div className="flex gap-2 mb-3">
        <input
          type="color"
          value={penColor}
          onChange={(e) => setPenColor(e.target.value)}
          className="w-10 h-8 rounded-lg cursor-pointer bg-transparent border border-slate-200"
        />
        <input
          type="text"
          value={penColor}
          onChange={(e) => setPenColor(e.target.value)}
          className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500/20 outline-none"
        />
      </div>

      {/* Preset colors */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.presetColors}</label>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setPenColor(c)}
            className={`w-6 h-6 rounded-md border-2 transition-colors ${
              penColor === c ? "border-indigo-500" : "border-slate-200"
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>

      {/* Brush size */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.brushSize}</label>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="range"
          min={1}
          max={20}
          value={penSize}
          onChange={(e) => setPenSize(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-slate-600 w-8 text-right">{penSize}px</span>
      </div>

      {/* Undo / Clear */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => currentImage && undoDrawingLine(currentImage.id)}
          disabled={currentLines.length === 0}
          className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
        >
          {i.undo}
        </button>
        <button
          onClick={() => {
            if (currentImage && confirm(i.confirmClearDrawing)) {
              clearDrawingLines(currentImage.id);
            }
          }}
          disabled={currentLines.length === 0}
          className="flex-1 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 disabled:opacity-40 rounded-lg transition-colors"
        >
          {i.clearDrawing}
        </button>
      </div>
    </div>
  );
}

function BlockPropertiesPanel() {
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.font} <InfoTooltip text={i.hintFont} /></label>
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.fontSize} <InfoTooltip text={i.hintFontSize} /></label>
      <input
        type="number"
        value={block.editedFontSize}
        min={6}
        max={200}
        onChange={(e) => update({ editedFontSize: Number(e.target.value) })}
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
      />

      {/* Color */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.color} <InfoTooltip text={i.hintColor} /></label>
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.alignment} <InfoTooltip text={i.hintAlignment} /></label>
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.style} <InfoTooltip text={i.hintStyle} /></label>
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.textBorder} <InfoTooltip text={i.hintTextBorder} /></label>
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.letterSpacing} <InfoTooltip text={i.hintLetterSpacing} /></label>
      <input
        type="number"
        value={block.editedLetterSpacing}
        step={0.1}
        onChange={(e) => update({ editedLetterSpacing: Number(e.target.value) })}
        className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg p-1.5 mb-3 focus:ring-2 focus:ring-indigo-500/20 outline-none"
      />

      {/* Line spacing */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.lineSpacing} <InfoTooltip text={i.hintLineSpacing} /></label>
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.position} <InfoTooltip text={i.hintPosition} /></label>
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
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.size} <InfoTooltip text={i.hintSize} /></label>
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

function MagicRemoverPanel() {
  const {
    currentImage, magicRemoverLines, magicRemoverSize, setMagicRemoverSize,
    undoMagicRemoverLine, clearMagicRemoverLines,
    isInpainting, applyMagicRemover, undoMagicRemover, imageHistory,
  } = useEditor();
  const locale = getEditorLocale();
  const i = editorT[locale];

  const currentLines = currentImage ? (magicRemoverLines.get(currentImage.id) || []) : [];
  const historyStack = currentImage ? (imageHistory.get(currentImage.id) || []) : [];

  return (
    <div className="w-64 bg-white border-l border-slate-200 p-3 shrink-0 overflow-y-auto">
      <h3 className="text-sm font-bold mb-3 text-fuchsia-700">{i.magicRemover}</h3>

      {/* Brush size */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.brushSize}</label>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="range"
          min={5}
          max={100}
          value={magicRemoverSize}
          onChange={(e) => setMagicRemoverSize(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-slate-600 w-8 text-right">{magicRemoverSize}px</span>
      </div>

      {/* Undo stroke / Clear all */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => currentImage && undoMagicRemoverLine(currentImage.id)}
          disabled={currentLines.length === 0}
          className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
        >
          {i.undo}
        </button>
        <button
          onClick={() => currentImage && clearMagicRemoverLines(currentImage.id)}
          disabled={currentLines.length === 0}
          className="flex-1 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 disabled:opacity-40 rounded-lg transition-colors"
        >
          {i.clearMask}
        </button>
      </div>

      {/* Apply button */}
      <button
        onClick={() => currentImage && applyMagicRemover(currentImage.id)}
        disabled={isInpainting || currentLines.length === 0}
        className="w-full py-2 text-sm font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isInpainting ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {i.removing}
          </>
        ) : (
          i.applyRemoval
        )}
      </button>

      {/* Undo removal */}
      {historyStack.length > 0 && (
        <button
          onClick={() => currentImage && undoMagicRemover(currentImage.id)}
          disabled={isInpainting}
          className="w-full mt-2 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
        >
          {i.undoRemoval}
        </button>
      )}
    </div>
  );
}

function ManualTranslatePanel() {
  const {
    currentImage, manualTranslateRect, clearManualTranslateRect,
    isManualTranslating, applyManualTranslate, manualTranslateError,
  } = useEditor();
  const locale = getEditorLocale();
  const i = editorT[locale];

  const rect = currentImage ? manualTranslateRect.get(currentImage.id) ?? null : null;

  return (
    <div className="w-64 bg-white border-l border-slate-200 p-3 shrink-0 overflow-y-auto">
      <h3 className="text-sm font-bold mb-3 text-teal-700">{i.manualTranslate}</h3>

      {!rect ? (
        <p className="text-xs text-slate-500">{i.manualTranslateHint}</p>
      ) : (
        <>
          <label className="block text-xs font-semibold text-slate-500 mb-1">{i.regionInfo}</label>
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 mb-3">
            <span>X: {Math.round(rect.x)}, Y: {Math.round(rect.y)}</span>
            <br />
            <span>W: {Math.round(rect.width)} × H: {Math.round(rect.height)}</span>
          </div>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => currentImage && clearManualTranslateRect(currentImage.id)}
              disabled={isManualTranslating}
              className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
            >
              {i.clearRect}
            </button>
          </div>

          <button
            onClick={() => currentImage && applyManualTranslate(currentImage.id)}
            disabled={isManualTranslating}
            className="w-full py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isManualTranslating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {i.translatingRegion}
              </>
            ) : (
              i.applyTranslation
            )}
          </button>
        </>
      )}

      {manualTranslateError && (
        <p className="mt-2 text-xs text-red-600 font-medium">
          {manualTranslateError === "noTextDetected" ? i.noTextDetected : manualTranslateError}
        </p>
      )}
    </div>
  );
}

function CloneStampPanel() {
  const {
    currentImage, cloneStampSource, cloneStampSize, setCloneStampSize,
    cloneStampOpacity, setCloneStampOpacity,
    clearCloneStampSource, cloneStampStrokes,
    undoCloneStampStroke, clearCloneStampStrokes,
    isCloneStamping, applyCloneStamp,
  } = useEditor();
  const locale = getEditorLocale();
  const i = editorT[locale];

  const source = currentImage ? (cloneStampSource.get(currentImage.id) ?? null) : null;
  const strokes = currentImage ? (cloneStampStrokes.get(currentImage.id) || []) : [];

  return (
    <div className="w-64 bg-white border-l border-slate-200 p-3 shrink-0 overflow-y-auto">
      <h3 className="text-sm font-bold mb-3 text-amber-700">{i.cloneStamp}</h3>

      {/* Source point */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.sourcePoint}</label>
      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 mb-3">
        {source
          ? `X: ${Math.round(source.x)}, Y: ${Math.round(source.y)}`
          : (locale === "th" ? "ยังไม่ได้ตั้ง" : "Not set")}
      </div>

      {/* Brush size */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.brushSize}</label>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="range"
          min={5}
          max={100}
          value={cloneStampSize}
          onChange={(e) => setCloneStampSize(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-slate-600 w-8 text-right">{cloneStampSize}px</span>
      </div>

      {/* Opacity */}
      <label className="block text-xs font-semibold text-slate-500 mb-1">{i.opacity}</label>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(cloneStampOpacity * 100)}
          onChange={(e) => setCloneStampOpacity(Number(e.target.value) / 100)}
          className="flex-1"
        />
        <span className="text-xs text-slate-600 w-8 text-right">{Math.round(cloneStampOpacity * 100)}%</span>
      </div>

      {/* Clear source / Clear strokes */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => currentImage && clearCloneStampSource(currentImage.id)}
          disabled={!source}
          className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
        >
          {i.clearSource}
        </button>
        <button
          onClick={() => currentImage && clearCloneStampStrokes(currentImage.id)}
          disabled={strokes.length === 0}
          className="flex-1 py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 disabled:opacity-40 rounded-lg transition-colors"
        >
          {i.clearStrokes}
        </button>
      </div>

      {/* Undo stroke */}
      <button
        onClick={() => currentImage && undoCloneStampStroke(currentImage.id)}
        disabled={strokes.length === 0}
        className="w-full mb-2 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
      >
        {i.undo}
      </button>

      {/* Apply button */}
      <button
        onClick={() => currentImage && applyCloneStamp(currentImage.id)}
        disabled={isCloneStamping || strokes.length === 0}
        className="w-full py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isCloneStamping ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            ...
          </>
        ) : (
          i.applyCloneStamp
        )}
      </button>

      {/* Bilingual guide */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-xs font-bold text-amber-800 mb-2">{i.guideTitle}</p>
        <ol className="space-y-2 text-xs">
          <li>
            <span className="text-slate-700">1. {i.guideStep1_th}</span>
            <br />
            <span className="text-slate-400">&nbsp;&nbsp;&nbsp;{i.guideStep1_en}</span>
          </li>
          <li>
            <span className="text-slate-700">2. {i.guideStep2_th}</span>
            <br />
            <span className="text-slate-400">&nbsp;&nbsp;&nbsp;{i.guideStep2_en}</span>
          </li>
          <li>
            <span className="text-slate-700">3. {i.guideStep3_th}</span>
            <br />
            <span className="text-slate-400">&nbsp;&nbsp;&nbsp;{i.guideStep3_en}</span>
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-amber-700">
          <span>💡 {i.guideTip_th}</span>
          <br />
          <span className="text-slate-400">&nbsp;&nbsp;&nbsp;{i.guideTip_en}</span>
        </p>
      </div>
    </div>
  );
}

export function EditorPropertiesPanel() {
  const { activeTool } = useEditor();

  if (activeTool === "cloneStamp") {
    return <CloneStampPanel />;
  }

  if (activeTool === "manualTranslate") {
    return <ManualTranslatePanel />;
  }

  if (activeTool === "magicRemover") {
    return <MagicRemoverPanel />;
  }

  if (activeTool === "pen" || activeTool === "eraser") {
    return <DrawingToolsPanel />;
  }

  return <BlockPropertiesPanel />;
}
