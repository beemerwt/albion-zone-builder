import type { Point } from "./types";

export type DetectResult = {
  imageData: ImageData;
  corners: Record<"Top" | "Right" | "Bottom" | "Left", Point>;
  usedPadding: boolean;
  positiveLineCount: number;
  negativeLineCount: number;
};

type WorkerResult = Omit<DetectResult, "imageData">;

const MAX_DETECT_DIMENSION = 900;

function scaleCorners(
  corners: Record<"Top" | "Right" | "Bottom" | "Left", Point>,
  scaleX: number,
  scaleY: number,
): Record<"Top" | "Right" | "Bottom" | "Left", Point> {
  return {
    Top: [corners.Top[0] * scaleX, corners.Top[1] * scaleY],
    Right: [corners.Right[0] * scaleX, corners.Right[1] * scaleY],
    Bottom: [corners.Bottom[0] * scaleX, corners.Bottom[1] * scaleY],
    Left: [corners.Left[0] * scaleX, corners.Left[1] * scaleY],
  };
}

export async function detectMapBoundsWithOpenCv(image: HTMLImageElement): Promise<DetectResult> {
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = image.width;
  fullCanvas.height = image.height;
  const fullCtx = fullCanvas.getContext("2d")!;
  fullCtx.drawImage(image, 0, 0);
  const imageData = fullCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height);

  const ratio = Math.min(1, MAX_DETECT_DIMENSION / Math.max(image.width, image.height));
  const detectWidth = Math.max(1, Math.round(image.width * ratio));
  const detectHeight = Math.max(1, Math.round(image.height * ratio));

  const detectCanvas = document.createElement("canvas");
  detectCanvas.width = detectWidth;
  detectCanvas.height = detectHeight;
  const detectCtx = detectCanvas.getContext("2d")!;
  detectCtx.drawImage(image, 0, 0, detectWidth, detectHeight);
  const detectImageData = detectCtx.getImageData(0, 0, detectWidth, detectHeight);

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

    const scaleX = image.width / detectWidth;
    const scaleY = image.height / detectHeight;

    return {
      imageData,
      corners: scaleCorners(workerResult.corners, scaleX, scaleY),
      usedPadding: workerResult.usedPadding,
      positiveLineCount: workerResult.positiveLineCount,
      negativeLineCount: workerResult.negativeLineCount,
    };
  } finally {
    worker.terminate();
  }
}
