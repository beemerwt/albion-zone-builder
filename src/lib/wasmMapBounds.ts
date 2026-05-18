import type { DetectResult } from "./mapBounds";

type WasmDetectResult = {
  corners: DetectResult["corners"];
  usedPadding: boolean;
  positiveLineCount: number;
  negativeLineCount: number;
  timingMs?: {
    grayscale: number;
    edges: number;
    hough: number;
    lineParsing: number;
    totalDetect: number;
  };
};

type WasmModule = {
  default?: () => Promise<unknown>;
  detect_map_bounds_rgba: (width: number, height: number, rgba: Uint8Array) => WasmDetectResult;
};

let wasmInitPromise: Promise<WasmModule> | null = null;

async function ensureWasmInitialized(): Promise<WasmModule> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      const wasmModulePath = "/src/wasm/map-bounds/wasm_map_bounds.js";
      const wasm = (await import(/* @vite-ignore */ wasmModulePath)) as WasmModule;
      if (typeof wasm.default === "function") {
        await wasm.default();
      }
      return wasm;
    })();
  }
  return wasmInitPromise;
}

export async function detectMapBoundsWithWasm(image: HTMLImageElement): Promise<DetectResult> {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const x = c.getContext("2d")!;
  x.drawImage(image, 0, 0);
  const imageData = x.getImageData(0, 0, c.width, c.height);

  if (image.width < 3 || image.height < 3) {
    throw new Error(`WASM detector requires image >= 3x3, got ${image.width}x${image.height}`);
  }

  let wasm: WasmModule;
  try {
    wasm = await ensureWasmInitialized();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to initialize WASM detector module from src/wasm/map-bounds. If you just rebuilt wasm, restart the dev server. Root error: ${message}`,
    );
  }

  let result: WasmDetectResult;
  try {
    result = wasm.detect_map_bounds_rgba(image.width, image.height, new Uint8Array(imageData.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unreachable")) {
      throw new Error(
        "WASM detector trapped ('unreachable'). This usually indicates stale/mismatched generated bindings vs .wasm; rerun `npm run wasm:build` and restart the dev server before retrying.",
      );
    }
    throw error;
  }

  if (!result?.corners) {
    throw new Error("WASM detector returned an invalid result payload");
  }

  return {
    imageData,
    corners: result.corners,
    usedPadding: result.usedPadding,
    positiveLineCount: result.positiveLineCount,
    negativeLineCount: result.negativeLineCount,
  };
}
