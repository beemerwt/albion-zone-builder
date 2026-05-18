import type { Point } from "./types";

export type DetectResult = {
  imageData: ImageData;
  corners: Record<"Top" | "Right" | "Bottom" | "Left", Point>;
  usedPadding: boolean;
  positiveLineCount: number;
  negativeLineCount: number;
  debug?: unknown;
};

type WorkerResult = Omit<DetectResult, "imageData">;

type PendingDetection = {
  resolve: (value: WorkerResult) => void;
  reject: (reason?: unknown) => void;
};

let workerInstance: Worker | null = null;
const pendingByRequestId = new Map<string, PendingDetection>();

function ensureWorker(): Worker {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(new URL("../workers/mapBoundsWorker.ts", import.meta.url), {
    type: "module",
  });

  workerInstance.onmessage = (event) => {
    const data = event.data;
    if (!data?.requestId) return;

    if (data.type === "progress") {
      console.debug(`[mapBoundsWorker] ${data.stage}`, data);
      return;
    }

    if (data.type !== "result") return;

    const pending = pendingByRequestId.get(data.requestId);
    if (!pending) return;
    pendingByRequestId.delete(data.requestId);

    if (data.ok) pending.resolve(data.result as WorkerResult);
    else pending.reject(new Error(data.error ?? "Map bounds worker failed"));
  };

  workerInstance.onerror = (event) => {
    const err = new Error(`Map bounds worker crashed: ${event.message || "unknown error"}`);
    for (const pending of pendingByRequestId.values()) pending.reject(err);
    pendingByRequestId.clear();
  };

  return workerInstance;
}

export async function detectMapBoundsWithOpenCv(image: HTMLImageElement): Promise<DetectResult> {
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = image.width;
  fullCanvas.height = image.height;
  const fullCtx = fullCanvas.getContext("2d")!;
  fullCtx.drawImage(image, 0, 0);
  const imageData = fullCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height);

  const detectCanvas = document.createElement("canvas");
  detectCanvas.width = image.width;
  detectCanvas.height = image.height;
  const detectCtx = detectCanvas.getContext("2d")!;
  detectCtx.drawImage(image, 0, 0);
  const detectImageData = detectCtx.getImageData(0, 0, detectCanvas.width, detectCanvas.height);

  const worker = ensureWorker();
  const requestId = crypto.randomUUID();

  const workerResult = await new Promise<WorkerResult>((resolve, reject) => {
    pendingByRequestId.set(requestId, { resolve, reject });
    worker.postMessage({ requestId, imageData: detectImageData });
  });

  return {
    imageData,
    corners: workerResult.corners,
    usedPadding: workerResult.usedPadding,
    positiveLineCount: workerResult.positiveLineCount,
    negativeLineCount: workerResult.negativeLineCount,
  };
}
