import { describe, it, expect } from "vitest";
import { initEditableBlocksWithOffset } from "@/utils/initEditableBlocks";
import type { TranslationBlock } from "@/types";

function makeBlock(overrides: Partial<TranslationBlock> = {}): TranslationBlock {
  return {
    minX: 10,
    minY: 20,
    maxX: 110,
    maxY: 70,
    is_bulleted_list: false,
    angle: 0,
    prob: 0.95,
    text_color: { fg: [0, 0, 0], bg: [255, 255, 255] },
    text: { THA: "สวัสดี" },
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
    ...overrides,
  };
}

describe("initEditableBlocksWithOffset", () => {
  it("offsets coordinates by the given x/y", () => {
    const blocks = initEditableBlocksWithOffset(
      [makeBlock()],
      "THA",
      100,
      200,
      "manual-123"
    );

    expect(blocks).toHaveLength(1);
    const b = blocks[0];
    // Original coords were minX=10, minY=20, maxX=110, maxY=70
    expect(b.minX).toBe(110); // 10 + 100
    expect(b.minY).toBe(220); // 20 + 200
    expect(b.maxX).toBe(210); // 110 + 100
    expect(b.maxY).toBe(270); // 70 + 200
    expect(b.editedX).toBe(110); // minX + offsetX
    expect(b.editedY).toBe(220); // minY + offsetY
  });

  it("assigns unique IDs with the given prefix", () => {
    const blocks = initEditableBlocksWithOffset(
      [makeBlock(), makeBlock()],
      "THA",
      0,
      0,
      "manual-456"
    );

    expect(blocks[0].id).toBe("manual-456-0");
    expect(blocks[1].id).toBe("manual-456-1");
  });

  it("returns empty array for empty input", () => {
    const blocks = initEditableBlocksWithOffset([], "THA", 50, 50, "manual-789");
    expect(blocks).toEqual([]);
  });

  it("preserves editedWidth and editedHeight (not offset)", () => {
    const blocks = initEditableBlocksWithOffset(
      [makeBlock()],
      "THA",
      100,
      200,
      "manual-abc"
    );

    const b = blocks[0];
    // Width/height should be same as original block dimensions
    expect(b.editedWidth).toBe(100); // maxX - minX = 110 - 10
    expect(b.editedHeight).toBe(50); // maxY - minY = 70 - 20
  });
});
