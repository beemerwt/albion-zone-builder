use detect::detect_map_bounds_rgba_native;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn detect_map_bounds_rgba(width: u32, height: u32, rgba: &[u8]) -> Result<JsValue, JsValue> {
    match detect_map_bounds_rgba_native(width, height, rgba) {
        Ok(result) => serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&format!("serialization error: {e}"))),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

pub mod detect;
