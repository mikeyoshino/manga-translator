import JSZip from "jszip";
import type { EditorImage } from "@/types";

export async function exportSingleImage(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.[^.]+$/, "") + "_edited.png";
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAllAsZip(
  canvasGetter: (imageId: string) => HTMLCanvasElement | null,
  images: EditorImage[]
): Promise<void> {
  const zip = new JSZip();

  for (const img of images) {
    const canvas = canvasGetter(img.id);
    if (!canvas) continue;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) continue;

    const name =
      img.originalFile.name.replace(/\.[^.]+$/, "") + "_edited.png";
    zip.file(name, blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = "translated_images.zip";
  a.click();
  URL.revokeObjectURL(url);
}
