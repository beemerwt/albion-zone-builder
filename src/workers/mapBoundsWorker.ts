import cvModule from "@techstark/opencv-js";
import type { Point } from "../lib/types";

type WorkerRequest = {
  requestId: string;
  imageData: ImageData;
};

type DetectTiming = {
  runtimeInit: number;
  matFromImageData: number;
  grayscale: number;
  blur: number;
  canny: number;
  hough: number;
  lineParsing: number;
  totalDetect: number;
};

type WorkerResponse = {
  corners: Record<"Top" | "Right" | "Bottom" | "Left", Point>;
  usedPadding: boolean;
  positiveLineCount: number;
  negativeLineCount: number;
  timingMs?: DetectTiming;
};

let cvPromise: Promise<any> | null = null;
let runtimeInitMs = 0;

function postProgress(requestId: string, stage: string, extra?: Record<string, unknown>) {
  self.postMessage({ type: "progress", requestId, stage, ...extra });
}

function missingApis(cv: any): string[] {
  const missing: string[] = [];
  if (!cv?.Mat) missing.push("cv.Mat");
  if (!cv?.matFromImageData) missing.push("cv.matFromImageData");
  if (!cv?.HoughLinesP) missing.push("cv.HoughLinesP");
  return missing;
}

async function loadOpenCvInWorker(): Promise<any> {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise((resolve, reject) => {
    const initStart = performance.now();
    const cv = cvModule as any;
    const ready = () => {
      const missing = missingApis(cv);
      if (missing.length === 0) {
        runtimeInitMs = performance.now() - initStart;
        resolve(cv);
        return true;
      }
      return false;
    };

    if (ready()) return;

    const timer = setTimeout(() => {
      const missing = missingApis(cv);
      reject(new Error(`OpenCV init timed out after 10000ms; missing APIs: ${missing.join(", ")}`));
    }, 10000);

    cv.onRuntimeInitialized = () => {
      if (!ready()) {
        clearTimeout(timer);
        const missing = missingApis(cv);
        reject(
          new Error(`OpenCV runtime initialized but APIs still missing: ${missing.join(", ")}`),
        );
        return;
      }
      clearTimeout(timer);
    };
  }).catch((err) => {
    cvPromise = null;
    throw err;
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

function detectFromImageData(cv: any, imageData: ImageData, requestId: string): WorkerResponse {
  const fallback = {
    Top: [(imageData.width - 1) / 2, 0],
    Right: [imageData.width - 1, (imageData.height - 1) / 2],
    Bottom: [(imageData.width - 1) / 2, imageData.height - 1],
    Left: [0, (imageData.height - 1) / 2],
  } as Record<"Top" | "Right" | "Bottom" | "Left", Point>;

  const totalStart = performance.now();
  const timing: DetectTiming = {
    runtimeInit: runtimeInitMs,
    matFromImageData: 0,
    grayscale: 0,
    blur: 0,
    canny: 0,
    hough: 0,
    lineParsing: 0,
    totalDetect: 0,
  };

  postProgress(requestId, "matFromImageData started");
  const tMat = performance.now();
  const src = cv.matFromImageData(imageData);
  timing.matFromImageData = performance.now() - tMat;
  postProgress(requestId, "matFromImageData done", { ms: timing.matFromImageData });

  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const lines = new cv.Mat();

  try {
    const tGray = performance.now();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    timing.grayscale = performance.now() - tGray;
    postProgress(requestId, "grayscale done", { ms: timing.grayscale });

    const tBlur = performance.now();
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    timing.blur = performance.now() - tBlur;
    postProgress(requestId, "blur done", { ms: timing.blur });

    const tCanny = performance.now();
    cv.Canny(gray, edges, 50, 150);
    timing.canny = performance.now() - tCanny;
    postProgress(requestId, "canny done", { ms: timing.canny });

    postProgress(requestId, "hough started");
    const tHough = performance.now();
    cv.HoughLinesP(
      edges,
      lines,
      1,
      Math.PI / 180,
      100,
      Math.max(180, Math.min(imageData.width, imageData.height) * 0.35),
      Math.max(10, Math.min(imageData.width, imageData.height) * 0.02),
    );
    timing.hough = performance.now() - tHough;
    postProgress(requestId, "hough done", { ms: timing.hough, rows: lines.rows });

    if (lines.rows > 25000) {
      throw new Error(
        `HoughLinesP produced too many rows (${lines.rows}); aborting parse for safety`,
      );
    }

    const tParse = performance.now();
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
    timing.lineParsing = performance.now() - tParse;

    timing.totalDetect = performance.now() - totalStart;

    if (pos.length < 2 || neg.length < 2) {
      postProgress(requestId, "detection complete", { fallback: true });
      return {
        corners: fallback,
        usedPadding: false,
        positiveLineCount: pos.length,
        negativeLineCount: neg.length,
        timingMs: timing,
      };
    }

    const fit = (arr: any[], which: "min" | "max") =>
      arr.sort((a, b) => a.b - b.b)[which === "min" ? 0 : arr.length - 1];

    const tr = fit(pos, "min");
    const bl = fit(pos, "max");
    const tl = fit(neg, "min");
    const br = fit(neg, "max");

    postProgress(requestId, "detection complete", { fallback: false });
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
      timingMs: timing,
    };
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    lines.delete();
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { requestId, imageData } = event.data;
  postProgress(requestId, "worker received message", {
    width: imageData.width,
    height: imageData.height,
  });

  try {
    const cv = await loadOpenCvInWorker();
    postProgress(requestId, "OpenCV loaded", { runtimeInitMs });
    const result = detectFromImageData(cv, imageData, requestId);
    self.postMessage({ type: "result", requestId, ok: true, result });
  } catch (error) {
    self.postMessage({
      type: "result",
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
};
