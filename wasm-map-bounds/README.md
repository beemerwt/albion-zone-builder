# wasm-map-bounds

Standalone Rust/WASM detector for Albion map diamond bounds.

## Prerequisites

- Rust (stable): https://rustup.rs
- `wasm-pack` (for wasm build):
  - `cargo install wasm-pack`

## Native testing

```bash
cd wasm-map-bounds
cargo test
```

## Build WASM package

```bash
cd wasm-map-bounds
wasm-pack build --target web --out-dir ../src/wasm/map-bounds
```

This outputs JS/WASM bindings consumed by the Vite app.

## Optional CLI tuning helper

```bash
cd wasm-map-bounds
cargo run --example detect ./some-image.png
```

Prints detected corners and counts as JSON.

## Algorithm overview

1. RGBA -> grayscale
2. Sobel gradient magnitude + thresholded edge map
3. Constrained Hough voting for angle windows around map diagonals
   - positive-slope family: ~28°..42°
   - negative-slope family: ~138°..152°
4. Select extreme rho lines and intersect to produce `Top/Right/Bottom/Left`
5. Fallback to centered diamond if insufficient lines are found

Thresholds/angle ranges are defined in `src/detect.rs` and intentionally easy to tune.

## App integration

The main app wrapper is at `src/lib/wasmMapBounds.ts`.
It loads the generated package from `src/wasm/map-bounds` and returns the app `DetectResult` shape.
