pub const DHASH_WIDTH: usize = 9;
pub const DHASH_HEIGHT: usize = 8;

/// Bit order matches `encodePhash`: row-major, most significant bit first, set
/// when a pixel is brighter than its right neighbour.
pub fn dhash_from_gray<T: Copy + Into<f64>>(pixels: &[T]) -> u64 {
    let mut bits = 0u64;
    let mut index = 0;
    for y in 0..DHASH_HEIGHT {
        for x in 0..DHASH_WIDTH - 1 {
            let left: f64 = pixels.get(y * DHASH_WIDTH + x).map_or(0.0, |v| (*v).into());
            let right: f64 = pixels
                .get(y * DHASH_WIDTH + x + 1)
                .map_or(0.0, |v| (*v).into());
            if left > right {
                bits |= 1u64 << (63 - index);
            }
            index += 1;
        }
    }
    bits
}

/// Flat images, black frames, and smooth gradients set almost no bits, so their
/// hashes collide with each other.
pub fn is_low_detail_hash(hash: u64) -> bool {
    let bits = hash.count_ones();
    !(6..=58).contains(&bits)
}

pub struct Region {
    pub left: f64,
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
}

/// Box-averages a region of a greyscale image into the 9×8 grid a dHash reads.
pub fn sample_dhash_grid(
    pixels: &[u8],
    width: usize,
    height: usize,
    region: &Region,
) -> [f64; DHASH_WIDTH * DHASH_HEIGHT] {
    let mut grid = [0f64; DHASH_WIDTH * DHASH_HEIGHT];
    let cell_width = (region.right - region.left) / DHASH_WIDTH as f64;
    let cell_height = (region.bottom - region.top) / DHASH_HEIGHT as f64;
    for gy in 0..DHASH_HEIGHT {
        let y0 = (region.top + gy as f64 * cell_height).floor() as i64;
        let y1 = i64::max(
            y0 + 1,
            (region.top + (gy + 1) as f64 * cell_height).floor() as i64,
        );
        for gx in 0..DHASH_WIDTH {
            let x0 = (region.left + gx as f64 * cell_width).floor() as i64;
            let x1 = i64::max(
                x0 + 1,
                (region.left + (gx + 1) as f64 * cell_width).floor() as i64,
            );
            let mut sum = 0f64;
            let mut count = 0u32;
            let mut y = y0;
            while y < i64::min(y1, height as i64) {
                let mut x = x0;
                while x < i64::min(x1, width as i64) {
                    sum += pixels
                        .get(y as usize * width + x as usize)
                        .map_or(0.0, |v| *v as f64);
                    count += 1;
                    x += 1;
                }
                y += 1;
            }
            grid[gy * DHASH_WIDTH + gx] = if count > 0 { sum / count as f64 } else { 0.0 };
        }
    }
    grid
}
