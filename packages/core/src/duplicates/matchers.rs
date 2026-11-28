//! Ports of `apps/desktop/src/main/core/duplicates/matchers`. `IndexMap`
//! stands in for JavaScript's insertion-ordered `Map`, so evidence comes out in
//! the same order and ties break the same way.

use super::types::*;
use crate::fingerprint::audio::{
    compare_audio_prints, decode_audio_print, AudioPrint, AUDIO_PRINT_ALGORITHM,
};
use crate::fingerprint::dhash::is_low_detail_hash;
use crate::fingerprint::hamming::HammingIndex;
use crate::fingerprint::image::{decode_image_print, ImagePrint, IMAGE_PRINT_ALGORITHM};
use crate::fingerprint::video::{
    compare_video_prints, decode_video_print, VideoPrint, VIDEO_PRINT_ALGORITHM,
};
use rustc_hash::FxHashMap as HashMap;

pub type Prints = HashMap<String, Vec<u8>>;

/// Byte-identical files across Saves, plus whole-Save manifest equality.
pub fn sha256_matches(saves: &[Save]) -> Vec<Found> {
    let mut found = Vec::new();
    let mut by_sha: IndexMap<&str, IndexMap<&str, Vec<&Asset>>> = IndexMap::default();
    let mut by_manifest: IndexMap<String, Vec<String>> = IndexMap::default();

    for save in saves {
        let mut complete = !save.assets.is_empty();
        for asset in &save.assets {
            if !is_sha256(&asset.sha256) {
                complete = false;
                continue;
            }
            by_sha
                .entry(&asset.sha256)
                .or_default()
                .entry(&save.id)
                .or_default()
                .push(asset);
        }
        if !complete {
            continue;
        }
        let mut shas: Vec<&str> = save
            .assets
            .iter()
            .map(|asset| asset.sha256.as_str())
            .collect();
        shas.sort_unstable();
        by_manifest
            .entry(shas.join(","))
            .or_default()
            .push(save.id.clone());
    }

    for owners in by_sha.values() {
        if owners.len() < 2 {
            continue;
        }
        let mut ids: Vec<String> = owners.keys().map(|id| id.to_string()).collect();
        ids.sort();
        for (left, right) in fanout_pairs(&ids) {
            let left_assets = &owners[left.as_str()];
            let right_assets = &owners[right.as_str()];
            for (index, left_asset) in left_assets.iter().enumerate() {
                let Some(right_asset) = right_assets.get(index) else {
                    break;
                };
                let evidence = AssetEvidence::Sha256 {
                    left: (*left_asset).into(),
                    right: (*right_asset).into(),
                };
                if let Some(item) = asset_found(evidence, false) {
                    found.push(item);
                }
            }
        }
    }

    for (manifest, members) in by_manifest.iter_mut() {
        if members.len() < 2 {
            continue;
        }
        let files = manifest.split(',').count() as u32;
        members.sort();
        for ids in fanout_pairs(members) {
            found.push(Found {
                ids,
                save: Some(SaveEvidence::Manifest { files }),
                asset: None,
                supporting: false,
            });
        }
    }
    found
}

/// Two Saves of the same post or page, by the Save's own identity and the ones
/// re-derived from its URLs.
pub fn source_matches(saves: &[Save]) -> Vec<Found> {
    fn claim<'a>(
        owners: &mut IndexMap<(String, String), IndexSet<&'a str>>,
        source: &str,
        source_id: &str,
        id: &'a str,
    ) {
        if source_id.is_empty() || source == "local" {
            return;
        }
        owners
            .entry((source.to_owned(), source_id.to_owned()))
            .or_default()
            .insert(id);
    }
    let mut owners: IndexMap<(String, String), IndexSet<&str>> = IndexMap::default();
    for save in saves {
        claim(&mut owners, &save.source, &save.source_id, &save.id);
        for identity in &save.url_identities {
            claim(&mut owners, &identity.source, &identity.source_id, &save.id);
        }
    }

    let mut found = Vec::new();
    for ((source, source_id), ids) in owners {
        if ids.len() < 2 {
            continue;
        }
        let evidence = if source == "web" {
            SaveEvidence::Url { url: source_id }
        } else {
            SaveEvidence::Source { source, source_id }
        };
        let mut ids: Vec<String> = ids.into_iter().map(str::to_owned).collect();
        ids.sort();
        for pair in fanout_pairs(&ids) {
            found.push(Found {
                ids: pair,
                save: Some(evidence.clone()),
                asset: None,
                supporting: false,
            });
        }
    }
    found
}

/// Perceptual matchers compare each distinct file once, then fan the match out
/// to every Save that holds it.
fn assets_by_sha(saves: &[Save], include: impl Fn(&Asset) -> bool) -> IndexMap<&str, Vec<&Asset>> {
    let mut by_sha: IndexMap<&str, Vec<&Asset>> = IndexMap::default();
    for save in saves {
        for asset in &save.assets {
            if is_sha256(&asset.sha256) && include(asset) {
                by_sha.entry(&asset.sha256).or_default().push(asset);
            }
        }
    }
    by_sha
}

fn expand_sha_match(
    left: &[&Asset],
    right: &[&Asset],
    evidence: impl Fn(&Asset, &Asset) -> AssetEvidence,
    supporting: impl Fn(&Asset, &Asset) -> bool,
    found: &mut Vec<Found>,
) {
    for a in left.iter().take(MAX_FANOUT) {
        for b in right.iter().take(MAX_FANOUT) {
            if let Some(item) = asset_found(evidence(a, b), supporting(a, b)) {
                found.push(item);
            }
        }
    }
}

const IMAGE_FULL_DISTANCE: u32 = 6;
const IMAGE_CENTER_DISTANCE: u32 = 4;

pub fn image_matches(saves: &[Save], prints: &Prints) -> Vec<Found> {
    let by_sha = assets_by_sha(saves, |asset| {
        asset.media.as_deref() == Some("image") && prints.contains_key(&asset.sha256)
    });
    let mut index: HammingIndex<(usize, bool)> = HammingIndex::default();
    let mut decoded: Vec<(usize, ImagePrint)> = Vec::new();
    for (position, sha256) in by_sha.keys().enumerate() {
        let Some(print) = prints
            .get(*sha256)
            .and_then(|bytes| decode_image_print(bytes))
        else {
            continue;
        };
        if is_low_detail_hash(print.full) {
            continue;
        }
        decoded.push((position, print));
        index.add(print.full, (position, false));
        if !is_low_detail_hash(print.center) {
            index.add(print.center, (position, true));
        }
    }

    let mut best: IndexMap<(usize, usize), (usize, usize, u32)> = IndexMap::default();
    let mut consider = |left: usize, right: usize, distance: u32| {
        if left == right {
            return;
        }
        let key = (left.min(right), left.max(right));
        match best.get_mut(&key) {
            Some(current) if distance >= current.2 => {}
            Some(current) => *current = (left, right, distance),
            None => {
                best.insert(key, (left, right, distance));
            }
        }
    };
    for (position, print) in &decoded {
        for hit in index.search(print.full, IMAGE_FULL_DISTANCE) {
            let (other, center) = *hit.value;
            if center && hit.distance > IMAGE_CENTER_DISTANCE {
                continue;
            }
            consider(*position, other, hit.distance);
        }
        if is_low_detail_hash(print.center) {
            continue;
        }
        for hit in index.search(print.center, IMAGE_CENTER_DISTANCE) {
            consider(*position, hit.value.0, hit.distance);
        }
    }

    let mut found = Vec::new();
    for (left, right, distance) in best.into_values() {
        expand_sha_match(
            &by_sha[left],
            &by_sha[right],
            |a, b| AssetEvidence::Image {
                algorithm: IMAGE_PRINT_ALGORITHM,
                distance,
                left: a.into(),
                right: b.into(),
            },
            |_, _| false,
            &mut found,
        );
    }
    found
}

const VIDEO_CANDIDATE_DISTANCE: u32 = 4;
const VIDEO_QUERY_FRAMES: usize = 24;

fn detailed_frames(print: &VideoPrint) -> Vec<u64> {
    print
        .frames
        .iter()
        .copied()
        .filter(|frame| !is_low_detail_hash(*frame))
        .collect()
}

/// Sorted by duration, so each candidate after a video is the same length or longer.
fn video_candidates(prints: &[&VideoPrint]) -> Vec<(usize, usize)> {
    let mut index: HammingIndex<usize> = HammingIndex::default();
    let detailed: Vec<Vec<u64>> = prints.iter().map(|print| detailed_frames(print)).collect();
    for (position, frames) in detailed.iter().enumerate() {
        for frame in frames {
            index.add(*frame, position);
        }
    }
    let mut pairs = Vec::new();
    for (position, frames) in detailed.iter().enumerate() {
        let step = usize::max(1, frames.len() / VIDEO_QUERY_FRAMES);
        let mut others: Vec<usize> = Vec::new();
        for frame in frames.iter().step_by(step) {
            for hit in index.search(*frame, VIDEO_CANDIDATE_DISTANCE) {
                if *hit.value > position {
                    others.push(*hit.value);
                }
            }
        }
        others.sort_unstable();
        others.dedup();
        pairs.extend(others.into_iter().map(|other| (position, other)));
    }
    pairs
}

fn by_duration<P>(
    by_sha: &IndexMap<&str, Vec<&Asset>>,
    prints: &Prints,
    decode: impl Fn(&[u8]) -> Option<P>,
    duration: impl Fn(&P) -> f64,
) -> Vec<(usize, P)> {
    let mut decoded: Vec<(usize, P)> = by_sha
        .keys()
        .enumerate()
        .filter_map(|(position, sha256)| {
            prints
                .get(*sha256)
                .and_then(|bytes| decode(bytes))
                .map(|print| (position, print))
        })
        .collect();
    decoded.sort_by(|left, right| duration(&left.1).total_cmp(&duration(&right.1)));
    decoded
}

pub fn video_matches(saves: &[Save], prints: &Prints) -> Vec<Found> {
    let by_sha = assets_by_sha(saves, |asset| {
        asset.media.as_deref() == Some("video") && prints.contains_key(&asset.sha256)
    });
    let decoded = by_duration(&by_sha, prints, decode_video_print, |print| {
        print.duration_seconds
    });
    let views: Vec<&VideoPrint> = decoded.iter().map(|(_, print)| print).collect();

    let mut found = Vec::new();
    for (from, to) in video_candidates(&views) {
        let (left_sha, left) = &decoded[from];
        let (right_sha, right) = &decoded[to];
        let Some(matched) = compare_video_prints(left, right) else {
            continue;
        };
        expand_sha_match(
            &by_sha[*left_sha],
            &by_sha[*right_sha],
            |a, b| AssetEvidence::Video {
                algorithm: VIDEO_PRINT_ALGORITHM,
                matched_frames: matched.matched_frames,
                compared_frames: matched.compared_frames,
                offset_seconds: matched.offset_seconds,
                left: a.into(),
                right: b.into(),
            },
            |_, _| false,
            &mut found,
        );
    }
    found
}

/// About the first thirty seconds of each print, which is enough to find a copy
/// and keeps the lookup small.
const AUDIO_INDEX_FRAMES: usize = 1300;
const AUDIO_INDEX_STRIDE: usize = 2;
/// A sub-fingerprint shared by this many files is silence or a steady tone.
const AUDIO_MAX_BUCKET: usize = 64;
const AUDIO_MIN_VOTES: u32 = 2;

fn audio_candidates(prints: &[&AudioPrint]) -> Vec<(usize, usize)> {
    let mut lookup: HashMap<u32, Vec<usize>> = HashMap::default();
    for (position, print) in prints.iter().enumerate() {
        let end = print.frames.len().min(AUDIO_INDEX_FRAMES);
        for frame in (0..end).step_by(AUDIO_INDEX_STRIDE) {
            let list = lookup.entry(print.frames[frame]).or_default();
            if list.len() <= AUDIO_MAX_BUCKET && list.last() != Some(&position) {
                list.push(position);
            }
        }
    }
    let mut pairs = Vec::new();
    let mut votes: HashMap<usize, u32> = HashMap::default();
    for (position, print) in prints.iter().enumerate() {
        votes.clear();
        let end = print.frames.len().min(AUDIO_INDEX_FRAMES);
        for &value in &print.frames[..end] {
            for bit in -1i32..32 {
                let probe = if bit < 0 {
                    value
                } else {
                    value ^ (1u32 << bit)
                };
                let Some(list) = lookup.get(&probe) else {
                    continue;
                };
                if list.len() > AUDIO_MAX_BUCKET {
                    continue;
                }
                for &other in list {
                    if other > position {
                        *votes.entry(other).or_default() += 1;
                    }
                }
            }
        }
        let mut voted: Vec<(usize, u32)> = votes
            .iter()
            .map(|(other, count)| (*other, *count))
            .collect();
        voted.sort_unstable();
        pairs.extend(
            voted
                .into_iter()
                .filter(|(_, count)| *count >= AUDIO_MIN_VOTES)
                .map(|(other, _)| (position, other)),
        );
    }
    pairs
}

/// A shared soundtrack does not make two videos the same, so audio between two
/// videos only supports a frame match.
pub fn audio_matches(saves: &[Save], prints: &Prints) -> Vec<Found> {
    let by_sha = assets_by_sha(saves, |asset| {
        matches!(asset.media.as_deref(), Some("audio") | Some("video"))
            && prints.contains_key(&asset.sha256)
    });
    let decoded = by_duration(&by_sha, prints, decode_audio_print, |print| {
        print.duration_seconds
    });
    let views: Vec<&AudioPrint> = decoded.iter().map(|(_, print)| print).collect();

    let mut found = Vec::new();
    for (from, to) in audio_candidates(&views) {
        let (left_sha, left) = &decoded[from];
        let (right_sha, right) = &decoded[to];
        let Some(matched) = compare_audio_prints(left, right) else {
            continue;
        };
        expand_sha_match(
            &by_sha[*left_sha],
            &by_sha[*right_sha],
            |a, b| AssetEvidence::Audio {
                algorithm: AUDIO_PRINT_ALGORITHM,
                bit_error_rate: matched.bit_error_rate,
                offset_seconds: matched.offset_seconds,
                left: a.into(),
                right: b.into(),
            },
            |a, b| a.media.as_deref() == Some("video") && b.media.as_deref() == Some("video"),
            &mut found,
        );
    }
    found
}
