export type Point = [number, number];
export type CornerName = "Top" | "Right" | "Bottom" | "Left";

export type PortData = {
  x: number;
  y: number;
  connectsTo?: { zoneId: string; port: string };
  type?: "one-to-one" | "many-to-one";
};

export type Zone = {
  id?: string;
  name?: string;
  ports?: Record<string, PortData>;
} & Record<string, unknown>;

export type WorldJson = {
  schemaVersion: number;
  zones: Zone[];
} & Record<string, unknown>;

export type AffineMatrix = [[number, number, number], [number, number, number]];
export type AffinePair = { inv: AffineMatrix; fwd: AffineMatrix };
