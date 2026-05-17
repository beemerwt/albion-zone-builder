import type { Point } from "./types";
export type DetectResult = {
  imageData: ImageData;
  corners: Record<"Top" | "Right" | "Bottom" | "Left", Point>;
  usedPadding: boolean;
  positiveLineCount: number;
  negativeLineCount: number;
};
export function detectMapBoundsWithOpenCv(cv: any, image: HTMLImageElement): DetectResult {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const x = c.getContext("2d")!;
  x.drawImage(image, 0, 0);
  let src = cv.imread(c);
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
  let edges = new cv.Mat();
  cv.Canny(gray, edges, 50, 150);
  let lines = new cv.Mat();
  cv.HoughLinesP(
    edges,
    lines,
    1,
    Math.PI / 180,
    60,
    Math.max(160, Math.min(c.width, c.height) * 0.28),
    Math.max(15, Math.min(c.width, c.height) * 0.035),
  );
  const pos: any[] = [],
    neg: any[] = [];
  for (let i = 0; i < lines.rows; i++) {
    const l = lines.data32S.subarray(i * 4, i * 4 + 4);
    const [x1, y1, x2, y2] = l;
    const dx = x2 - x1,
      dy = y2 - y1;
    if (Math.abs(dx) < 1e-6) continue;
    const m = dy / dx;
    const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    if (!((ang >= 28 && ang <= 42) || (ang >= 138 && ang <= 152))) continue;
    const b = y1 - m * x1;
    (m > 0 ? pos : neg).push({ x1, y1, x2, y2, b });
  }
  const fb = {
    Top: [(c.width - 1) / 2, 0],
    Right: [c.width - 1, (c.height - 1) / 2],
    Bottom: [(c.width - 1) / 2, c.height - 1],
    Left: [0, (c.height - 1) / 2],
  } as any;
  if (pos.length < 2 || neg.length < 2) {
    const data = x.getImageData(0, 0, c.width, c.height);
    src.delete();
    gray.delete();
    edges.delete();
    lines.delete();
    return {
      imageData: data,
      corners: fb,
      usedPadding: false,
      positiveLineCount: pos.length,
      negativeLineCount: neg.length,
    };
  }
  const fit = (arr: any[], which: "min" | "max") =>
    arr.sort((a, b) => a.b - b.b)[which === "min" ? 0 : arr.length - 1];
  const tr = fit(pos, "min"),
    bl = fit(pos, "max"),
    tl = fit(neg, "min"),
    br = fit(neg, "max");
  const inter = (L1: any, L2: any): Point => {
    const a1 = L1.y2 - L1.y1,
      b1 = L1.x1 - L1.x2,
      c1 = a1 * L1.x1 + b1 * L1.y1;
    const a2 = L2.y2 - L2.y1,
      b2 = L2.x1 - L2.x2,
      c2 = a2 * L2.x1 + b2 * L2.y1;
    const d = a1 * b2 - a2 * b1;
    if (Math.abs(d) < 1e-9) return [0, 0];
    return [(b2 * c1 - b1 * c2) / d, (a1 * c2 - a2 * c1) / d];
  };
  const corners = {
    Top: inter(tl, tr),
    Right: inter(tr, br),
    Bottom: inter(bl, br),
    Left: inter(tl, bl),
  } as any;
  const data = x.getImageData(0, 0, c.width, c.height);
  src.delete();
  gray.delete();
  edges.delete();
  lines.delete();
  return {
    imageData: data,
    corners,
    usedPadding: false,
    positiveLineCount: pos.length,
    negativeLineCount: neg.length,
  };
}
