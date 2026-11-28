//! The same iterative radix-2 FFT as `fft.ts`. A library FFT would reorder the
//! butterflies and change the last bits of band energies, which can flip print bits.

use std::f64::consts::PI;

pub struct Fft {
    cos: Vec<f64>,
    sin: Vec<f64>,
    reverse: Vec<usize>,
}

impl Fft {
    pub fn new(size: usize) -> Self {
        assert!(size.is_power_of_two(), "FFT size must be a power of two");
        let bits = size.trailing_zeros();
        let half = size / 2;
        let mut cos = vec![0f64; half];
        let mut sin = vec![0f64; half];
        for index in 0..half {
            cos[index] = ((2.0 * PI * index as f64) / size as f64).cos();
            sin[index] = -((2.0 * PI * index as f64) / size as f64).sin();
        }
        let mut reverse = vec![0usize; size];
        for (index, slot) in reverse.iter_mut().enumerate() {
            let mut value = 0usize;
            for bit in 0..bits {
                value |= ((index >> bit) & 1) << (bits - 1 - bit);
            }
            *slot = value;
        }
        Self { cos, sin, reverse }
    }

    /// In-place transform of `real` and `imag`, both `size` long.
    pub fn run(&self, real: &mut [f64], imag: &mut [f64]) {
        let size = real.len();
        for index in 0..size {
            let swap = self.reverse[index];
            if swap <= index {
                continue;
            }
            real.swap(index, swap);
            imag.swap(index, swap);
        }
        let mut span = 2;
        while span <= size {
            let half = span / 2;
            let stride = size / span;
            let mut start = 0;
            while start < size {
                for offset in 0..half {
                    let wr = self.cos[offset * stride];
                    let wi = self.sin[offset * stride];
                    let even = start + offset;
                    let odd = even + half;
                    let odd_real = real[odd];
                    let odd_imag = imag[odd];
                    let tr = wr * odd_real - wi * odd_imag;
                    let ti = wr * odd_imag + wi * odd_real;
                    real[odd] = real[even] - tr;
                    imag[odd] = imag[even] - ti;
                    real[even] += tr;
                    imag[even] += ti;
                }
                start += span;
            }
            span *= 2;
        }
    }
}
