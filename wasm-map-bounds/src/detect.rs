use serde::Serialize;

pub type Point = [f32; 2];

const BEIGE_R: f32 = 203.0;
const BEIGE_G: f32 = 159.0;
const BEIGE_B: f32 = 107.0;
const BEIGE_DIST_THRESH: f32 = 62.0;
const ANGLE_DEG: f32 = 35.1;
const MIN_CENTER_DISTANCE_FRAC: f32 = 0.18;
const MIN_SUPPORT_SPAN_FRAC: f32 = 0.35;

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
    pub rejected_outward_not_beige: usize,
    pub rejected_inward_too_beige: usize,
    pub rejected_too_close_to_center: usize,
    pub rejected_support_too_short: usize,
    pub side_candidate_tr: usize,
    pub side_candidate_bl: usize,
    pub side_candidate_tl: usize,
    pub side_candidate_br: usize,
    pub b_tr: Option<f32>,
    pub b_bl: Option<f32>,
    pub b_tl: Option<f32>,
    pub b_br: Option<f32>,
    pub peak_tr: usize,
    pub peak_bl: usize,
    pub peak_tl: usize,
    pub peak_br: usize,
    pub span_tr: f32,
    pub span_bl: f32,
    pub span_tl: f32,
    pub span_br: f32,
    pub final_corners: Option<Corners>,
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
    let mut tr_pts: Vec<(f32, f32)> = Vec::new();
    let mut bl_pts: Vec<(f32, f32)> = Vec::new();
    let mut tl_pts: Vec<(f32, f32)> = Vec::new();
    let mut br_pts: Vec<(f32, f32)> = Vec::new();

    let mut boundary_count = 0usize;
    let mut accepted_count = 0usize;
    let mut pos_count = 0usize;
    let mut neg_count = 0usize;
    let mut overlay_points = Vec::new();
    let mut rejected_outward_not_beige = 0usize;
    let mut rejected_inward_too_beige = 0usize;
    let mut rejected_too_close_to_center = 0usize;
    let min_center_distance = (width.min(height) as f32) * MIN_CENTER_DISTANCE_FRAC;

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
            let center_dist_pos = (b_pos - center_b_pos).abs();
            if center_dist_pos < min_center_distance {
                rejected_too_close_to_center += 1;
            } else if let Some((outward_beige, inward_beige)) = parchment_transition_score(
                w, h, &beige, xf, yf, outward_normal_for_pos(m, b_pos, center_b_pos)
            ) {
                if outward_beige < 3 {
                    rejected_outward_not_beige += 1;
                } else if inward_beige >= 2 || outward_beige <= inward_beige {
                    rejected_inward_too_beige += 1;
                } else {
                let idx = ((b_pos.round() as i32) + diag).clamp(0, (bins - 1) as i32) as usize;
                    if b_pos < center_b_pos {
                        tr[idx] += 1;
                        tr_pts.push((xf, yf));
                    } else {
                        bl[idx] += 1;
                        bl_pts.push((xf, yf));
                    }
                accepted_count += 1;
                pos_count += 1;
                if overlay_points.len() < 10000 { overlay_points.push([xf, yf]); }
            }
            }

            // negative family
            let b_neg = yf + m * xf;
            let center_dist_neg = (b_neg - center_b_neg).abs();
            if center_dist_neg < min_center_distance {
                rejected_too_close_to_center += 1;
            } else if let Some((outward_beige, inward_beige)) = parchment_transition_score(
                w, h, &beige, xf, yf, outward_normal_for_neg(m, b_neg, center_b_neg)
            ) {
                if outward_beige < 3 {
                    rejected_outward_not_beige += 1;
                } else if inward_beige >= 2 || outward_beige <= inward_beige {
                    rejected_inward_too_beige += 1;
                } else {
                let idx = ((b_neg.round() as i32) + diag).clamp(0, (bins - 1) as i32) as usize;
                    if b_neg < center_b_neg {
                        tl[idx] += 1;
                        tl_pts.push((xf, yf));
                    } else {
                        br[idx] += 1;
                        br_pts.push((xf, yf));
                    }
                accepted_count += 1;
                neg_count += 1;
                if overlay_points.len() < 10000 { overlay_points.push([xf, yf]); }
            }
            }
        }
    }

    let min_support_span = (width.min(height) as f32) * MIN_SUPPORT_SPAN_FRAC;
    let (b_tr, peak_tr, span_tr) = pick_side_peak(&tr, &tr_pts, m, true, center_b_pos, min_support_span, diag, 4);
    let (b_bl, peak_bl, span_bl) = pick_side_peak(&bl, &bl_pts, m, true, center_b_pos, min_support_span, diag, 4);
    let (b_tl, peak_tl, span_tl) = pick_side_peak(&tl, &tl_pts, m, false, center_b_neg, min_support_span, diag, 4);
    let (b_br, peak_br, span_br) = pick_side_peak(&br, &br_pts, m, false, center_b_neg, min_support_span, diag, 4);
    let rejected_support_too_short = usize::from(b_tr.is_none()) + usize::from(b_bl.is_none()) + usize::from(b_tl.is_none()) + usize::from(b_br.is_none());

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
            rejected_outward_not_beige,
            rejected_inward_too_beige,
            rejected_too_close_to_center,
            rejected_support_too_short,
            side_candidate_tr: tr_pts.len(),
            side_candidate_bl: bl_pts.len(),
            side_candidate_tl: tl_pts.len(),
            side_candidate_br: br_pts.len(),
            b_tr,
            b_bl,
            b_tl,
            b_br,
            peak_tr,
            peak_bl,
            peak_tl,
            peak_br,
            span_tr,
            span_bl,
            span_tl,
            span_br,
            final_corners: None,
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
    result.debug.final_corners = Some(result.corners.clone());

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

fn outward_normal_for_pos(m: f32, b: f32, center_b: f32) -> (f32, f32) {
    if b < center_b { (-m, 1.0) } else { (m, -1.0) }
}
fn outward_normal_for_neg(m: f32, b: f32, center_b: f32) -> (f32, f32) {
    if b < center_b { (m, 1.0) } else { (-m, -1.0) }
}
fn parchment_transition_score(w: usize, h: usize, beige: &[bool], x: f32, y: f32, outward: (f32, f32)) -> Option<(usize, usize)> {
    let n = (outward.0 * outward.0 + outward.1 * outward.1).sqrt();
    if n <= 1e-6 { return None; }
    let nx = outward.0 / n;
    let ny = outward.1 / n;
    let mut out_beige = 0usize;
    let mut in_beige = 0usize;
    let mut samples = 0usize;
    for d in [4.0_f32, 8.0, 12.0, 16.0, 24.0] {
        let ox = (x + nx * d).round() as i32;
        let oy = (y + ny * d).round() as i32;
        let ix = (x - nx * d).round() as i32;
        let iy = (y - ny * d).round() as i32;
        if ox >= 0 && oy >= 0 && ix >= 0 && iy >= 0 && (ox as usize) < w && (oy as usize) < h && (ix as usize) < w && (iy as usize) < h {
            samples += 1;
            if beige[oy as usize * w + ox as usize] { out_beige += 1; }
            if beige[iy as usize * w + ix as usize] { in_beige += 1; }
        }
    }
    if samples < 3 { None } else { Some((out_beige, in_beige)) }
}

fn pick_side_peak(hist: &[usize], pts: &[(f32, f32)], m: f32, is_positive: bool, center_b: f32, min_span: f32, diag: i32, smooth_radius: usize) -> (Option<f32>, usize, f32) {
    if hist.is_empty() { return (None, 0, 0.0); }
    let mut best_b = None;
    let mut best_votes = 0usize;
    let mut best_span = 0.0_f32;
    let mut best_score = 0.0_f32;
    for i in 0..hist.len() {
        let s = i.saturating_sub(smooth_radius);
        let e = (i + smooth_radius).min(hist.len() - 1);
        let mut votes = 0usize;
        for j in s..=e { votes += hist[j]; }
        if votes == 0 { continue; }
        let b = i as f32 - diag as f32;
        let span = support_span(pts, m, is_positive, b);
        if span < min_span { continue; }
        let support_quality = (span / min_span).min(2.0);
        let outerness_bonus = 1.0 + ((b - center_b).abs() / (min_span * 0.5)).min(1.5);
        let score = votes as f32 * support_quality * outerness_bonus;
        if score > best_score {
            best_score = score;
            best_b = Some(b);
            best_votes = votes;
            best_span = span;
        }
    }
    (best_b, best_votes, best_span)
}

fn support_span(pts: &[(f32, f32)], m: f32, is_positive: bool, b: f32) -> f32 {
    let line_tol = 3.0_f32;
    let mut min_t = f32::INFINITY;
    let mut max_t = f32::NEG_INFINITY;
    for (x, y) in pts.iter().copied() {
        let db = if is_positive { (y - m * x - b).abs() } else { (y + m * x - b).abs() };
        if db > line_tol { continue; }
        let t = if is_positive { x + y * m } else { x - y * m };
        min_t = min_t.min(t);
        max_t = max_t.max(t);
    }
    if min_t.is_finite() && max_t.is_finite() { max_t - min_t } else { 0.0 }
}

fn intersect_pm(m: f32, b_pos: f32, b_neg: f32) -> Point {
    let x = (b_neg - b_pos) / (2.0 * m);
    let y = (b_pos + b_neg) * 0.5;
    [x, y]
}
