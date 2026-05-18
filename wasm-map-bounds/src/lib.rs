use detect::detect_map_bounds_rgba_native;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn wasm_start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn detect_map_bounds_rgba(width: u32, height: u32, rgba: &[u8]) -> Result<JsValue, JsValue> {
    let detect = std::panic::catch_unwind(|| detect_map_bounds_rgba_native(width, height, rgba));
    match detect {
        Ok(Ok(result)) => serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&format!("serialization error: {e}"))),
        Ok(Err(e)) => Err(JsValue::from_str(&e)),
        Err(panic_payload) => {
            let panic_message = panic_payload
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| panic_payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic payload".to_string());
            Err(JsValue::from_str(&format!(
                "WASM detector panicked unexpectedly: {panic_message}"
            )))
        }
    }
}

pub mod detect;
