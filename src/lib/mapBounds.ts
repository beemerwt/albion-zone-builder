import type { Point } from "./types";

export type DetectResult = {
  imageData: ImageData;
  corners: Record<"Top" | "Right" | "Bottom" | "Left", Point>;
  usedPadding: boolean;
  positiveLineCount: number;
  negativeLineCount: number;
};

type WorkerResult = Omit<DetectResult, "imageData">;

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

  const worker = new Worker(new URL("../workers/mapBoundsWorker.ts", import.meta.url), {
    type: "module",
  });

  try {
    const workerResult = await new Promise<WorkerResult>((resolve, reject) => {
      worker.onmessage = (event) => {
        if (event.data?.ok) resolve(event.data.result as WorkerResult);
        else reject(new Error(event.data?.error ?? "Map bounds worker failed"));
      };
      worker.onerror = () => reject(new Error("Map bounds worker crashed"));
      worker.postMessage({ imageData: detectImageData });
    });

    return {
      imageData,
      corners: workerResult.corners,
      usedPadding: workerResult.usedPadding,
      positiveLineCount: workerResult.positiveLineCount,
      negativeLineCount: workerResult.negativeLineCount,
    };
  } finally {
    worker.terminate();
  }
}
