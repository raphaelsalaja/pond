//! Ports of `classify.ts`, `group.ts` and `engine.ts`.

use super::matchers::{
    audio_matches, image_matches, sha256_matches, source_matches, video_matches, Prints,
};
use super::types::*;
use rustc_hash::{FxHashMap as HashMap, FxHashSet as HashSet};
use serde::{Deserialize, Serialize};

fn save_evidence_key(evidence: &SaveEvidence) -> String {
    match evidence {
        SaveEvidence::Manifest { .. } => "manifest".to_owned(),
        SaveEvidence::Source { source, source_id } => format!("source:{source}:{source_id}"),
        SaveEvidence::Url { url } => format!("url:{url}"),
        SaveEvidence::Semantic { .. } => "semantic".to_owned(),
    }
}

fn merge_save_evidence(list: &mut Vec<SaveEvidence>, next: SaveEvidence) {
    let key = save_evidence_key(&next);
    match list.iter().position(|item| save_evidence_key(item) == key) {
        None => list.push(next),
        Some(index) => {
            if let (
                SaveEvidence::Semantic {
                    distance: current, ..
                },
                SaveEvidence::Semantic { distance, .. },
            ) = (&list[index], &next)
            {
                if distance < current {
                    list[index] = next;
                }
            }
        }
    }
}

fn relation_for(
    save_evidence: &[SaveEvidence],
    matched: usize,
    coverage: &Coverage,
) -> Option<Relation> {
    if save_evidence.iter().any(|item| {
        matches!(
            item,
            SaveEvidence::Manifest { .. } | SaveEvidence::Source { .. } | SaveEvidence::Url { .. }
        )
    }) {
        return Some(Relation::Exact);
    }
    if matched > 0 && coverage.left == coverage.left_total && coverage.right == coverage.right_total
    {
        return Some(Relation::Near);
    }
    if matched > 0 {
        return Some(Relation::Overlap);
    }
    if save_evidence
        .iter()
        .any(|item| matches!(item, SaveEvidence::Semantic { .. }))
    {
        return Some(Relation::Related);
    }
    None
}

struct Bucket {
    ids: (String, String),
    save_evidence: Vec<SaveEvidence>,
    primary: Vec<AssetEvidence>,
    supporting: Vec<AssetEvidence>,
}

/// Folds every piece of evidence into one pair per two Saves, matching each
/// file at most once on each side.
pub fn build_pairs(found: Vec<Found>, asset_counts: &HashMap<&str, u32>) -> Vec<Pair> {
    let mut buckets: IndexMap<(String, String), Bucket> = IndexMap::default();
    for item in found {
        let bucket = buckets.entry(item.ids.clone()).or_insert_with(|| Bucket {
            ids: item.ids.clone(),
            save_evidence: Vec::new(),
            primary: Vec::new(),
            supporting: Vec::new(),
        });
        if let Some(save) = item.save {
            merge_save_evidence(&mut bucket.save_evidence, save);
        }
        if let Some(asset) = item.asset {
            if item.supporting {
                bucket.supporting.push(asset);
            } else {
                bucket.primary.push(asset);
            }
        }
    }

    let mut pairs = Vec::new();
    for bucket in buckets.into_values() {
        let mut ordered = bucket.primary;
        ordered.sort_by(|left, right| {
            left.strength()
                .partial_cmp(&right.strength())
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| text_order(&left.sides().0.path, &right.sides().0.path))
                .then_with(|| text_order(&left.sides().1.path, &right.sides().1.path))
        });
        let mut used_left: HashSet<String> = HashSet::default();
        let mut used_right: HashSet<String> = HashSet::default();
        let mut assigned: Vec<AssetEvidence> = Vec::new();
        for evidence in ordered {
            let (left, right) = evidence.sides();
            if used_left.contains(&left.path) || used_right.contains(&right.path) {
                continue;
            }
            used_left.insert(left.path.clone());
            used_right.insert(right.path.clone());
            assigned.push(evidence);
        }
        let matched_files: HashSet<(&str, &str)> = assigned
            .iter()
            .map(|item| (item.sides().0.path.as_str(), item.sides().1.path.as_str()))
            .collect();
        let supporting: Vec<AssetEvidence> = bucket
            .supporting
            .into_iter()
            .filter(|item| {
                matched_files
                    .contains(&(item.sides().0.path.as_str(), item.sides().1.path.as_str()))
            })
            .collect();
        let coverage = Coverage {
            left: used_left.len() as u32,
            left_total: asset_counts
                .get(bucket.ids.0.as_str())
                .copied()
                .unwrap_or(0),
            right: used_right.len() as u32,
            right_total: asset_counts
                .get(bucket.ids.1.as_str())
                .copied()
                .unwrap_or(0),
        };
        let Some(relation) = relation_for(&bucket.save_evidence, assigned.len(), &coverage) else {
            continue;
        };
        let mut asset_evidence = assigned;
        asset_evidence.extend(supporting);
        pairs.push(Pair {
            ids: bucket.ids,
            relation,
            save_evidence: bucket.save_evidence,
            asset_evidence,
            coverage,
        });
    }
    pairs
}

#[derive(Default)]
struct UnionFind {
    parent: HashMap<String, String>,
}

impl UnionFind {
    fn find(&mut self, id: &str) -> String {
        let mut root = id.to_owned();
        while let Some(next) = self.parent.get(&root) {
            if *next == root {
                break;
            }
            root = next.clone();
        }
        let mut node = id.to_owned();
        while node != root {
            let next = self
                .parent
                .get(&node)
                .cloned()
                .unwrap_or_else(|| root.clone());
            self.parent.insert(node, root.clone());
            node = next;
        }
        root
    }

    fn union(&mut self, left: &str, right: &str) {
        let a = self.find(left);
        let b = self.find(right);
        if a == b {
            return;
        }
        if a < b {
            self.parent.insert(b, a);
        } else {
            self.parent.insert(a, b);
        }
    }

    fn has(&self, id: &str) -> bool {
        self.parent.contains_key(id)
    }

    fn add(&mut self, id: &str) {
        self.parent
            .entry(id.to_owned())
            .or_insert_with(|| id.to_owned());
    }
}

/// Exact matches are transitive and union; near matches are not, so a near
/// group only admits Saves that match every member, and absorbs any exact
/// group it touches.
pub fn group_pairs(pairs: &[Pair]) -> Vec<Group> {
    let mut exact = UnionFind::default();
    for pair in pairs.iter().filter(|pair| pair.relation == Relation::Exact) {
        exact.add(&pair.ids.0);
        exact.add(&pair.ids.1);
        exact.union(&pair.ids.0, &pair.ids.1);
    }
    let mut exact_components: IndexMap<String, IndexSet<String>> = IndexMap::default();
    for pair in pairs.iter().filter(|pair| pair.relation == Relation::Exact) {
        for id in [&pair.ids.0, &pair.ids.1] {
            let root = exact.find(id);
            exact_components.entry(root).or_default().insert(id.clone());
        }
    }
    let mut node = |id: &str| {
        if exact.has(id) {
            exact.find(id)
        } else {
            id.to_owned()
        }
    };

    let mut near: IndexMap<String, IndexSet<String>> = IndexMap::default();
    let mut near_nodes: Vec<(String, String)> = Vec::with_capacity(pairs.len());
    for pair in pairs {
        near_nodes.push((node(&pair.ids.0), node(&pair.ids.1)));
    }
    for (pair, (left, right)) in pairs.iter().zip(&near_nodes) {
        if pair.relation != Relation::Near || left == right {
            continue;
        }
        near.entry(left.clone()).or_default().insert(right.clone());
        near.entry(right.clone()).or_default().insert(left.clone());
    }

    let members_of = |root: &str| -> Vec<String> {
        match exact_components.get(root) {
            Some(members) => members.iter().cloned().collect(),
            None => vec![root.to_owned()],
        }
    };

    let mut groups: Vec<Group> = Vec::new();
    let mut near_group_of: HashMap<String, usize> = HashMap::default();
    for (pair, (left, right)) in pairs.iter().zip(&near_nodes) {
        if pair.relation != Relation::Near {
            continue;
        }
        if left == right || near_group_of.contains_key(left) || near_group_of.contains_key(right) {
            continue;
        }
        let mut nodes = vec![left.clone(), right.clone()];
        let mut candidates: Vec<String> = near
            .get(left)
            .into_iter()
            .chain(near.get(right))
            .flat_map(|set| set.iter().cloned())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        candidates.sort();
        for candidate in candidates {
            if nodes.contains(&candidate) || near_group_of.contains_key(&candidate) {
                continue;
            }
            if nodes
                .iter()
                .all(|member| near.get(member).is_some_and(|set| set.contains(&candidate)))
            {
                nodes.push(candidate);
            }
        }
        let position = groups.len();
        for member in &nodes {
            near_group_of.insert(member.clone(), position);
        }
        let mut ids: Vec<String> = nodes.iter().flat_map(|member| members_of(member)).collect();
        ids.sort();
        groups.push(Group {
            relation: Relation::Near,
            ids,
            pairs: Vec::new(),
        });
    }

    for (root, members) in &exact_components {
        if near_group_of.contains_key(root) {
            continue;
        }
        let mut ids: Vec<String> = members.iter().cloned().collect();
        ids.sort();
        groups.push(Group {
            relation: Relation::Exact,
            ids,
            pairs: Vec::new(),
        });
    }

    /* Near and exact groups never share a Save, so one pass over the pairs finds every pair
    inside each group, already in position order. `groupPairs` tries every two members instead,
    which is quadratic in the size of a group. */
    let mut group_of: HashMap<&str, usize> = HashMap::default();
    for (position, group) in groups.iter().enumerate() {
        for id in &group.ids {
            group_of.insert(id.as_str(), position);
        }
    }
    let mut inside: Vec<Vec<usize>> = vec![Vec::new(); groups.len()];
    for (position, pair) in pairs.iter().enumerate() {
        if let (Some(left), Some(right)) = (
            group_of.get(pair.ids.0.as_str()),
            group_of.get(pair.ids.1.as_str()),
        ) {
            if left == right {
                inside[*left].push(position);
            }
        }
    }
    drop(group_of);
    for (group, positions) in groups.iter_mut().zip(inside) {
        group.pairs = positions;
    }

    for (position, (pair, (left, right))) in pairs.iter().zip(&near_nodes).enumerate() {
        if pair.relation == Relation::Exact || left == right {
            continue;
        }
        if let Some(group) = near_group_of.get(left) {
            if near_group_of.get(right) == Some(group) {
                continue;
            }
        }
        groups.push(Group {
            relation: pair.relation,
            ids: vec![pair.ids.0.clone(), pair.ids.1.clone()],
            pairs: vec![position],
        });
    }

    groups.sort_by(|left, right| {
        left.relation
            .rank()
            .cmp(&right.relation.rank())
            .then_with(|| right.ids.len().cmp(&left.ids.len()))
            .then_with(|| {
                text_order(
                    left.ids.first().map_or("", String::as_str),
                    right.ids.first().map_or("", String::as_str),
                )
            })
    });
    groups
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchInput {
    pub saves: Vec<Save>,
    #[serde(default)]
    pub fingerprints: Option<FingerprintInput>,
    /// Evidence found outside the engine, such as semantic neighbours from `sqlite-vec`.
    #[serde(default)]
    pub extra_found: Vec<FoundInput>,
    #[serde(default)]
    pub scope: Option<Vec<String>>,
    #[serde(default)]
    pub dismissed: Vec<Dismissal>,
}

/// Prints keyed by SHA-256, each base64-encoded.
#[derive(Deserialize, Default)]
pub struct FingerprintInput {
    #[serde(default)]
    pub image: HashMap<String, String>,
    #[serde(default)]
    pub video: HashMap<String, String>,
    #[serde(default)]
    pub audio: HashMap<String, String>,
}

#[derive(Serialize)]
pub struct MatchResult {
    pub pairs: Vec<Pair>,
    pub groups: Vec<Group>,
}

fn decode_prints(encoded: HashMap<String, String>) -> Result<Prints, String> {
    use base64::Engine;
    encoded
        .into_iter()
        .map(|(sha256, value)| {
            base64::engine::general_purpose::STANDARD
                .decode(value)
                .map(|bytes| (sha256, bytes))
                .map_err(|error| error.to_string())
        })
        .collect()
}

/// Stage timings on stderr when `POND_CORE_TRACE` is set, for the spike's measurements.
struct Trace {
    last: Option<std::time::Instant>,
}

impl Trace {
    fn from_env() -> Self {
        Self {
            last: std::env::var_os("POND_CORE_TRACE").map(|_| std::time::Instant::now()),
        }
    }

    fn mark(&mut self, stage: &str) {
        if let Some(last) = self.last {
            eprintln!(
                "[pond core] {stage} {:.1} ms",
                last.elapsed().as_secs_f64() * 1000.0
            );
            self.last = Some(std::time::Instant::now());
        }
    }
}

/// Groups are built over the whole Library first, so a scoped scan still sees
/// the links between out-of-scope partners.
pub fn match_library(input: MatchInput) -> Result<MatchResult, String> {
    let mut trace = Trace::from_env();
    let saves = &input.saves;
    let mut found = sha256_matches(saves);
    trace.mark("sha256");
    found.extend(source_matches(saves));
    trace.mark("source");
    if let Some(prints) = input.fingerprints {
        let image = decode_prints(prints.image)?;
        let video = decode_prints(prints.video)?;
        let audio = decode_prints(prints.audio)?;
        trace.mark("decode");
        found.extend(image_matches(saves, &image));
        trace.mark("image");
        found.extend(video_matches(saves, &video));
        trace.mark("video");
        found.extend(audio_matches(saves, &audio));
        trace.mark("audio");
    }
    found.extend(input.extra_found.into_iter().map(|item| Found {
        ids: item.ids,
        save: Some(item.save),
        asset: None,
        supporting: false,
    }));

    let asset_counts: HashMap<&str, u32> = saves
        .iter()
        .map(|save| (save.id.as_str(), save.assets.len() as u32))
        .collect();
    let mut weakest: HashMap<(String, String), u8> = HashMap::default();
    for item in &input.dismissed {
        let key = order_ids(&item.ids.0, &item.ids.1);
        let rank = item.relation.rank();
        let entry = weakest.entry(key).or_insert(rank);
        *entry = (*entry).min(rank);
    }
    let mut pairs: Vec<Pair> = build_pairs(found, &asset_counts)
        .into_iter()
        .filter(|pair| {
            weakest
                .get(&order_ids(&pair.ids.0, &pair.ids.1))
                .is_none_or(|rank| pair.relation.rank() < *rank)
        })
        .collect();
    pairs.sort_by(|left, right| {
        left.relation
            .rank()
            .cmp(&right.relation.rank())
            .then_with(|| text_order(&left.ids.0, &right.ids.0))
            .then_with(|| text_order(&left.ids.1, &right.ids.1))
    });
    trace.mark("pairs");
    let groups = group_pairs(&pairs);
    trace.mark("groups");
    let Some(scope) = input.scope else {
        return Ok(MatchResult { pairs, groups });
    };

    let scope: HashSet<String> = scope.into_iter().collect();
    let scoped_groups: Vec<Group> = groups
        .into_iter()
        .filter(|group| group.ids.iter().any(|id| scope.contains(id)))
        .collect();
    let mut remap: HashMap<usize, usize> = HashMap::default();
    let mut order: Vec<usize> = Vec::new();
    for group in &scoped_groups {
        for &position in &group.pairs {
            if position >= pairs.len() || remap.contains_key(&position) {
                continue;
            }
            remap.insert(position, order.len());
            order.push(position);
        }
    }
    let mut slots: Vec<Option<Pair>> = pairs.into_iter().map(Some).collect();
    let scoped_pairs = order
        .iter()
        .filter_map(|position| slots[*position].take())
        .collect();
    let groups = scoped_groups
        .into_iter()
        .map(|group| Group {
            pairs: group
                .pairs
                .iter()
                .filter_map(|position| remap.get(position).copied())
                .collect(),
            ..group
        })
        .collect();
    Ok(MatchResult {
        pairs: scoped_pairs,
        groups,
    })
}
