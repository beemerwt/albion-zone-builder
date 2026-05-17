import { WorldJson } from "./types";

export const DEFAULT_PORT_NAMES = ["NW", "NE", "SE", "SW", "NW2", "NE2", "SE2", "SW2"];

export const parseWorldFile = async (file: File): Promise<WorldJson> =>
  JSON.parse(await file.text()) as WorldJson;

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
