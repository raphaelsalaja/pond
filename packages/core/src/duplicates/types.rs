//! Wire types for the duplicate engine. Field names and tags match
//! `apps/desktop/src/shared/duplicate-contracts.ts`, so the JSON result parses
//! straight into `DuplicatePair` and `DuplicateGroup`.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

/// A hash shared by thousands of Saves (a blank page, a common icon) would
/// otherwise produce millions of pairs.
pub const MAX_FANOUT: usize = 64;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub save_id: String,
    pub path: String,
    pub kind: String,
    pub size: f64,
    pub sha256: String,
    #[serde(default)]
    pub media: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetRef {
    pub save_id: String,
    pub path: String,
    pub kind: String,
    pub size: f64,
    pub sha256: String,
}

impl From<&Asset> for AssetRef {
    fn from(asset: &Asset) -> Self {
        Self {
            save_id: asset.save_id.clone(),
            path: asset.path.clone(),
            kind: asset.kind.clone(),
            size: asset.size,
            sha256: asset.sha256.clone(),
        }
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub source: String,
    pub source_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Save {
    pub id: String,
    pub source: String,
    pub source_id: String,
    pub assets: Vec<Asset>,
    /// Source identities re-derived from the Save's URLs by the TypeScript
    /// classifier, already empty for split Saves.
    #[serde(default)]
    pub url_identities: Vec<Identity>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(
    tag = "matcher",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum SaveEvidence {
    Manifest { files: u32 },
    Source { source: String, source_id: String },
    Url { url: String },
    Semantic { model: String, distance: f64 },
}

#[derive(Serialize, Clone, Debug)]
#[serde(
    tag = "matcher",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum AssetEvidence {
    Sha256 {
        left: AssetRef,
        right: AssetRef,
    },
    Image {
        algorithm: &'static str,
        distance: u32,
        left: AssetRef,
        right: AssetRef,
    },
    Video {
        algorithm: &'static str,
        matched_frames: u32,
        compared_frames: u32,
        offset_seconds: f64,
        left: AssetRef,
        right: AssetRef,
    },
    Audio {
        algorithm: &'static str,
        bit_error_rate: f64,
        offset_seconds: f64,
        left: AssetRef,
        right: AssetRef,
    },
}

impl AssetEvidence {
    pub fn sides(&self) -> (&AssetRef, &AssetRef) {
        match self {
            Self::Sha256 { left, right }
            | Self::Image { left, right, .. }
            | Self::Video { left, right, .. }
            | Self::Audio { left, right, .. } => (left, right),
        }
    }

    fn sides_mut(&mut self) -> (&mut AssetRef, &mut AssetRef) {
        match self {
            Self::Sha256 { left, right }
            | Self::Image { left, right, .. }
            | Self::Video { left, right, .. }
            | Self::Audio { left, right, .. } => (left, right),
        }
    }

    pub fn strength(&self) -> f64 {
        match self {
            Self::Sha256 { .. } => 0.0,
            Self::Image { distance, .. } => *distance as f64 / 64.0,
            Self::Video {
                matched_frames,
                compared_frames,
                ..
            } => 1.0 - *matched_frames as f64 / *compared_frames as f64,
            Self::Audio { bit_error_rate, .. } => *bit_error_rate,
        }
    }
}

/// One piece of evidence for a pair. `supporting` evidence never counts toward coverage.
pub struct Found {
    pub ids: (String, String),
    pub save: Option<SaveEvidence>,
    pub asset: Option<AssetEvidence>,
    pub supporting: bool,
}

#[derive(Deserialize)]
pub struct FoundInput {
    pub ids: (String, String),
    pub save: SaveEvidence,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Relation {
    Exact,
    Near,
    Overlap,
    Related,
}

impl Relation {
    pub fn rank(self) -> u8 {
        self as u8
    }
}

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub left: u32,
    pub left_total: u32,
    pub right: u32,
    pub right_total: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pair {
    pub ids: (String, String),
    pub relation: Relation,
    pub save_evidence: Vec<SaveEvidence>,
    pub asset_evidence: Vec<AssetEvidence>,
    pub coverage: Coverage,
}

#[derive(Serialize, Clone)]
pub struct Group {
    pub relation: Relation,
    pub ids: Vec<String>,
    pub pairs: Vec<usize>,
}

#[derive(Deserialize)]
pub struct Dismissal {
    pub ids: (String, String),
    pub relation: Relation,
}

pub fn order_ids(left: &str, right: &str) -> (String, String) {
    if left < right {
        (left.to_owned(), right.to_owned())
    } else {
        (right.to_owned(), left.to_owned())
    }
}

/// Stands in for `String.prototype.localeCompare` on ids and paths. ULIDs and
/// generated file names sort the same either way; see the plan for where they differ.
pub fn text_order(left: &str, right: &str) -> Ordering {
    left.cmp(right)
}

/// Orients asset evidence so `left` belongs to the first id of the ordered pair.
pub fn asset_found(mut evidence: AssetEvidence, supporting: bool) -> Option<Found> {
    let (left, right) = evidence.sides();
    if left.save_id == right.save_id {
        return None;
    }
    if left.save_id > right.save_id {
        let (left, right) = evidence.sides_mut();
        std::mem::swap(left, right);
        match &mut evidence {
            AssetEvidence::Video { offset_seconds, .. }
            | AssetEvidence::Audio { offset_seconds, .. } => {
                *offset_seconds = -*offset_seconds;
            }
            _ => {}
        }
    }
    let (left, right) = evidence.sides();
    let ids = (left.save_id.clone(), right.save_id.clone());
    Some(Found {
        ids,
        save: None,
        asset: Some(evidence),
        supporting,
    })
}

/// Every pair among the first `limit` ids, then each remaining id paired with the first.
pub fn fanout_pairs(ids: &[String]) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let head = &ids[..ids.len().min(MAX_FANOUT)];
    for (offset, left) in head.iter().enumerate() {
        for right in &head[offset + 1..] {
            pairs.push(order_ids(left, right));
        }
    }
    if let Some(anchor) = ids.first() {
        for id in ids.iter().skip(MAX_FANOUT) {
            pairs.push(order_ids(anchor, id));
        }
    }
    pairs
}

pub fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Insertion-ordered like a JavaScript `Map`, with a fast hasher: the keys are
/// ids and hashes from the Library, not attacker-chosen input.
pub type IndexMap<K, V> = indexmap::IndexMap<K, V, rustc_hash::FxBuildHasher>;
pub type IndexSet<K> = indexmap::IndexSet<K, rustc_hash::FxBuildHasher>;
