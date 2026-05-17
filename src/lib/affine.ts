import { AffineMatrix, AffinePair, CornerName, Point } from "./types";

export const CORNER_ORDER: CornerName[] = ["Top", "Right", "Bottom", "Left"];
export const DIAMOND_TO_SQUARE: Record<CornerName, Point> = {
  Top: [0, 1],
  Right: [1, 1],
  Bottom: [1, 0],
  Left: [0, 0],
};

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const det3 = (m: number[][]): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

const inverse3 = (m: number[][]): number[][] => {
  const d = det3(m);
  if (Math.abs(d) < 1e-9) throw new Error("Singular matrix");
  return [
    [
      (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / d,
      (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / d,
      (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / d,
    ],
    [
      (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / d,
      (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / d,
      (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / d,
    ],
    [
      (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / d,
      (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / d,
      (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / d,
    ],
  ];
};

export function solveAffine(src: Point[], dst: Point[]): AffineMatrix {
  if (src.length < 3 || dst.length < 3) throw new Error("Need at least 3 points");
  const A = [
    [src[0][0], src[0][1], 1],
    [src[1][0], src[1][1], 1],
    [src[2][0], src[2][1], 1],
  ];
  const IA = inverse3(A);
  const mul = (M: number[][], v: number[]) => [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
  const cx = mul(IA, [dst[0][0], dst[1][0], dst[2][0]]);
  const cy = mul(IA, [dst[0][1], dst[1][1], dst[2][1]]);
  return [
    [cx[0], cx[1], cx[2]],
    [cy[0], cy[1], cy[2]],
  ];
}

export const applyAffine = (m: AffineMatrix, x: number, y: number): Point => [
  m[0][0] * x + m[0][1] * y + m[0][2],
  m[1][0] * x + m[1][1] * y + m[1][2],
];

export function computeAffine(corners: Record<CornerName, Point>): AffinePair {
  const src = CORNER_ORDER.map((k) => corners[k]);
  const dst = CORNER_ORDER.map((k) => DIAMOND_TO_SQUARE[k]);
  return { inv: solveAffine(src, dst), fwd: solveAffine(dst, src) };
}

export const fallbackCorners = (w: number, h: number): Record<CornerName, Point> => ({
  Top: [(w - 1) * 0.5, 0],
  Right: [w - 1, (h - 1) * 0.5],
  Bottom: [(w - 1) * 0.5, h - 1],
  Left: [0, (h - 1) * 0.5],
});
