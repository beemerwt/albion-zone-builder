use serde::Serialize;

pub type Point = [f32; 2];

#[derive(Debug, Clone, Serialize)]
pub struct DetectResult {
    pub corners: Corners,
    #[serde(rename = "usedPadding")]
    pub used_padding: bool,
    #[serde(rename = "positiveLineCount")]
    pub positive_line_count: usize,
    #[serde(rename = "negativeLineCount")]
    pub negative_line_count: usize,
    #[serde(rename = "debug")]
    pub debug: DebugInfo,
}

#[derive(Debug, Clone, Serialize)]
pub struct Corners {
    #[serde(rename = "Top")]
    pub top: Point,
    #[serde(rename = "Right")]
    pub right: Point,
    #[serde(rename = "Bottom")]
    pub bottom: Point,
    #[serde(rename = "Left")]
    pub left: Point,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagLine {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub dx: f32,
    pub dy: f32,
    pub length: f32,
    pub angle: f32,
    pub m: f32,
    pub b: f32,
    pub classification: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SideDebug {
    pub target_intercept: f32,
    pub tolerance: f32,
    pub selected_count: usize,
    pub line: [f32; 3],
}

#[derive(Debug, Clone, Serialize)]
pub struct DebugInfo {
    pub width: u32,
    pub height: u32,
    pub expected_rgba_len: usize,
    pub actual_rgba_len: usize,
    pub total_raw_line_count: usize,
    pub accepted_positive_line_count: usize,
    pub accepted_negative_line_count: usize,
    pub accepted_lines: Vec<DiagLine>,
    pub top_right: Option<SideDebug>,
    pub bottom_left: Option<SideDebug>,
    pub top_left: Option<SideDebug>,
    pub bottom_right: Option<SideDebug>,
}

fn fallback_corners(width: u32, height: u32) -> Corners {
    Corners {
        top: [((width - 1) as f32) / 2.0, 0.0],
        right: [(width - 1) as f32, ((height - 1) as f32) / 2.0],
        bottom: [((width - 1) as f32) / 2.0, (height - 1) as f32],
        left: [0.0, ((height - 1) as f32) / 2.0],
    }
}

pub fn detect_map_bounds_rgba_native(width: u32, height: u32, rgba: &[u8]) -> Result<DetectResult, String> {
    if width == 0 || height == 0 {
        return Err("width/height must be > 0".into());
    }
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|v| v.checked_mul(4))
        .ok_or_else(|| format!("width/height overflow while computing expected RGBA length: {width}x{height}"))?;

    if rgba.len() != expected_len {
        return Err(format!("invalid RGBA length {}, expected {} for {width}x{height} RGBA image", rgba.len(), expected_len));
    }

    let gray = rgba_to_gray(width as usize, height as usize, rgba);
    let edges = sobel_edges(width as usize, height as usize, &gray);
    let min_dim = (width.min(height)) as f32;
    let min_line_length = 160.0_f32.max((min_dim * 0.28).floor());

    let (all_candidates, positive, negative) = collect_diagonal_segments(width as usize, height as usize, &edges, min_line_length);

    let mut debug = DebugInfo {
        width,
        height,
        expected_rgba_len: expected_len,
        actual_rgba_len: rgba.len(),
        total_raw_line_count: all_candidates.len(),
        accepted_positive_line_count: positive.len(),
        accepted_negative_line_count: negative.len(),
        accepted_lines: all_candidates,
        top_right: None,
        bottom_left: None,
        top_left: None,
        bottom_right: None,
    };

    let mut result = DetectResult {
        corners: fallback_corners(width, height),
        used_padding: false,
        positive_line_count: positive.len(),
        negative_line_count: negative.len(),
        debug,
    };

    if positive.len() < 2 || negative.len() < 2 {
        return Ok(result);
    }

    let (top_right, tr_dbg) = fit_extreme_side(&positive, true)?;
    let (bottom_left, bl_dbg) = fit_extreme_side(&positive, false)?;
    let (top_left, tl_dbg) = fit_extreme_side(&negative, true)?;
    let (bottom_right, br_dbg) = fit_extreme_side(&negative, false)?;
    result.debug.top_right = Some(tr_dbg);
    result.debug.bottom_left = Some(bl_dbg);
    result.debug.top_left = Some(tl_dbg);
    result.debug.bottom_right = Some(br_dbg);

    let top = intersect_lines(top_left, top_right)?;
    let right = intersect_lines(top_right, bottom_right)?;
    let bottom = intersect_lines(bottom_left, bottom_right)?;
    let left = intersect_lines(top_left, bottom_left)?;

    result.corners = Corners { top, right, bottom, left };
    Ok(result)
}

fn rgba_to_gray(width: usize, height: usize, rgba: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; width * height];
    for y in 0..height {
        for x in 0..width {
            let i = (y * width + x) * 4;
            let r = rgba[i] as f32;
            let g = rgba[i + 1] as f32;
            let b = rgba[i + 2] as f32;
            out[y * width + x] = (0.299 * r + 0.587 * g + 0.114 * b) as u8;
        }
    }
    out
}

fn sobel_edges(width: usize, height: usize, gray: &[u8]) -> Vec<u8> {
    if width < 3 || height < 3 { return vec![0; width * height]; }
    let mut mag = vec![0u16; width * height];
    let mut max_mag = 1u16;
    for y in 1..height - 1 {
        for x in 1..width - 1 {
            let idx = |xx: usize, yy: usize| gray[yy * width + xx] as i32;
            let gx = -idx(x - 1, y - 1) + idx(x + 1, y - 1) - 2 * idx(x - 1, y) + 2 * idx(x + 1, y)
                - idx(x - 1, y + 1) + idx(x + 1, y + 1);
            let gy = -idx(x - 1, y - 1) - 2 * idx(x, y - 1) - idx(x + 1, y - 1)
                + idx(x - 1, y + 1) + 2 * idx(x, y + 1) + idx(x + 1, y + 1);
            let m = ((gx * gx + gy * gy) as f32).sqrt() as u16;
            mag[y * width + x] = m;
            if m > max_mag { max_mag = m; }
        }
    }
    let threshold = ((max_mag as f32) * 0.35).max(30.0) as u16;
    mag.into_iter().map(|m| if m >= threshold { 255 } else { 0 }).collect()
}

fn normalize_angle(mut angle: f32) -> f32 {
    if angle < -90.0 { angle += 180.0; }
    if angle > 90.0 { angle -= 180.0; }
    angle
}

fn collect_diagonal_segments(width: usize, height: usize, edges: &[u8], min_line_length: f32) -> (Vec<DiagLine>, Vec<DiagLine>, Vec<DiagLine>) {
    let mut points = Vec::new();
    for y in 0..height { for x in 0..width { if edges[y*width+x] != 0 { points.push((x as f32, y as f32)); } } }

    let mut all = Vec::new();
    let mut pos = Vec::new();
    let mut neg = Vec::new();
    let n = points.len();
    if n < 2 { return (all, pos, neg); }

    let step = (n / 500).max(1);
    for i in (0..n).step_by(step) {
        let (x1, y1) = points[i];
        for j in ((i + step)..n).step_by(step * 3) {
            let (x2, y2) = points[j];
            let dx = x2 - x1;
            if dx.abs() < 1e-6 { continue; }
            let dy = y2 - y1;
            let length = (dx * dx + dy * dy).sqrt();
            if length < min_line_length { continue; }
            let angle = normalize_angle(dy.atan2(dx).to_degrees());
            if !(28.0..=42.0).contains(&angle.abs()) { continue; }
            let m = dy / dx;
            let b = y1 - m * x1;
            let classification = if m > 0.0 { "positive" } else { "negative" }.to_string();
            let line = DiagLine { x1, y1, x2, y2, dx, dy, length, angle, m, b, classification: classification.clone() };
            all.push(line.clone());
            if m > 0.0 { pos.push(line); } else { neg.push(line); }
            if all.len() > 3000 { break; }
        }
        if all.len() > 3000 { break; }
    }

    (all, pos, neg)
}

fn line_from_points(points: &[(f32, f32)]) -> Result<[f32;3], String> {
    if points.len() < 2 { return Err("Need at least two points to fit a line".into()); }
    let mut mx=0.0; let mut my=0.0;
    for (x,y) in points { mx += *x; my += *y; }
    mx /= points.len() as f32; my /= points.len() as f32;
    let mut sxx=0.0; let mut sxy=0.0; let mut syy=0.0;
    for (x,y) in points { let dx=*x-mx; let dy=*y-my; sxx += dx*dx; sxy += dx*dy; syy += dy*dy; }
    let theta = 0.5 * (2.0*sxy).atan2(sxx - syy);
    let vx = theta.cos(); let vy = theta.sin();
    let mut a = vy; let mut b = -vx; let mut c = vx*my - vy*mx;
    let n = (a*a+b*b).sqrt();
    if n <= 1e-9 { return Err("Degenerate line fit".into()); }
    a/=n; b/=n; c/=n;
    Ok([a,b,c])
}

fn fit_extreme_side(lines: &[DiagLine], use_min: bool) -> Result<([f32;3], SideDebug), String> {
    if lines.is_empty() { return Err("No candidate lines".into()); }
    let mut min_b = f32::INFINITY;
    let mut max_b = f32::NEG_INFINITY;
    for l in lines { min_b = min_b.min(l.b); max_b = max_b.max(l.b); }
    let target = if use_min { min_b } else { max_b };
    let spread = 1.0_f32.max(max_b - min_b);
    let tol = 18.0_f32.max(32.0_f32.min(spread * 0.035));
    let mut selected: Vec<&DiagLine> = lines.iter().filter(|l| (l.b - target).abs() <= tol).collect();
    if selected.is_empty() {
        let mut sorted: Vec<&DiagLine> = lines.iter().collect();
        sorted.sort_by(|a,b| (a.b-target).abs().total_cmp(&(b.b-target).abs()));
        selected = sorted.into_iter().take(2).collect();
    }
    let mut pts = Vec::new();
    for l in &selected { pts.push((l.x1,l.y1)); pts.push((l.x2,l.y2)); }
    let line = line_from_points(&pts)?;
    Ok((line, SideDebug { target_intercept: target, tolerance: tol, selected_count: selected.len(), line }))
}

fn intersect_lines(l1:[f32;3], l2:[f32;3]) -> Result<Point,String> {
    let (a1,b1,c1)=(l1[0],l1[1],l1[2]);
    let (a2,b2,c2)=(l2[0],l2[1],l2[2]);
    let d = a1*b2-a2*b1;
    if d.abs() <= 1e-9 { return Err("Parallel lines cannot be intersected".into()); }
    let x = (b1*c2-b2*c1)/d;
    let y = (c1*a2-c2*a1)/d;
    Ok([x,y])
}
