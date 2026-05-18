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

function summarizeArgs(width: number, height: number, bytes: Uint8Array) {
  const expected = width * height * 4;
  return {
    width,
    height,
    bytesLength: bytes.length,
    expectedBytes: expected,
    channelsPerPixel: width > 0 && height > 0 ? bytes.length / (width * height) : 0,
  };
}

async function ensureWasmInitialized(): Promise<WasmModule> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      const wasmModulePath = "/src/wasm/map-bounds/wasm_map_bounds.js";
      const wasm = (await import(/* @vite-ignore */ wasmModulePath)) as WasmModule;
      if (typeof wasm.default === "function") await wasm.default();
      return wasm;
    })();
  }
  return wasmInitPromise;
}

export async function diagnoseWasmDetectorInputs(image: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const x = c.getContext("2d")!;
  x.drawImage(image, 0, 0);
  const imageData = x.getImageData(0, 0, c.width, c.height);
  const rgba = new Uint8Array(imageData.data);

  const wasm = await ensureWasmInitialized();
  const tinyValid = new Uint8Array([
    0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
  ]);

  return {
    modulePath: "/src/wasm/map-bounds/wasm_map_bounds.js",
    actualImage: summarizeArgs(image.width, image.height, rgba),
    tinyValid1x4: summarizeArgs(1, 4, tinyValid),
    invalidShape1x1x3: summarizeArgs(1, 1, new Uint8Array([1, 2, 3])),
    runTinyValid: () => wasm.detect_map_bounds_rgba(1, 4, tinyValid),
    runInvalidShape: () => wasm.detect_map_bounds_rgba(1, 1, new Uint8Array([1, 2, 3])),
    runActual: () => wasm.detect_map_bounds_rgba(image.width, image.height, rgba),
  };
}

export async function detectMapBoundsWithWasm(image: HTMLImageElement): Promise<DetectResult> {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const x = c.getContext("2d")!;
  x.drawImage(image, 0, 0);
  const imageData = x.getImageData(0, 0, c.width, c.height);
  const rgba = new Uint8Array(imageData.data);

  if (image.width < 3 || image.height < 3) {
    throw new Error(`WASM detector requires image >= 3x3, got ${image.width}x${image.height}`);
  }

  let wasm: WasmModule;
  try {
    wasm = await ensureWasmInitialized();
  } catch (error) {
    console.error("WASM module initialization failed", { error });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to initialize WASM detector module from src/wasm/map-bounds. If you just rebuilt wasm, restart the dev server. Root error: ${message}`,
    );
  }

  try {
    const result = wasm.detect_map_bounds_rgba(image.width, image.height, rgba);
    if (!result?.corners) throw new Error("WASM detector returned an invalid result payload");

    return {
      imageData,
      corners: result.corners,
      usedPadding: result.usedPadding,
      positiveLineCount: result.positiveLineCount,
      negativeLineCount: result.negativeLineCount,
    };
  } catch (error) {
    const args = summarizeArgs(image.width, image.height, rgba);
    console.error("WASM detect_map_bounds_rgba failed", {
      error,
      stack: error instanceof Error ? error.stack : undefined,
      args,
      note: "unreachable can indicate Rust panic/assert/unwrap/indexing error, invalid input shape, or explicit unreachable",
    });

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unreachable")) {
      throw new Error(
        `WASM detector trapped ('unreachable'). This can mean Rust panic/assert/unwrap/indexing failure, invalid input shape, explicit unreachable, or stale bindings. Args: ${JSON.stringify(args)}`,
      );
    }
    throw error;
  }
}
