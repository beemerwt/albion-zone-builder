use serde::Serialize;

pub type Point = [f32; 2];

const BEIGE_R: f32 = 203.0;
const BEIGE_G: f32 = 159.0;
const BEIGE_B: f32 = 107.0;
const BEIGE_DIST_THRESH: f32 = 62.0;
const ANGLE_DEG: f32 = 35.1;

#[derive(Debug, Clone, Serialize)]
pub struct DetectResult {
    pub corners: Corners,
    #[serde(rename = "usedPadding")]
    pub used_padding: bool,
    #[serde(rename = "positiveLineCount")]
    pub positive_line_count: usize,
    #[serde(rename = "negativeLineCount")]
    pub negative_line_count: usize,
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
pub struct DebugInfo {
    pub width: u32,
    pub height: u32,
    pub expected_rgba_len: usize,
    pub actual_rgba_len: usize,
    pub beige_pixel_count: usize,
    pub boundary_candidate_count: usize,
    pub accepted_inner_edge_candidate_count: usize,
    pub b_tr: Option<f32>,
    pub b_bl: Option<f32>,
    pub b_tl: Option<f32>,
    pub b_br: Option<f32>,
    pub peak_tr: usize,
    pub peak_bl: usize,
    pub peak_tl: usize,
    pub peak_br: usize,
    pub overlay_points: Vec<[f32; 2]>,
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
        return Err(format!(
            "invalid RGBA length {}, expected {} for {width}x{height} RGBA image",
            rgba.len(), expected_len
        ));
    }

    let w = width as usize;
    let h = height as usize;
    let m = ANGLE_DEG.to_radians().tan();
    let center_x = (width as f32 - 1.0) * 0.5;
    let center_y = (height as f32 - 1.0) * 0.5;
    let center_b_pos = center_y - m * center_x;
    let center_b_neg = center_y + m * center_x;

    let beige = build_beige_mask(w, h, rgba);
    let beige_count = beige.iter().filter(|v| **v).count();
    let boundary = build_boundary_candidates(w, h, &beige);

    let diag = ((w * w + h * h) as f32).sqrt().ceil() as i32;
    let bins = (diag * 2 + 1) as usize;
    let mut tr = vec![0usize; bins];
    let mut bl = vec![0usize; bins];
    let mut tl = vec![0usize; bins];
    let mut br = vec![0usize; bins];

    let mut boundary_count = 0usize;
    let mut accepted_count = 0usize;
    let mut pos_count = 0usize;
    let mut neg_count = 0usize;
    let mut overlay_points = Vec::new();

    for y in 1..h - 1 {
        for x in 1..w - 1 {
            if !boundary[y * w + x] {
                continue;
            }
            boundary_count += 1;
            let xf = x as f32;
            let yf = y as f32;

            // positive family
            let b_pos = yf - m * xf;
            let pos_inward = if b_pos < center_b_pos { (-m, 1.0) } else { (m, -1.0) };
            if is_inner_edge_candidate(w, h, &beige, xf, yf, pos_inward) {
                let idx = ((b_pos.round() as i32) + diag).clamp(0, (bins - 1) as i32) as usize;
                if b_pos < center_b_pos { tr[idx] += 1; } else { bl[idx] += 1; }
                accepted_count += 1;
                pos_count += 1;
                if overlay_points.len() < 10000 { overlay_points.push([xf, yf]); }
            }

            // negative family
            let b_neg = yf + m * xf;
            let neg_inward = if b_neg < center_b_neg { (m, 1.0) } else { (-m, -1.0) };
            if is_inner_edge_candidate(w, h, &beige, xf, yf, neg_inward) {
                let idx = ((b_neg.round() as i32) + diag).clamp(0, (bins - 1) as i32) as usize;
                if b_neg < center_b_neg { tl[idx] += 1; } else { br[idx] += 1; }
                accepted_count += 1;
                neg_count += 1;
                if overlay_points.len() < 10000 { overlay_points.push([xf, yf]); }
            }
        }
    }

    let (b_tr, peak_tr) = pick_peak(&tr, 4);
    let (b_bl, peak_bl) = pick_peak(&bl, 4);
    let (b_tl, peak_tl) = pick_peak(&tl, 4);
    let (b_br, peak_br) = pick_peak(&br, 4);

    let mut result = DetectResult {
        corners: fallback_corners(width, height),
        used_padding: false,
        positive_line_count: pos_count,
        negative_line_count: neg_count,
        debug: DebugInfo {
            width,
            height,
            expected_rgba_len: expected_len,
            actual_rgba_len: rgba.len(),
            beige_pixel_count: beige_count,
            boundary_candidate_count: boundary_count,
            accepted_inner_edge_candidate_count: accepted_count,
            b_tr,
            b_bl,
            b_tl,
            b_br,
            peak_tr,
            peak_bl,
            peak_tl,
            peak_br,
            overlay_points,
        },
    };

    let min_votes = ((width.min(height) as f32) * 0.03).max(40.0) as usize;
    if peak_tr < min_votes || peak_bl < min_votes || peak_tl < min_votes || peak_br < min_votes {
        return Ok(result);
    }

    let b_tr = b_tr.ok_or("missing top-right intercept")?;
    let b_bl = b_bl.ok_or("missing bottom-left intercept")?;
    let b_tl = b_tl.ok_or("missing top-left intercept")?;
    let b_br = b_br.ok_or("missing bottom-right intercept")?;

    result.corners = Corners {
        top: intersect_pm(m, b_tr, b_tl),
        right: intersect_pm(m, b_tr, b_br),
        bottom: intersect_pm(m, b_bl, b_br),
        left: intersect_pm(m, b_bl, b_tl),
    };

    Ok(result)
}

fn build_beige_mask(w: usize, h: usize, rgba: &[u8]) -> Vec<bool> {
    let mut out = vec![false; w * h];
    for y in 0..h {
        for x in 0..w {
            let i = (y * w + x) * 4;
            let r = rgba[i] as f32;
            let g = rgba[i + 1] as f32;
            let b = rgba[i + 2] as f32;
            let dr = r - BEIGE_R;
            let dg = g - BEIGE_G;
            let db = b - BEIGE_B;
            let dist = (dr * dr + dg * dg + db * db).sqrt();
            let sand_rule = r > g
                && g > b
                && (120.0..=245.0).contains(&r)
                && (90.0..=210.0).contains(&g)
                && (50.0..=170.0).contains(&b)
                && (r - g) >= 15.0
                && (g - b) >= 15.0;
            out[y * w + x] = dist <= BEIGE_DIST_THRESH || sand_rule;
        }
    }
    out
}

fn build_boundary_candidates(w: usize, h: usize, beige: &[bool]) -> Vec<bool> {
    let mut out = vec![false; w * h];
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            let idx = y * w + x;
            let center = beige[idx];
            let mut has_flip = false;
            for ny in (y - 1)..=(y + 1) {
                for nx in (x - 1)..=(x + 1) {
                    if nx == x && ny == y { continue; }
                    if beige[ny * w + nx] != center { has_flip = true; break; }
                }
                if has_flip { break; }
            }
            out[idx] = has_flip;
        }
    }
    out
}

fn is_inner_edge_candidate(w: usize, h: usize, beige: &[bool], x: f32, y: f32, inward: (f32, f32)) -> bool {
    let n = (inward.0 * inward.0 + inward.1 * inward.1).sqrt();
    if n <= 1e-6 { return false; }
    let nx = inward.0 / n;
    let ny = inward.1 / n;

    let mut inward_non_beige = 0;
    let mut outward_beige = 0;
    for d in [4.0_f32, 6.0, 8.0] {
        let ix = (x + nx * d).round() as i32;
        let iy = (y + ny * d).round() as i32;
        let ox = (x - nx * d).round() as i32;
        let oy = (y - ny * d).round() as i32;
        if ix >= 0 && iy >= 0 && (ix as usize) < w && (iy as usize) < h {
            if !beige[iy as usize * w + ix as usize] { inward_non_beige += 1; }
        }
        if ox >= 0 && oy >= 0 && (ox as usize) < w && (oy as usize) < h {
            if beige[oy as usize * w + ox as usize] { outward_beige += 1; }
        }
    }
    inward_non_beige >= 2 && outward_beige >= 2
}

fn pick_peak(hist: &[usize], smooth_radius: usize) -> (Option<f32>, usize) {
    if hist.is_empty() { return (None, 0); }
    let mut best_i = 0usize;
    let mut best_v = 0usize;
    for i in 0..hist.len() {
        let s = i.saturating_sub(smooth_radius);
        let e = (i + smooth_radius).min(hist.len() - 1);
        let mut v = 0usize;
        for j in s..=e { v += hist[j]; }
        if v > best_v {
            best_v = v;
            best_i = i;
        }
    }
    (Some(best_i as f32 - ((hist.len() as f32 - 1.0) * 0.5)), best_v)
}

fn intersect_pm(m: f32, b_pos: f32, b_neg: f32) -> Point {
    let x = (b_neg - b_pos) / (2.0 * m);
    let y = (b_pos + b_neg) * 0.5;
    [x, y]
}
