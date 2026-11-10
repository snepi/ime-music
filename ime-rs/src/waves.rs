//! IMe Waves pool. Matches the Electron radio: genre, language, mood, seed,
//! and diversity, then a new shuffle on every session.

use crate::model::{Song, Store, Waves};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const DEEZER: &str = "https://api.deezer.com";
const POOL_CAP: usize = 80;

struct Preset {
    deezer_id: Option<u32>,
    queries: &'static [&'static str],
}

fn preset(genre: &str) -> Preset {
    match genre {
        "rock" => Preset { deezer_id: Some(152), queries: &["rock"] },
        "pop" => Preset { deezer_id: Some(132), queries: &["pop"] },
        "rap" => Preset { deezer_id: Some(116), queries: &["rap", "hip hop"] },
        "ruRap" => Preset {
            deezer_id: Some(116),
            queries: &["русский рэп", "russian rap", "hip-hop russia"],
        },
        "electronic" => Preset { deezer_id: Some(106), queries: &["electronic", "edm"] },
        "rnb" => Preset { deezer_id: Some(165), queries: &["r&b", "soul"] },
        "indie" => Preset { deezer_id: Some(85), queries: &["indie", "alternative"] },
        "metal" => Preset { deezer_id: Some(464), queries: &["metal"] },
        "dance" => Preset { deezer_id: Some(113), queries: &["dance", "house"] },
        "jazz" => Preset { deezer_id: Some(129), queries: &["jazz"] },
        _ => Preset { deezer_id: None, queries: &[] },
    }
}

#[derive(Clone, Debug)]
struct Candidate {
    title: String,
    artist: String,
    album: String,
    preview: String,
}

#[derive(Serialize)]
pub struct WaveTrack {
    #[serde(rename = "previewUrl")]
    pub preview_url: String,
    pub title: String,
    pub artist: String,
}

pub fn apply_setting(waves: &mut Waves, field: &str, value: &str) -> bool {
    match field {
        "genre" => {
            if preset(value).deezer_id.is_some() || value == "all" {
                waves.genre = value.into();
                return true;
            }
        }
        "language" => {
            if matches!(value, "any" | "ru" | "en") {
                waves.language = value.into();
                return true;
            }
        }
        "mood" => {
            if matches!(value, "any" | "energetic" | "chill" | "dark" | "happy") {
                waves.mood = value.into();
                return true;
            }
        }
        "seed" => {
            if matches!(value, "taste" | "chart" | "liked" | "wishlist") {
                waves.seed = value.into();
                return true;
            }
        }
        "diversity" => {
            if matches!(value, "normal" | "high") {
                waves.diversity = value.into();
                return true;
            }
        }
        "skipKnown" => {
            waves.skip_known = value == "1" || value == "true" || value == "on";
            return true;
        }
        _ => {}
    }
    false
}

pub fn build_pool(store: &Store) -> Vec<WaveTrack> {
    let waves = &store.settings.waves;
    let preset = preset(&waves.genre);
    let mut raw = Vec::new();

    if let Some(id) = preset.deezer_id {
        raw.extend(fetch_list(&format!("/chart/{id}/tracks?limit=60")));
    } else if waves.seed == "chart" {
        raw.extend(fetch_list("/chart/0/tracks?limit=60"));
    }
    for query in preset.queries.iter().take(3) {
        let path = format!("/search/track?q={}&limit=35", urlencoding::encode(query));
        raw.extend(fetch_list(&path));
    }

    let seed_names = seed_artists(store);
    for name in seed_names.iter().take(6) {
        let Some(id) = resolve_artist(name) else { continue };
        raw.extend(fetch_list(&format!("/artist/{id}/radio?limit=20")));
    }
    if raw.len() < 20 {
        raw.extend(fetch_list("/chart/0/tracks?limit=80"));
    }

    let known = if waves.skip_known {
        store
            .songs
            .iter()
            .map(|song| track_key(&song.artist, &song.title))
            .collect::<HashSet<_>>()
    } else {
        HashSet::new()
    };
    let heard = waves.heard.iter().cloned().collect::<HashSet<_>>();
    let mut mapped = Vec::new();
    let mut seen = HashSet::new();
    for item in raw {
        let key = track_key(&item.artist, &item.title);
        if item.preview.is_empty() || !seen.insert(item.preview.clone()) || !seen.insert(key.clone()) {
            continue;
        }
        if waves.skip_known && known.contains(&key) {
            continue;
        }
        if !matches_language(&item, &waves.language) || !matches_mood(&item, &waves.mood) {
            continue;
        }
        if !matches_genre(&item, &waves.genre) {
            continue;
        }
        mapped.push(item);
    }

    arrange(&mut mapped, &heard, waves.spin, waves.diversity == "high");
    mapped
        .into_iter()
        .take(POOL_CAP)
        .map(|item| WaveTrack {
            preview_url: item.preview,
            title: item.title,
            artist: item.artist,
        })
        .collect()
}

fn seed_artists(store: &Store) -> Vec<String> {
    let waves = &store.settings.waves;
    if waves.seed == "wishlist" {
        let mut names = Vec::new();
        for wish in store.settings.wishlist.iter().take(8) {
            if !wish.artist.trim().is_empty() {
                names.push(wish.artist.clone());
            }
        }
        return names;
    }
    let liked_only = waves.seed == "liked";
    let limit = if waves.seed == "chart" { 6 } else { 10 };
    pick_seed_artists(&store.songs, liked_only, limit)
}

fn pick_seed_artists(songs: &[Song], liked_only: bool, limit: usize) -> Vec<String> {
    let mut counts: HashMap<String, (String, f32)> = HashMap::new();
    for song in songs {
        if liked_only && !song.liked {
            continue;
        }
        for name in split_artists(&song.artist).into_iter().take(2) {
            let key = artist_key(&name);
            if key.is_empty() {
                continue;
            }
            let entry = counts.entry(key).or_insert_with(|| (name, 0.0));
            entry.1 += if song.liked { 3.0 } else { 1.0 } + (song.play_count.min(5) as f32) * 0.2;
        }
    }
    let mut ranked: Vec<(String, f32)> = counts.into_values().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    ranked.into_iter().take(limit).map(|(name, _)| name).collect()
}

fn arrange(items: &mut Vec<Candidate>, heard: &HashSet<String>, spin: u64, high_diversity: bool) {
    shuffle(items, spin);
    items.sort_by_key(|item| heard.contains(&item.preview));
    let max_per_artist = if high_diversity { 2 } else { 4 };
    let mut counts: HashMap<String, usize> = HashMap::new();
    items.retain(|item| {
        let key = artist_key(&item.artist);
        let count = counts.entry(key).or_insert(0);
        if *count >= max_per_artist {
            return false;
        }
        *count += 1;
        true
    });
}

fn shuffle(items: &mut [Candidate], seed: u64) {
    let mut state = seed ^ 0xA076_1D64_78BD_642F;
    if state == 0 {
        state = 0x9E37_79B9_7F4A_7C15;
    }
    for i in (1..items.len()).rev() {
        state = state.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(1);
        let j = (mix(state) as usize) % (i + 1);
        items.swap(i, j);
    }
}

fn mix(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

fn fetch_list(path: &str) -> Vec<Candidate> {
    let url = format!("{DEEZER}{path}");
    let Ok(body) = http_get(&url) else { return Vec::new() };
    let Ok(value) = serde_json::from_str::<Value>(&body) else { return Vec::new() };
    let Some(rows) = value.get("data").and_then(|data| data.as_array()) else { return Vec::new() };
    rows.iter().filter_map(map_track).collect()
}

fn resolve_artist(name: &str) -> Option<u64> {
    let path = format!("/search/artist?q={}&limit=1", urlencoding::encode(name));
    let body = http_get(&format!("{DEEZER}{path}")).ok()?;
    let value: Value = serde_json::from_str(&body).ok()?;
    value.get("data")?.get(0)?.get("id")?.as_u64()
}

fn http_get(url: &str) -> Result<String, String> {
    ureq::get(url)
        .timeout(Duration::from_secs(8))
        .call()
        .map_err(|err| err.to_string())?
        .into_string()
        .map_err(|err| err.to_string())
}

fn map_track(raw: &Value) -> Option<Candidate> {
    let preview = raw.get("preview").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if preview.is_empty() {
        return None;
    }
    let title = raw
        .get("title")
        .or_else(|| raw.get("title_short"))
        .and_then(|v| v.as_str())
        .unwrap_or("Track")
        .trim()
        .to_string();
    let artist = raw
        .get("artist")
        .and_then(|artist| artist.get("name").and_then(|v| v.as_str()).or_else(|| artist.as_str()))
        .unwrap_or("Unknown")
        .trim()
        .to_string();
    let album = raw
        .get("album")
        .and_then(|album| album.get("title").and_then(|v| v.as_str()).or_else(|| album.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();
    Some(Candidate { title, artist, album, preview })
}

fn artist_key(name: &str) -> String {
    name.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ")
}

fn track_key(artist: &str, title: &str) -> String {
    format!("{}|{}", artist_key(artist), artist_key(title))
}

fn split_artists(name: &str) -> Vec<String> {
    let mut text = name.to_string();
    for token in [" feat. ", " feat ", " Feat. ", " Feat ", " & "] {
        text = text.replace(token, ",");
    }
    text.split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .take(2)
        .map(ToString::to_string)
        .collect()
}

fn has_cyrillic(text: &str) -> bool {
    text.chars().any(|ch| ('\u{0400}'..='\u{04FF}').contains(&ch))
}

fn detect_language(track: &Candidate) -> &'static str {
    let blob = format!("{} {} {}", track.title, track.artist, track.album);
    if has_cyrillic(&blob) {
        "ru"
    } else if blob.chars().any(|ch| ch.is_ascii_alphabetic()) {
        "en"
    } else {
        "other"
    }
}

fn matches_language(track: &Candidate, language: &str) -> bool {
    match language {
        "ru" => detect_language(track) == "ru",
        "en" => detect_language(track) == "en",
        _ => true,
    }
}

fn matches_mood(track: &Candidate, mood: &str) -> bool {
    let blob = format!("{} {} {}", track.title, track.album, track.artist).to_lowercase();
    let patterns: &[&str] = match mood {
        "energetic" => &["energy", "power", "fire", "party", "club", "энерг", "огонь", "клуб"],
        "chill" => &["chill", "lofi", "lo-fi", "ambient", "calm", "relax", "чил", "спокой"],
        "dark" => &["dark", "night", "shadow", "doom", "sad", "тёмн", "темн", "ночь", "груст"],
        "happy" => &["happy", "joy", "love", "summer", "sun", "счаст", "любов", "лето", "радост"],
        _ => return true,
    };
    patterns.iter().any(|pattern| blob.contains(pattern))
}

fn matches_genre(track: &Candidate, genre: &str) -> bool {
    if genre != "ruRap" {
        return true;
    }
    let blob = format!("{} {} {}", track.title, track.artist, track.album).to_lowercase();
    detect_language(track) == "ru" || blob.contains("рэп") || blob.contains("rap") || blob.contains("hip")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(preview: &str, artist: &str) -> Candidate {
        Candidate {
            title: preview.into(),
            artist: artist.into(),
            album: String::new(),
            preview: preview.into(),
        }
    }

    #[test]
    fn different_spins_change_the_queue_order() {
        let source: Vec<_> = (0..8).map(|n| track(&n.to_string(), &format!("artist-{n}"))).collect();
        let mut orders = Vec::new();
        for spin in 1..6 {
            let mut items = source.clone();
            arrange(&mut items, &HashSet::new(), spin, false);
            orders.push(items.into_iter().map(|item| item.preview).collect::<Vec<_>>());
        }
        assert!(orders.iter().any(|order| order != &orders[0]));
        for order in &orders {
            let mut sorted = order.clone();
            sorted.sort();
            let mut expected: Vec<_> = (0..8).map(|n| n.to_string()).collect();
            expected.sort();
            assert_eq!(sorted, expected);
        }
    }

    #[test]
    fn heard_tracks_from_the_previous_session_play_after_fresh_ones() {
        let mut items = vec![track("old", "a"), track("fresh", "b"), track("also", "c")];
        let heard = HashSet::from(["old".to_string()]);
        arrange(&mut items, &heard, 3, false);
        let old_at = items.iter().position(|item| item.preview == "old").unwrap();
        assert!(items[..old_at].iter().all(|item| item.preview != "old"));
        assert_eq!(items.last().unwrap().preview, "old");
    }

    #[test]
    fn settings_reject_unknown_values() {
        let mut waves = Waves::default();
        assert!(apply_setting(&mut waves, "genre", "jazz"));
        assert_eq!(waves.genre, "jazz");
        assert!(!apply_setting(&mut waves, "genre", "polka"));
        assert_eq!(waves.genre, "jazz");
        assert!(apply_setting(&mut waves, "skipKnown", "0"));
        assert!(!waves.skip_known);
    }
}
