use detect::detect_map_bounds_rgba_native;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn detect_map_bounds_rgba(width: u32, height: u32, rgba: &[u8]) -> Result<JsValue, JsValue> {
    let detect = std::panic::catch_unwind(|| detect_map_bounds_rgba_native(width, height, rgba));
    match detect {
        Ok(Ok(result)) => serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&format!("serialization error: {e}"))),
        Ok(Err(e)) => Err(JsValue::from_str(&e)),
        Err(_) => Err(JsValue::from_str("WASM detector panicked unexpectedly")),
    }
}

pub mod detect;
