use super::dhash::{dhash_from_gray, sample_dhash_grid, Region};
use super::read_u64;

pub const IMAGE_PRINT_ALGORITHM: &str = "image-dhash@1";
const CENTER_INSET: f64 = 0.1;

#[derive(Clone, Copy)]
pub struct ImagePrint {
    pub full: u64,
    /// The middle 80%, so a screenshot with a border or a light crop still lines up.
    pub center: u64,
}

pub fn image_print_from_gray(pixels: &[u8], width: usize, height: usize) -> ImagePrint {
    let inset_x = width as f64 * CENTER_INSET;
    let inset_y = height as f64 * CENTER_INSET;
    let whole = Region {
        left: 0.0,
        top: 0.0,
        right: width as f64,
        bottom: height as f64,
    };
    let middle = Region {
        left: inset_x,
        top: inset_y,
        right: width as f64 - inset_x,
        bottom: height as f64 - inset_y,
    };
    ImagePrint {
        full: dhash_from_gray(&sample_dhash_grid(pixels, width, height, &whole)),
        center: dhash_from_gray(&sample_dhash_grid(pixels, width, height, &middle)),
    }
}

pub fn encode_image_print(print: &ImagePrint) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(16);
    bytes.extend_from_slice(&print.full.to_be_bytes());
    bytes.extend_from_slice(&print.center.to_be_bytes());
    bytes
}

pub fn decode_image_print(bytes: &[u8]) -> Option<ImagePrint> {
    if bytes.len() != 16 {
        return None;
    }
    Some(ImagePrint {
        full: read_u64(bytes, 0),
        center: read_u64(bytes, 8),
    })
}
