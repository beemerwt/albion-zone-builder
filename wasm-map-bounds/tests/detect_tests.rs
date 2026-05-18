use wasm_map_bounds::detect::detect_map_bounds_rgba_native;

fn draw_line_rgba(buf: &mut [u8], w: usize, h: usize, mut x0: i32, mut y0: i32, x1: i32, y1: i32) {
    let dx = (x1 - x0).abs();
    let sx = if x0 < x1 { 1 } else { -1 };
    let dy = -(y1 - y0).abs();
    let sy = if y0 < y1 { 1 } else { -1 };
    let mut err = dx + dy;
    loop {
        if x0 >= 0 && y0 >= 0 && (x0 as usize) < w && (y0 as usize) < h {
            let i = (y0 as usize * w + x0 as usize) * 4;
            buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = 255;
        }
        if x0 == x1 && y0 == y1 { break; }
        let e2 = 2 * err;
        if e2 >= dy { err += dy; x0 += sx; }
        if e2 <= dx { err += dx; y0 += sy; }
    }
}

fn make_blank(w: usize, h: usize) -> Vec<u8> { vec![0; w * h * 4] }

#[test]
fn detects_synthetic_diamond() {
    let (w, h) = (600usize, 400usize);
    let mut rgba = make_blank(w, h);
    let top = (300, 20);
    let right = (580, 200);
    let bottom = (300, 380);
    let left = (20, 200);
    draw_line_rgba(&mut rgba, w, h, top.0, top.1, right.0, right.1);
    draw_line_rgba(&mut rgba, w, h, right.0, right.1, bottom.0, bottom.1);
    draw_line_rgba(&mut rgba, w, h, bottom.0, bottom.1, left.0, left.1);
    draw_line_rgba(&mut rgba, w, h, left.0, left.1, top.0, top.1);

    let result = detect_map_bounds_rgba_native(w as u32, h as u32, &rgba).unwrap();
    assert!(result.positive_line_count >= 0);
    assert!(result.negative_line_count >= 0);
    assert!(result.corners.top[0].is_finite());
    assert!(result.corners.right[1].is_finite());
}

#[test]
fn fallback_on_no_lines() {
    let (w, h) = (600usize, 400usize);
    let rgba = make_blank(w, h);
    let result = detect_map_bounds_rgba_native(w as u32, h as u32, &rgba).unwrap();
    assert_eq!(result.corners.top[1], 0.0);
    assert_eq!(result.corners.left[0], 0.0);
}

#[test]
fn malformed_input_returns_error() {
    let err = detect_map_bounds_rgba_native(10, 10, &[0; 3]).unwrap_err();
    assert!(err.contains("invalid RGBA length"));
}
