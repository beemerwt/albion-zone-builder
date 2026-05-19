use serde::Serialize;

pub type Point = [f32; 2];

const BEIGE_R: f32 = 203.0;
const BEIGE_G: f32 = 159.0;
const BEIGE_B: f32 = 107.0;
const BEIGE_DIST_THRESH: f32 = 62.0;
const ANGLE_DEG: f32 = 35.1;
const MIN_CENTER_DISTANCE_FRAC: f32 = 0.32;
const MIN_SUPPORT_SPAN_FRAC: f32 = 0.35;
const MIN_SCAN_CENTER_DISTANCE_FRAC: f32 = 0.22;
const MAX_DEBUG_POINTS: usize = 10_000;

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
    pub strong_parchment_pixel_count: usize,
    pub weak_parchment_like_pixel_count: usize,
    pub parchment_score_mean: f32,
    pub boundary_candidate_count: usize,
    pub total_beige_boundary_candidates: usize,
    pub accepted_inner_edge_candidate_count: usize,
    pub rejected_outer_parchment_edge: usize,
    pub rejected_outward_not_beige: usize,
    pub rejected_inward_too_beige: usize,
    pub rejected_weak_parchment_band: usize,
    pub rejected_too_close_to_center: usize,
    pub rejected_support_too_short: usize,
    pub center_scan_used_tr: bool,
    pub center_scan_used_bl: bool,
    pub center_scan_used_tl: bool,
    pub center_scan_used_br: bool,
    pub center_scan_points_tr: usize,
    pub center_scan_points_bl: usize,
    pub center_scan_points_tl: usize,
    pub center_scan_points_br: usize,
    pub center_scan_outliers_tr: usize,
    pub center_scan_outliers_bl: usize,
    pub center_scan_outliers_tl: usize,
    pub center_scan_outliers_br: usize,
    pub center_scan_raw_median_tr: Option<f32>,
    pub center_scan_raw_median_bl: Option<f32>,
    pub center_scan_raw_median_tl: Option<f32>,
    pub center_scan_raw_median_br: Option<f32>,
    pub side_candidate_tr: usize,
    pub side_candidate_bl: usize,
    pub side_candidate_tl: usize,
    pub side_candidate_br: usize,
    pub b_tr: Option<f32>,
    pub b_bl: Option<f32>,
    pub b_tl: Option<f32>,
    pub b_br: Option<f32>,
    pub selected_intercepts: SelectedIntercepts,
    pub peak_tr: usize,
    pub peak_bl: usize,
    pub peak_tl: usize,
    pub peak_br: usize,
    pub span_tr: f32,
    pub span_bl: f32,
    pub span_tl: f32,
    pub span_br: f32,
    pub support_span: SupportSpan,
    pub final_corners: Option<Corners>,
    pub overlay_points: Vec<Point>,
    pub accepted_inner_edge_points: Vec<Point>,
    pub rejected_outer_parchment_edge_points: Vec<Point>,
    pub center_scan_transition_points: Vec<Point>,
    pub center_scan_rejected_outliers: Vec<Point>,
    pub rejected_weak_parchment_edge_points: Vec<Point>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SelectedIntercepts {
    pub top_right: Option<f32>,
    pub bottom_left: Option<f32>,
    pub top_left: Option<f32>,
    pub bottom_right: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SupportSpan {
    pub top_right: f32,
    pub bottom_left: f32,
    pub top_left: f32,
    pub bottom_right: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CandidateDecision {
    AcceptedInnerEdge,
    RejectedOuterParchmentEdge,
    RejectedOutwardNotBeige,
    RejectedInwardTooBeige,
    RejectedWeakBand,
}

#[derive(Debug, Clone, Copy)]
struct TransitionScore {
    outward_beige: usize,
    inward_beige: usize,
    outward_non_beige: usize,
    inward_non_beige: usize,
    outward_avg_score: f32,
    inward_avg_score: f32,
    far_out_avg_score: f32,
}
#[derive(Default)]
struct SideScanFit {
    raw_points: Vec<(f32, f32)>,
    raw_median_b: Option<f32>,
    final_b: Option<f32>,
    outlier_count: usize,
}
#[derive(Default)]
struct ScanSides {
    tr: SideScanFit,
    bl: SideScanFit,
    tl: SideScanFit,
    br: SideScanFit,
    transition_overlay_points: Vec<Point>,
    outlier_overlay_points: Vec<Point>,
    rejected_weak_band_points: Vec<Point>,
}

#[derive(Default, Clone, Copy)]
struct ScoreStats {
    sum: f32,
    strong: usize,
    weak: usize,
}

fn fallback_corners(width: u32, height: u32) -> Corners {
    Corners {
        top: [((width - 1) as f32) / 2.0, 0.0],
        right: [(width - 1) as f32, ((height - 1) as f32) / 2.0],
        bottom: [((width - 1) as f32) / 2.0, (height - 1) as f32],
        left: [0.0, ((height - 1) as f32) / 2.0],
    }
}

pub fn detect_map_bounds_rgba_native(
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<DetectResult, String> {
    if width == 0 || height == 0 {
        return Err("width/height must be > 0".into());
    }
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|v| v.checked_mul(4))
        .ok_or_else(|| {
            format!("width/height overflow while computing expected RGBA length: {width}x{height}")
        })?;
    if rgba.len() != expected_len {
        return Err(format!(
            "invalid RGBA length {}, expected {} for {width}x{height} RGBA image",
            rgba.len(),
            expected_len
        ));
    }

    let w = width as usize;
    let h = height as usize;
    let m = ANGLE_DEG.to_radians().tan();
    let center_x = (width as f32 - 1.0) * 0.5;
    let center_y = (height as f32 - 1.0) * 0.5;
    let center_b_pos = center_y - m * center_x;
    let center_b_neg = center_y + m * center_x;

    let (beige, parchment_score, score_stats) = build_beige_mask(w, h, rgba);
    let beige_count = beige.iter().filter(|v| **v).count();
    let boundary = build_boundary_candidates(w, h, &beige);
    let beige = clean_beige_mask(w, h, &beige);

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
    let mut accepted_inner_edge_points = Vec::new();
    let mut rejected_outer_parchment_edge_points = Vec::new();
    let mut rejected_outer_parchment_edge = 0usize;
    let mut rejected_outward_not_beige = 0usize;
    let mut rejected_inward_too_beige = 0usize;
    let mut rejected_weak_parchment_band = 0usize;
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

            // positive-slope family: y = m*x + b
            let b_pos = yf - m * xf;
            let center_dist_pos = (b_pos - center_b_pos).abs();
            if center_dist_pos < min_center_distance {
                rejected_too_close_to_center += 1;
            } else if let Some(score) = parchment_transition_score(
                w,
                h,
                &beige,
                &parchment_score,
                xf,
                yf,
                inward_outward_normals((-m, 1.0), xf, yf, center_x, center_y).1,
            ) {
                match classify_transition(score) {
                    CandidateDecision::AcceptedInnerEdge => {
                        let idx =
                            ((b_pos.round() as i32) + diag).clamp(0, (bins - 1) as i32) as usize;
                        if b_pos < center_b_pos {
                            tr[idx] += 1;
                            tr_pts.push((xf, yf));
                        } else {
                            bl[idx] += 1;
                            bl_pts.push((xf, yf));
                        }
                        accepted_count += 1;
                        pos_count += 1;
                        push_debug_point(&mut accepted_inner_edge_points, xf, yf);
                    }
                    CandidateDecision::RejectedOuterParchmentEdge => {
                        rejected_outer_parchment_edge += 1;
                        push_debug_point(&mut rejected_outer_parchment_edge_points, xf, yf);
                    }
                    CandidateDecision::RejectedOutwardNotBeige => rejected_outward_not_beige += 1,
                    CandidateDecision::RejectedInwardTooBeige => rejected_inward_too_beige += 1,
                    CandidateDecision::RejectedWeakBand => rejected_weak_parchment_band += 1,
                }
            }

            // negative-slope family: y = -m*x + b
            let b_neg = yf + m * xf;
            let center_dist_neg = (b_neg - center_b_neg).abs();
            if center_dist_neg < min_center_distance {
                rejected_too_close_to_center += 1;
            } else if let Some(score) = parchment_transition_score(
                w,
                h,
                &beige,
                &parchment_score,
                xf,
                yf,
                inward_outward_normals((m, 1.0), xf, yf, center_x, center_y).1,
            ) {
                match classify_transition(score) {
                    CandidateDecision::AcceptedInnerEdge => {
                        let idx =
                            ((b_neg.round() as i32) + diag).clamp(0, (bins - 1) as i32) as usize;
                        if b_neg < center_b_neg {
                            tl[idx] += 1;
                            tl_pts.push((xf, yf));
                        } else {
                            br[idx] += 1;
                            br_pts.push((xf, yf));
                        }
                        accepted_count += 1;
                        neg_count += 1;
                        push_debug_point(&mut accepted_inner_edge_points, xf, yf);
                    }
                    CandidateDecision::RejectedOuterParchmentEdge => {
                        rejected_outer_parchment_edge += 1;
                        push_debug_point(&mut rejected_outer_parchment_edge_points, xf, yf);
                    }
                    CandidateDecision::RejectedOutwardNotBeige => rejected_outward_not_beige += 1,
                    CandidateDecision::RejectedInwardTooBeige => rejected_inward_too_beige += 1,
                    CandidateDecision::RejectedWeakBand => rejected_weak_parchment_band += 1,
                }
            }
        }
    }

    let min_support_span = (width.min(height) as f32) * MIN_SUPPORT_SPAN_FRAC;
    let scan = center_out_scan_sides(
        w,
        h,
        &parchment_score,
        m,
        center_x,
        center_y,
        min_support_span,
    );
    let (hist_b_tr, peak_tr, span_tr) = pick_side_peak(
        &tr,
        &tr_pts,
        m,
        true,
        center_b_pos,
        min_support_span,
        diag,
        4,
    );
    let (hist_b_bl, peak_bl, span_bl) = pick_side_peak(
        &bl,
        &bl_pts,
        m,
        true,
        center_b_pos,
        min_support_span,
        diag,
        4,
    );
    let (hist_b_tl, peak_tl, span_tl) = pick_side_peak(
        &tl,
        &tl_pts,
        m,
        false,
        center_b_neg,
        min_support_span,
        diag,
        4,
    );
    let (hist_b_br, peak_br, span_br) = pick_side_peak(
        &br,
        &br_pts,
        m,
        false,
        center_b_neg,
        min_support_span,
        diag,
        4,
    );
    let b_tr = scan.tr.final_b.or(hist_b_tr);
    let b_bl = scan.bl.final_b.or(hist_b_bl);
    let b_tl = scan.tl.final_b.or(hist_b_tl);
    let b_br = scan.br.final_b.or(hist_b_br);
    let rejected_support_too_short = usize::from(b_tr.is_none())
        + usize::from(b_bl.is_none())
        + usize::from(b_tl.is_none())
        + usize::from(b_br.is_none());

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
            strong_parchment_pixel_count: score_stats.strong,
            weak_parchment_like_pixel_count: score_stats.weak,
            parchment_score_mean: score_stats.sum / (w * h).max(1) as f32,
            boundary_candidate_count: boundary_count,
            total_beige_boundary_candidates: boundary_count,
            accepted_inner_edge_candidate_count: accepted_count,
            rejected_outer_parchment_edge,
            rejected_outward_not_beige,
            rejected_inward_too_beige,
            rejected_weak_parchment_band,
            rejected_too_close_to_center,
            rejected_support_too_short,
            center_scan_used_tr: scan.tr.final_b.is_some(),
            center_scan_used_bl: scan.bl.final_b.is_some(),
            center_scan_used_tl: scan.tl.final_b.is_some(),
            center_scan_used_br: scan.br.final_b.is_some(),
            center_scan_points_tr: scan.tr.raw_points.len(),
            center_scan_points_bl: scan.bl.raw_points.len(),
            center_scan_points_tl: scan.tl.raw_points.len(),
            center_scan_points_br: scan.br.raw_points.len(),
            center_scan_outliers_tr: scan.tr.outlier_count,
            center_scan_outliers_bl: scan.bl.outlier_count,
            center_scan_outliers_tl: scan.tl.outlier_count,
            center_scan_outliers_br: scan.br.outlier_count,
            center_scan_raw_median_tr: scan.tr.raw_median_b,
            center_scan_raw_median_bl: scan.bl.raw_median_b,
            center_scan_raw_median_tl: scan.tl.raw_median_b,
            center_scan_raw_median_br: scan.br.raw_median_b,
            side_candidate_tr: tr_pts.len(),
            side_candidate_bl: bl_pts.len(),
            side_candidate_tl: tl_pts.len(),
            side_candidate_br: br_pts.len(),
            b_tr,
            b_bl,
            b_tl,
            b_br,
            selected_intercepts: SelectedIntercepts {
                top_right: b_tr,
                bottom_left: b_bl,
                top_left: b_tl,
                bottom_right: b_br,
            },
            peak_tr,
            peak_bl,
            peak_tl,
            peak_br,
            span_tr,
            span_bl,
            span_tl,
            span_br,
            support_span: SupportSpan {
                top_right: span_tr,
                bottom_left: span_bl,
                top_left: span_tl,
                bottom_right: span_br,
            },
            final_corners: None,
            overlay_points: accepted_inner_edge_points.clone(),
            accepted_inner_edge_points,
            rejected_outer_parchment_edge_points,
            center_scan_transition_points: scan.transition_overlay_points,
            center_scan_rejected_outliers: scan.outlier_overlay_points,
            rejected_weak_parchment_edge_points: scan.rejected_weak_band_points,
        },
    };

    let min_votes = ((width.min(height) as f32) * 0.03).max(30.0) as usize;
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

fn build_beige_mask(w: usize, h: usize, rgba: &[u8]) -> (Vec<bool>, Vec<f32>, ScoreStats) {
    let mut out = vec![false; w * h];
    let mut score = vec![0.0_f32; w * h];
    let mut stats = ScoreStats::default();
    for y in 0..h {
        for x in 0..w {
            let i = (y * w + x) * 4;
            let r = rgba[i] as f32;
            let g = rgba[i + 1] as f32;
            let b = rgba[i + 2] as f32;
            let s = parchment_score(r, g, b);
            score[y * w + x] = s;
            stats.sum += s;
            if s >= 0.68 { stats.strong += 1; }
            else if s >= 0.42 { stats.weak += 1; }
            out[y * w + x] = s >= 0.58;
        }
    }
    (out, score, stats)
}

fn parchment_score(r: f32, g: f32, b: f32) -> f32 {
    let dr = r - BEIGE_R;
    let dg = g - BEIGE_G;
    let db = b - BEIGE_B;
    let dist = (dr * dr + dg * dg + db * db).sqrt();
    let rgb_score = (1.0 - (dist / 140.0)).clamp(0.0, 1.0);
    let (h, s, v) = rgb_to_hsv(r, g, b);
    let hue_score = (1.0 - (hue_delta(h, 33.0) / 35.0)).clamp(0.0, 1.0);
    let sat_score = (1.0 - ((s - 0.44).abs() / 0.34)).clamp(0.0, 1.0);
    let val_score = (1.0 - ((v - 0.73).abs() / 0.30)).clamp(0.0, 1.0);
    let order_bonus = if r > g && g > b { 1.0 } else { 0.0 };
    let dark_penalty = if v < 0.20 { 0.45 } else { 0.0 };
    let gray_penalty = if s < 0.15 { 0.35 } else { 0.0 };
    let non_warm_penalty = if !(18.0..=58.0).contains(&h) { 0.25 } else { 0.0 };
    (0.35 * rgb_score + 0.25 * hue_score + 0.15 * sat_score + 0.15 * val_score + 0.10 * order_bonus
        - dark_penalty - gray_penalty - non_warm_penalty).clamp(0.0, 1.0)
}

fn rgb_to_hsv(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let r = (r / 255.0).clamp(0.0, 1.0);
    let g = (g / 255.0).clamp(0.0, 1.0);
    let b = (b / 255.0).clamp(0.0, 1.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let d = max - min;
    let h = if d <= 1e-6 { 0.0 } else if (max - r).abs() < 1e-6 {
        60.0 * (((g - b) / d) % 6.0)
    } else if (max - g).abs() < 1e-6 {
        60.0 * (((b - r) / d) + 2.0)
    } else {
        60.0 * (((r - g) / d) + 4.0)
    };
    let h = if h < 0.0 { h + 360.0 } else { h };
    let s = if max <= 1e-6 { 0.0 } else { d / max };
    (h, s, max)
}
fn hue_delta(a: f32, b: f32) -> f32 {
    let d = (a - b).abs();
    d.min(360.0 - d)
}
fn clean_beige_mask(w: usize, h: usize, beige: &[bool]) -> Vec<bool> {
    let mut out = beige.to_vec();
    for _ in 0..2 {
        let src = out.clone();
        for y in 1..h - 1 {
            for x in 1..w - 1 {
                let mut c = 0;
                for ny in (y - 1)..=(y + 1) {
                    for nx in (x - 1)..=(x + 1) {
                        if src[ny * w + nx] {
                            c += 1;
                        }
                    }
                }
                out[y * w + x] = c >= 5;
            }
        }
    }
    out
}
fn center_out_scan_sides(
    w: usize,
    h: usize,
    parchment_score: &[f32],
    m: f32,
    cx: f32,
    cy: f32,
    min_span: f32,
) -> ScanSides {
    let mut out = ScanSides::default();
    let dirs = [(-m, -1.0), (m, 1.0), (-1.0, m), (1.0, -m)];
    for (si, (dx, dy)) in dirs.into_iter().enumerate() {
        let mut points = Vec::new();
        let mut line_off = -0.45_f32;
        while line_off <= 0.45 {
            if let Some(p) = scan_single_ray(w, h, parchment_score, cx, cy, dx, dy, line_off, m) {
                points.push(p);
                push_debug_point(&mut out.transition_overlay_points, p.0, p.1);
            }
            line_off += 0.03;
        }
        let fit = fit_side_points(&points, m, si, cx, cy, min_span);
        if let Some(side) = match si { 0 => Some(&mut out.tr), 1 => Some(&mut out.bl), 2 => Some(&mut out.tl), _ => Some(&mut out.br) } {
            *side = fit;
        }
    }
    out
}
fn scan_single_ray(
    w: usize, h: usize, parchment_score: &[f32], cx: f32, cy: f32, dx: f32, dy: f32, line_off: f32, m: f32,
) -> Option<(f32, f32)> {
    let n = (dx * dx + dy * dy).sqrt();
    let (ux, uy) = (dx / n, dy / n);
    let tx = -uy;
    let ty = ux;
    let start_x = cx + tx * line_off * (w.min(h) as f32);
    let start_y = cy + ty * line_off * (w.min(h) as f32);
    let min_d = (w.min(h) as f32) * MIN_SCAN_CENTER_DISTANCE_FRAC;
    let max_d = (w.max(h) as f32) * 0.75;
    let step = 3.0_f32;
    let mut d = min_d;
    while d < max_d - 30.0 {
        let mut in_non = 0;
        let mut out_strong = 0;
        let mut far_non = 0;
        for k in 0..4 {
            let px = (start_x + ux * (d - (k as f32) * step)).round() as i32;
            let py = (start_y + uy * (d - (k as f32) * step)).round() as i32;
            if px >= 0 && py >= 0 && (px as usize) < w && (py as usize) < h {
                let s = parchment_score[py as usize * w + px as usize];
                if s < 0.45 { in_non += 1; }
            }
        }
        for k in 0..7 {
            let px = (start_x + ux * (d + (k as f32) * step)).round() as i32;
            let py = (start_y + uy * (d + (k as f32) * step)).round() as i32;
            if px >= 0 && py >= 0 && (px as usize) < w && (py as usize) < h {
                let s = parchment_score[py as usize * w + px as usize];
                if s >= 0.62 { out_strong += 1; }
            }
        }
        for k in 10..15 {
            let px = (start_x + ux * (d + (k as f32) * step)).round() as i32;
            let py = (start_y + uy * (d + (k as f32) * step)).round() as i32;
            if px >= 0 && py >= 0 && (px as usize) < w && (py as usize) < h {
                let s = parchment_score[py as usize * w + px as usize];
                if s < 0.42 { far_non += 1; }
            }
        }
        if in_non >= 3 && out_strong >= 5 && far_non >= 3 {
            let x = start_x + ux * d;
            let y = start_y + uy * d;
            let _ = m;
            return Some((x, y));
        }
        d += step;
    }
    None
}
fn fit_side_points(points: &[(f32, f32)], m: f32, side: usize, cx: f32, cy: f32, min_span: f32) -> SideScanFit {
    let mut fit = SideScanFit { raw_points: points.to_vec(), ..Default::default() };
    if points.len() < 8 { return fit; }
    let mut bs: Vec<f32> = points.iter().map(|(x,y)| if side <=1 { y - m* x } else { y + m * x }).collect();
    bs.sort_by(|a,b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = bs[bs.len()/2];
    fit.raw_median_b = Some(median);
    let tol = 14.0_f32;
    let inliers: Vec<(f32,f32)> = points.iter().copied().filter(|(x,y)| {
        let b = if side <=1 { y - m*x } else { y + m*x };
        (b - median).abs() <= tol
    }).collect();
    fit.outlier_count = points.len().saturating_sub(inliers.len());
    let span = if side <=1 { support_span(&inliers, m, true, median) } else { support_span(&inliers, m, false, median) };
    if inliers.len() < 6 || span < min_span { return fit; }
    let avg = inliers.iter().map(|(x,y)| if side <=1 { y - m*x } else { y + m*x }).sum::<f32>() / inliers.len() as f32;
    if (side == 0 && !(avg < cy - m*cx)) || (side==1 && !(avg > cy - m*cx)) || (side==2 && !(avg < cy + m*cx)) || (side==3 && !(avg > cy + m*cx)) {
        return fit;
    }
    fit.final_b = Some(avg);
    fit
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
                    if nx == x && ny == y {
                        continue;
                    }
                    if beige[ny * w + nx] != center {
                        has_flip = true;
                        break;
                    }
                }
                if has_flip {
                    break;
                }
            }
            out[idx] = has_flip;
        }
    }
    out
}

fn inward_outward_normals(
    normal: (f32, f32),
    x: f32,
    y: f32,
    center_x: f32,
    center_y: f32,
) -> ((f32, f32), (f32, f32)) {
    let n = (normal.0 * normal.0 + normal.1 * normal.1).sqrt();
    if n <= 1e-6 {
        return ((0.0, 0.0), (0.0, 0.0));
    }
    let nx = normal.0 / n;
    let ny = normal.1 / n;
    let tcx = center_x - x;
    let tcy = center_y - y;
    let tcn = (tcx * tcx + tcy * tcy).sqrt();
    if tcn <= 1e-6 {
        return ((nx, ny), (-nx, -ny));
    }
    let dot = nx * (tcx / tcn) + ny * (tcy / tcn);
    if dot > 0.0 {
        ((nx, ny), (-nx, -ny))
    } else {
        ((-nx, -ny), (nx, ny))
    }
}

fn parchment_transition_score(
    w: usize,
    h: usize,
    beige: &[bool],
    parchment_score: &[f32],
    x: f32,
    y: f32,
    outward: (f32, f32),
) -> Option<TransitionScore> {
    let n = (outward.0 * outward.0 + outward.1 * outward.1).sqrt();
    if n <= 1e-6 {
        return None;
    }
    let nx = outward.0 / n;
    let ny = outward.1 / n;
    let mut out_beige = 0usize;
    let mut in_beige = 0usize;
    let mut out_non_beige = 0usize;
    let mut in_non_beige = 0usize;
    let mut out_score_sum = 0.0_f32;
    let mut in_score_sum = 0.0_f32;
    let mut far_out_score_sum = 0.0_f32;
    let mut far_samples = 0usize;
    let mut samples = 0usize;
    for d in [4.0_f32, 8.0, 12.0, 16.0, 24.0] {
        let ox = (x + nx * d).round() as i32;
        let oy = (y + ny * d).round() as i32;
        let ix = (x - nx * d).round() as i32;
        let iy = (y - ny * d).round() as i32;
        if ox >= 0
            && oy >= 0
            && ix >= 0
            && iy >= 0
            && (ox as usize) < w
            && (oy as usize) < h
            && (ix as usize) < w
            && (iy as usize) < h
        {
            samples += 1;
            if beige[oy as usize * w + ox as usize] {
                out_beige += 1;
            } else {
                out_non_beige += 1;
            }
            out_score_sum += parchment_score[oy as usize * w + ox as usize];
            if beige[iy as usize * w + ix as usize] {
                in_beige += 1;
            } else {
                in_non_beige += 1;
            }
            in_score_sum += parchment_score[iy as usize * w + ix as usize];
            let fox = (x + nx * (d + 20.0)).round() as i32;
            let foy = (y + ny * (d + 20.0)).round() as i32;
            if fox >= 0 && foy >= 0 && (fox as usize) < w && (foy as usize) < h {
                far_out_score_sum += parchment_score[foy as usize * w + fox as usize];
                far_samples += 1;
            }
        }
    }
    if samples < 3 {
        None
    } else {
        Some(TransitionScore {
            outward_beige: out_beige,
            inward_beige: in_beige,
            outward_non_beige: out_non_beige,
            inward_non_beige: in_non_beige,
            outward_avg_score: out_score_sum / samples as f32,
            inward_avg_score: in_score_sum / samples as f32,
            far_out_avg_score: if far_samples > 0 { far_out_score_sum / far_samples as f32 } else { 0.0 },
        })
    }
}

fn classify_transition(score: TransitionScore) -> CandidateDecision {
    if score.inward_beige >= 3 && score.outward_non_beige >= 3 {
        return CandidateDecision::RejectedOuterParchmentEdge;
    }
    if score.outward_avg_score < 0.58 || score.inward_avg_score > score.outward_avg_score * 0.92 {
        return CandidateDecision::RejectedWeakBand;
    }
    if score.far_out_avg_score > score.outward_avg_score * 0.95 {
        return CandidateDecision::RejectedWeakBand;
    }
    if score.outward_beige < 3 || score.outward_beige <= score.inward_beige {
        return CandidateDecision::RejectedOutwardNotBeige;
    }
    if score.inward_beige > 1 && score.inward_beige >= score.inward_non_beige {
        return CandidateDecision::RejectedInwardTooBeige;
    }
    CandidateDecision::AcceptedInnerEdge
}

fn push_debug_point(points: &mut Vec<Point>, x: f32, y: f32) {
    if points.len() < MAX_DEBUG_POINTS {
        points.push([x, y]);
    }
}

fn pick_side_peak(
    hist: &[usize],
    pts: &[(f32, f32)],
    m: f32,
    is_positive: bool,
    center_b: f32,
    min_span: f32,
    diag: i32,
    smooth_radius: usize,
) -> (Option<f32>, usize, f32) {
    if hist.is_empty() {
        return (None, 0, 0.0);
    }
    let mut best_b = None;
    let mut best_votes = 0usize;
    let mut best_span = 0.0_f32;
    let mut best_score = 0.0_f32;
    for i in 0..hist.len() {
        let s = i.saturating_sub(smooth_radius);
        let e = (i + smooth_radius).min(hist.len() - 1);
        let mut votes = 0usize;
        for item in hist.iter().take(e + 1).skip(s) {
            votes += item;
        }
        if votes == 0 {
            continue;
        }
        let b = i as f32 - diag as f32;
        let span = support_span(pts, m, is_positive, b);
        if span < min_span {
            continue;
        }
        let support_quality = (span / min_span).min(2.0);
        let center_distance = (b - center_b).abs();
        let frame_position_quality = (center_distance / min_span.max(1.0)).powi(3).max(0.05);
        let score = votes as f32 * support_quality * frame_position_quality;
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
        let db = if is_positive {
            (y - m * x - b).abs()
        } else {
            (y + m * x - b).abs()
        };
        if db > line_tol {
            continue;
        }
        let t = if is_positive { x + y * m } else { x - y * m };
        min_t = min_t.min(t);
        max_t = max_t.max(t);
    }
    if min_t.is_finite() && max_t.is_finite() {
        max_t - min_t
    } else {
        0.0
    }
}

fn intersect_pm(m: f32, b_pos: f32, b_neg: f32) -> Point {
    let x = (b_neg - b_pos) / (2.0 * m);
    let y = (b_pos + b_neg) * 0.5;
    [x, y]
}
