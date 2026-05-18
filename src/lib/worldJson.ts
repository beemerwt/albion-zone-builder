import { WorldJson } from "./types";

export const DEFAULT_PORT_NAMES = ["NW", "NE", "SE", "SW", "NW2", "NE2", "SE2", "SW2"];

export const WORLD_STORAGE_KEY = "albion-zone-builder:world";

export function isValidWorldJson(data: unknown): data is WorldJson {
  if (!data || typeof data !== "object") return false;
  const world = data as Record<string, unknown>;
  const schemaVersion = world.schemaVersion;
  if (schemaVersion === undefined || schemaVersion === null) return false;
  if (typeof schemaVersion !== "number") return false;
  return Array.isArray(world.zones);
}

export function loadWorldFromLocalStorage(): WorldJson | null {
  try {
    const raw = localStorage.getItem(WORLD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidWorldJson(parsed) ? parsed : null;
  } catch (error) {
    console.error("Failed to load world from localStorage", error);
    return null;
  }
}

export function saveWorldToLocalStorage(world: WorldJson): boolean {
  try {
    localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(world));
    return true;
  } catch (error) {
    console.error("Failed to save world to localStorage", error);
    return false;
  }
}

export async function fetchServerWorld(): Promise<WorldJson> {
  const response = await fetch("/world.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch /world.json (${response.status})`);
  }
  const parsed = await response.json();
  if (!isValidWorldJson(parsed)) {
    throw new Error(
      "Fetched world.json is invalid. Expected schemaVersion:number and zones:array.",
    );
  }
  return parsed;
}

export function normalizeZoneName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function zoneIdFromName(input: string): string {
  const normalized = normalizeZoneName(input).toLowerCase();
  return normalized
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
