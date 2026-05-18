use image::ImageReader;
use serde_json::to_string_pretty;
use wasm_map_bounds::detect::detect_map_bounds_rgba_native;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).ok_or("usage: cargo run --example detect <path/to/image.png>")?;
    let img = ImageReader::open(path)?.decode()?.to_rgba8();
    let (w, h) = img.dimensions();
    let result = detect_map_bounds_rgba_native(w, h, img.as_raw())?;
    println!("{}", to_string_pretty(&result)?);
    Ok(())
}
