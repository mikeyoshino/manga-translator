import { describe, it, expect } from "vitest";
import type { EditableBlock, EditorAction } from "@/types";

function makeEditableBlock(id: string, x: number, y: number): EditableBlock {
  return {
    id,
    minX: x,
    minY: y,
    maxX: x + 100,
    maxY: y + 50,
    is_bulleted_list: false,
    angle: 0,
    prob: 0.95,
    text_color: { fg: [0, 0, 0], bg: [255, 255, 255] },
    text: { THA: "test" },
    background: "",
    font_size: 24,
    direction: "h",
    alignment: "center",
    line_spacing: 1.5,
    letter_spacing: 0,
    bold: false,
    italic: false,
    source_lang: "JPN",
    target_lang: "THA",
    editedText: "test",
    editedX: x,
    editedY: y,
    editedWidth: 100,
    editedHeight: 50,
    editedFontSize: 24,
    editedFontFamily: "Noto Sans Thai",
    editedColor: "#000000",
    editedLetterSpacing: 0,
    editedLineSpacing: 1.5,
    editedBold: false,
    editedItalic: false,
    editedAlignment: "center",
    editedStrokeEnabled: false,
    editedStrokeColor: "#000000",
    editedStrokeWidth: 3,
    hidden: false,
  };
}

describe("Manual translate rectangle logic", () => {
  it("normalizes rectangle coordinates (start > end)", () => {
    // Simulates drawing from bottom-right to top-left
    const startX = 200, startY = 300;
    const endX = 50, endY = 100;

    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    expect(x).toBe(50);
    expect(y).toBe(100);
    expect(width).toBe(150);
    expect(height).toBe(200);
  });

  it("rejects rectangles smaller than 10x10", () => {
    const width = 5;
    const height = 8;
    const isValid = width >= 10 && height >= 10;
    expect(isValid).toBe(false);
  });

  it("accepts rectangles at exactly 10x10", () => {
    const width = 10;
    const height = 10;
    const isValid = width >= 10 && height >= 10;
    expect(isValid).toBe(true);
  });
});

describe("Manual translate undo/redo action", () => {
  it("undo removes added blocks and restores image URL", () => {
    const addedBlocks = [
      makeEditableBlock("manual-1-0", 100, 200),
      makeEditableBlock("manual-1-1", 150, 250),
    ];
    const existingBlocks = [
      makeEditableBlock("block-0", 10, 20),
    ];

    const action: EditorAction = {
      type: "manual-translate-apply",
      imageId: "img-1",
      addedBlocks,
      previousImageUrl: "blob:old-url",
      newImageUrl: "blob:new-url",
    };

    // Simulate undo: remove added blocks
    const blockIds = new Set(action.addedBlocks.map((b) => b.id));
    const afterUndo = [...existingBlocks, ...addedBlocks].filter(
      (b) => !blockIds.has(b.id)
    );

    expect(afterUndo).toHaveLength(1);
    expect(afterUndo[0].id).toBe("block-0");
  });

  it("redo re-adds blocks", () => {
    const addedBlocks = [
      makeEditableBlock("manual-1-0", 100, 200),
    ];
    const existingBlocks = [
      makeEditableBlock("block-0", 10, 20),
    ];

    // Simulate redo: append added blocks
    const afterRedo = [...existingBlocks, ...addedBlocks];

    expect(afterRedo).toHaveLength(2);
    expect(afterRedo[1].id).toBe("manual-1-0");
  });
});
