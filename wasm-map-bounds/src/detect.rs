use serde::Serialize;
use std::f32::consts::PI;
use std::time::Instant;

pub type Point = [f32; 2];

#[derive(Debug, Clone, Serialize)]
pub struct TimingMs {
    pub grayscale: f32,
    pub edges: f32,
    pub hough: f32,
    pub line_parsing: f32,
    pub total_detect: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectResult {
    pub corners: Corners,
    #[serde(rename = "usedPadding")]
    pub used_padding: bool,
    #[serde(rename = "positiveLineCount")]
    pub positive_line_count: usize,
    #[serde(rename = "negativeLineCount")]
    pub negative_line_count: usize,
    #[serde(rename = "timingMs")]
    pub timing_ms: Option<TimingMs>,
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

#[derive(Debug, Clone)]
struct PolarLine {
    theta_deg: f32,
    rho: f32,
    votes: u32,
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
    if rgba.len() != (width as usize) * (height as usize) * 4 {
        return Err(format!("invalid RGBA length {}, expected {}", rgba.len(), (width as usize) * (height as usize) * 4));
    }

    let total_start = Instant::now();

    let t_gray = Instant::now();
    let gray = rgba_to_gray(width as usize, height as usize, rgba);
    let grayscale_ms = t_gray.elapsed().as_secs_f32() * 1000.0;

    let t_edges = Instant::now();
    let edges = sobel_edges(width as usize, height as usize, &gray);
    let edges_ms = t_edges.elapsed().as_secs_f32() * 1000.0;

    let t_hough = Instant::now();
    let (pos, neg) = constrained_hough(width as usize, height as usize, &edges);
    let hough_ms = t_hough.elapsed().as_secs_f32() * 1000.0;

    let t_parse = Instant::now();
    let mut result = DetectResult {
        corners: fallback_corners(width, height),
        used_padding: false,
        positive_line_count: pos.len(),
        negative_line_count: neg.len(),
        timing_ms: None,
    };

    if pos.len() >= 2 && neg.len() >= 2 {
        let tr = pos.iter().min_by(|a, b| a.rho.partial_cmp(&b.rho).unwrap()).unwrap();
        let bl = pos.iter().max_by(|a, b| a.rho.partial_cmp(&b.rho).unwrap()).unwrap();
        let tl = neg.iter().min_by(|a, b| a.rho.partial_cmp(&b.rho).unwrap()).unwrap();
        let br = neg.iter().max_by(|a, b| a.rho.partial_cmp(&b.rho).unwrap()).unwrap();

        let top = intersect_polar(tl, tr);
        let right = intersect_polar(tr, br);
        let bottom = intersect_polar(bl, br);
        let left = intersect_polar(tl, bl);

        if let (Some(top), Some(right), Some(bottom), Some(left)) = (top, right, bottom, left) {
            result.corners = Corners { top, right, bottom, left };
        }
    }

    let line_parsing_ms = t_parse.elapsed().as_secs_f32() * 1000.0;
    result.timing_ms = Some(TimingMs {
        grayscale: grayscale_ms,
        edges: edges_ms,
        hough: hough_ms,
        line_parsing: line_parsing_ms,
        total_detect: total_start.elapsed().as_secs_f32() * 1000.0,
    });

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
    if width < 3 || height < 3 {
        return vec![0u8; width * height];
    }

    let mut mag = vec![0u16; width * height];
    let mut max_mag = 1u16;
    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let idx = |xx: usize, yy: usize| gray[yy * width + xx] as i32;
            let gx = -idx(x - 1, y - 1) + idx(x + 1, y - 1)
                - 2 * idx(x - 1, y) + 2 * idx(x + 1, y)
                - idx(x - 1, y + 1) + idx(x + 1, y + 1);
            let gy = -idx(x - 1, y - 1) - 2 * idx(x, y - 1) - idx(x + 1, y - 1)
                + idx(x - 1, y + 1) + 2 * idx(x, y + 1) + idx(x + 1, y + 1);
            let m = ((gx * gx + gy * gy) as f32).sqrt() as u16;
            mag[y * width + x] = m;
            if m > max_mag { max_mag = m; }
        }
    }

    // Detection threshold: retain strong edges only for fast constrained hough.
    let threshold = ((max_mag as f32) * 0.35).max(30.0) as u16;
    mag.into_iter().map(|m| if m >= threshold { 255 } else { 0 }).collect()
}

fn constrained_hough(width: usize, height: usize, edges: &[u8]) -> (Vec<PolarLine>, Vec<PolarLine>) {
    if width < 3 || height < 3 {
        return (Vec::new(), Vec::new());
    }

    let diag = (((width * width + height * height) as f32).sqrt()).ceil() as i32;
    let rho_bins = (diag * 2 + 1) as usize;

    // Angle windows tuned for diamond map borders.
    let pos_thetas: Vec<f32> = (28..=42).step_by(2).map(|d| d as f32).collect();
    let neg_thetas: Vec<f32> = (138..=152).step_by(2).map(|d| d as f32).collect();

    let pos = hough_group(width, height, edges, diag, rho_bins, &pos_thetas);
    let neg = hough_group(width, height, edges, diag, rho_bins, &neg_thetas);
    (pos, neg)
}

fn hough_group(
    width: usize,
    height: usize,
    edges: &[u8],
    diag: i32,
    rho_bins: usize,
    thetas: &[f32],
) -> Vec<PolarLine> {
    let mut out = Vec::new();
    for theta_deg in thetas {
        let theta = theta_deg * PI / 180.0;
        let cos_t = theta.cos();
        let sin_t = theta.sin();
        let mut acc = vec![0u16; rho_bins];

        for y in 1..(height - 1) {
            for x in 1..(width - 1) {
                if edges[y * width + x] == 0 { continue; }
                let rho = x as f32 * cos_t + y as f32 * sin_t;
                let r = (rho.round() as i32) + diag;
                if r >= 0 && (r as usize) < rho_bins {
                    acc[r as usize] += 1;
                }
            }
        }

        let max_votes = *acc.iter().max().unwrap_or(&0) as u32;
        if max_votes < 12 { continue; }
        let keep_threshold = ((max_votes as f32) * 0.55).max(12.0) as u16;
        for (ri, votes) in acc.iter().enumerate() {
            if *votes >= keep_threshold {
                out.push(PolarLine {
                    theta_deg: *theta_deg,
                    rho: (ri as i32 - diag) as f32,
                    votes: *votes as u32,
                });
            }
        }
    }

    out.sort_by(|a, b| b.votes.cmp(&a.votes));
    out.truncate(48);
    out
}

fn intersect_polar(a: &PolarLine, b: &PolarLine) -> Option<Point> {
    let t1 = a.theta_deg * PI / 180.0;
    let t2 = b.theta_deg * PI / 180.0;
    let (c1, s1) = (t1.cos(), t1.sin());
    let (c2, s2) = (t2.cos(), t2.sin());
    let det = c1 * s2 - s1 * c2;
    if det.abs() < 1e-6 { return None; }
    let x = (a.rho * s2 - s1 * b.rho) / det;
    let y = (c1 * b.rho - a.rho * c2) / det;
    Some([x, y])
}
