import type { StatusKey, TranslationResponseJson } from "@/types";

export interface JsonStreamCallbacks {
  onStatus: (status: StatusKey) => void;
  onResult: (response: TranslationResponseJson) => void;
  onError: (error: string) => void;
  onQueuePos: (pos: string) => void;
}

export async function translateWithJsonStream(
  file: File,
  config: string,
  callbacks: JsonStreamCallbacks,
  accessToken?: string
): Promise<void> {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("config", config);

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`/api/translate/with-form/json/stream`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (response.status !== 200) {
    throw new Error("Upload failed");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Failed to get stream reader");

  let buffer = new Uint8Array();

  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;

    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    buffer = newBuffer;

    while (buffer.length >= 5) {
      const dataSize = new DataView(buffer.buffer).getUint32(1, false);
      const totalSize = 5 + dataSize;
      if (buffer.length < totalSize) break;

      const statusCode = buffer[0];
      const data = buffer.slice(5, totalSize);
      const decoded = new TextDecoder("utf-8").decode(data);

      switch (statusCode) {
        case 0: {
          const parsed: TranslationResponseJson = JSON.parse(decoded);
          callbacks.onResult(parsed);
          break;
        }
        case 1:
          callbacks.onStatus(decoded as StatusKey);
          break;
        case 2:
          callbacks.onError(decoded);
          break;
        case 3:
          callbacks.onQueuePos(decoded);
          break;
      }

      buffer = buffer.slice(totalSize);
    }
  }
}
