import type { Point } from "../lib/types";

type WorkerRequest = {
  imageData: ImageData;
};

type WorkerResponse = {
  corners: Record<"Top" | "Right" | "Bottom" | "Left", Point>;
  usedPadding: boolean;
  positiveLineCount: number;
  negativeLineCount: number;
  timingMs?: {
    runtimeInit: number;
    detect: number;
  };
};

let cvPromise: Promise<any> | null = null;

async function loadOpenCvInWorker(): Promise<any> {
  if ((self as any).cv?.Mat) return (self as any).cv;
  if (cvPromise) return cvPromise;

  cvPromise = new Promise(async (resolve, reject) => {
    try {
      const startedAt = performance.now();
      (self as any).Module = {
        onRuntimeInitialized: () => {
          const cv = (self as any).cv;
          (cv as any).__runtimeInitMs = performance.now() - startedAt;
          resolve(cv);
        },
      };
      const response = await fetch("/opencv.js");
      if (!response.ok) throw new Error(`OpenCV.js fetch failed: ${response.status}`);
      const source = await response.text();
      eval(source);
    } catch (err) {
      reject(err);
    }
  });

  return cvPromise;
}

function intersectLines(L1: any, L2: any): Point {
  const a1 = L1.y2 - L1.y1;
  const b1 = L1.x1 - L1.x2;
  const c1 = a1 * L1.x1 + b1 * L1.y1;
  const a2 = L2.y2 - L2.y1;
  const b2 = L2.x1 - L2.x2;
  const c2 = a2 * L2.x1 + b2 * L2.y1;
  const d = a1 * b2 - a2 * b1;
  if (Math.abs(d) < 1e-9) return [0, 0];
  return [(b2 * c1 - b1 * c2) / d, (a1 * c2 - a2 * c1) / d];
}

function detectFromImageData(cv: any, imageData: ImageData): WorkerResponse {
  const fallback = {
    Top: [(imageData.width - 1) / 2, 0],
    Right: [imageData.width - 1, (imageData.height - 1) / 2],
    Bottom: [(imageData.width - 1) / 2, imageData.height - 1],
    Left: [0, (imageData.height - 1) / 2],
  } as Record<"Top" | "Right" | "Bottom" | "Left", Point>;

  const detectStart = performance.now();
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const lines = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 50, 150);
    cv.HoughLinesP(
      edges,
      lines,
      1,
      Math.PI / 180,
      60,
      Math.max(160, Math.min(imageData.width, imageData.height) * 0.28),
      Math.max(15, Math.min(imageData.width, imageData.height) * 0.035),
    );

    const pos: any[] = [];
    const neg: any[] = [];

    for (let i = 0; i < lines.rows; i++) {
      const l = lines.data32S.subarray(i * 4, i * 4 + 4);
      const [x1, y1, x2, y2] = l;
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (Math.abs(dx) < 1e-6) continue;
      const m = dy / dx;
      const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
      if (!((ang >= 28 && ang <= 42) || (ang >= 138 && ang <= 152))) continue;
      const b = y1 - m * x1;
      (m > 0 ? pos : neg).push({ x1, y1, x2, y2, b });
    }

    if (pos.length < 2 || neg.length < 2) {
      return {
        corners: fallback,
        usedPadding: false,
        positiveLineCount: pos.length,
        negativeLineCount: neg.length,
        timingMs: { runtimeInit: cv.__runtimeInitMs ?? 0, detect: performance.now() - detectStart },
      };
    }

    const fit = (arr: any[], which: "min" | "max") =>
      arr.sort((a, b) => a.b - b.b)[which === "min" ? 0 : arr.length - 1];

    const tr = fit(pos, "min");
    const bl = fit(pos, "max");
    const tl = fit(neg, "min");
    const br = fit(neg, "max");

    return {
      corners: {
        Top: intersectLines(tl, tr),
        Right: intersectLines(tr, br),
        Bottom: intersectLines(bl, br),
        Left: intersectLines(tl, bl),
      },
      usedPadding: false,
      positiveLineCount: pos.length,
      negativeLineCount: neg.length,
      timingMs: { runtimeInit: cv.__runtimeInitMs ?? 0, detect: performance.now() - detectStart },
    };
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    lines.delete();
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const cv = await loadOpenCvInWorker();
    const result = detectFromImageData(cv, event.data.imageData);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
};
