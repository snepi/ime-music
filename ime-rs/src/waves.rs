//! IMe Waves pool. Genre, language, and source shape the next wave.
//! Mood and diversity are kept on the saved settings so older files still
//! load, and they no longer change the pool.
//!
//! «Не нравится» drops that recording for good, and the artists next to it.
//! «Похожее на это» is a wave that starts on one track. It is not the artist wave:
//! the artist's other songs stay out, and the genre and language filters stay on.

use crate::model::{Song, Store, Waves};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const DEEZER: &str = "https://api.deezer.com";
const POOL_CAP: usize = 80;

struct Preset {
    deezer_id: Option<u32>,
}

fn preset(genre: &str) -> Preset {
    match genre {
        "rock" => Preset { deezer_id: Some(152) },
        "pop" => Preset { deezer_id: Some(132) },
        "rap" | "ruRap" => Preset { deezer_id: Some(116) },
        "electronic" => Preset { deezer_id: Some(106) },
        "rnb" => Preset { deezer_id: Some(165) },
        "indie" => Preset { deezer_id: Some(85) },
        "metal" => Preset { deezer_id: Some(464) },
        "dance" => Preset { deezer_id: Some(113) },
        "jazz" => Preset { deezer_id: Some(129) },
        _ => Preset { deezer_id: None },
    }
}

#[derive(Clone, Debug)]
struct Candidate {
    title: String,
    artist: String,
    preview: String,
    /// Album or track genre id when the catalog sent one.
    catalog_genre: Option<u32>,
    /// Taken from this genre's chart, albums, or radio. A missing genre field does not drop these.
    from_genre_catalog: bool,
    album_id: Option<u64>,
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

/// Commit the filters the settings panel still shows. Retired mood and
/// diversity values are cleared so a hidden setting cannot keep shaping the pool.
pub fn apply_filters(waves: &mut Waves, genre: &str, language: &str, seed: &str, skip_known: &str) {
    apply_setting(waves, "genre", genre);
    apply_setting(waves, "language", language);
    apply_setting(waves, "seed", seed);
    apply_setting(waves, "mood", "any");
    apply_setting(waves, "diversity", "normal");
    apply_setting(waves, "skipKnown", skip_known);
}

fn style_filtered(genre: &str, language: &str) -> bool {
    genre != "all" || language != "any"
}

fn uses_artist_radio(genre: &str, seed: &str) -> bool {
    genre == "all" && seed != "chart"
}

/// A wave built around one artist: their own tracks, then tracks in the same lane.
/// Settings (genre, seed, mood) stay as they are. A disliked recording stays out.
/// Other songs by that artist stay, because this wave was asked for by name.
pub fn build_artist_wave(waves: &Waves, name: &str, id: Option<u64>) -> Vec<WaveTrack> {
    let Some(id) = id.or_else(|| resolve_artist(name)) else {
        return Vec::new();
    };
    let mut own = fetch_list(&format!("/artist/{id}/top?limit=25"), false);
    let mut similar = fetch_list(&format!("/artist/{id}/radio?limit=30"), false);
    if let Ok(body) = http_get(&format!("{DEEZER}/artist/{id}/related?limit=6")) {
        if let Ok(value) = serde_json::from_str::<Value>(&body) {
            if let Some(rows) = value.get("data").and_then(|data| data.as_array()) {
                for row in rows.iter().take(4) {
                    let Some(related) = row.get("id").and_then(|value| value.as_u64()) else { continue };
                    similar.extend(fetch_list(&format!("/artist/{related}/top?limit=8"), false));
                }
            }
        }
    }
    let mut seen = HashSet::new();
    let mut mapped = Vec::new();
    for item in own.drain(..).chain(similar) {
        if item.preview.is_empty() || !seen.insert(item.preview.clone()) {
            continue;
        }
        if !keep_artist_wave_track(waves, name, &item) {
            continue;
        }
        mapped.push(item);
    }
    if mapped.len() > 8 {
        let keep = 4.min(mapped.len());
        shuffle(&mut mapped[keep..], id.wrapping_mul(0x9E37));
    }
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

pub fn build_pool(store: &Store) -> Vec<WaveTrack> {
    let waves = &store.settings.waves;
    let preset = preset(&waves.genre);
    let mut raw = Vec::new();

    let filtered = style_filtered(&waves.genre, &waves.language);
    if let Some(id) = preset.deezer_id {
        raw.extend(genre_catalog(id));
    } else if waves.seed == "chart" && !filtered {
        raw.extend(fetch_list("/chart/0/tracks?limit=40", false));
    }
    // Russian titles come from real charts, then the title script. Not from the word «русский».
    if waves.genre == "all" && waves.language == "ru" {
        for id in [132_u32, 152, 116, 113] {
            raw.extend(fetch_list(&format!("/chart/{id}/tracks?limit=20"), false));
        }
    }
    // Artist radio ignores genre. Use it only when the listener did not pick a style.
    if uses_artist_radio(&waves.genre, &waves.seed) {
        for name in seed_artists(store).iter().take(6) {
            let Some(id) = resolve_artist(name) else { continue };
            raw.extend(fetch_list(&format!("/artist/{id}/radio?limit=12"), false));
        }
    }
    if raw.len() < 8 && !filtered {
        raw.extend(fetch_list("/chart/0/tracks?limit=40", false));
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
        if !matches_language(&item, &waves.language) {
            continue;
        }
        if !matches_genre(&item, &waves.genre) {
            continue;
        }
        if blocked_exact(waves, &item) || blocked_like(waves, &item) {
            continue;
        }
        mapped.push(item);
    }

    arrange(&mut mapped, &heard, waves.spin, false);
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

struct Resolved {
    artist_id: u64,
    title: String,
    artist: String,
    preview: String,
    catalog_genre: Option<u32>,
}

/// Artists and recordings that count as “like this track”.
/// Related artists come first, then whoever the radio put next to the song.
/// The track list is the recordings themselves, so those copies stay out
/// even when the artist list is already full.
pub fn tracks_like(title: &str, artist: &str) -> (Vec<String>, Vec<(String, String, String)>) {
    let mut names = Vec::new();
    push_artist(&mut names, artist);
    let Some(resolved) = resolve_track(title, artist, None) else {
        return (names, Vec::new());
    };
    if names.is_empty() {
        push_artist(&mut names, &resolved.artist);
    }
    let artist_id = if resolved.artist_id > 0 {
        resolved.artist_id
    } else {
        resolve_artist(&resolved.artist).unwrap_or(0)
    };
    if artist_id > 0 {
        if let Ok(body) = http_get(&format!("{DEEZER}/artist/{artist_id}/related?limit=8")) {
            if let Ok(value) = serde_json::from_str::<Value>(&body) {
                if let Some(rows) = value.get("data").and_then(|data| data.as_array()) {
                    for row in rows.iter().take(6) {
                        if let Some(name) = row.get("name").and_then(|value| value.as_str()) {
                            push_artist(&mut names, name);
                        }
                    }
                }
            }
        }
    }
    let mut tracks = Vec::new();
    for item in similar_of(&resolved) {
        if names.len() < 12 {
            push_artist(&mut names, &item.artist);
        }
        if tracks.len() < 40 && !item.preview.is_empty() {
            tracks.push((item.title.clone(), item.artist.clone(), item.preview.clone()));
        }
        if names.len() >= 12 && tracks.len() >= 40 {
            break;
        }
    }
    (names, tracks)
}

/// Remember a disliked Waves track. The recording never returns. `like_artists`
/// are stored with it so tracks in that neighborhood do not return either.
pub fn remember_dislike(
    waves: &mut Waves,
    title: &str,
    artist: &str,
    preview: &str,
    like_artists: &[String],
    like_tracks: &[(String, String, String)],
) -> (String, Vec<String>) {
    let title = title.trim();
    let artist = artist.trim();
    if title.is_empty() {
        return (String::new(), Vec::new());
    }
    let key = track_key(artist, title);
    let preview = preview.trim().to_string();
    let mut artists = Vec::new();
    push_artist(&mut artists, artist);
    for name in like_artists {
        push_artist(&mut artists, name);
        if artists.len() >= 12 {
            break;
        }
    }
    waves.disliked_keys.retain(|item| item != &key);
    waves.disliked_keys.push(key.clone());
    trim_front(&mut waves.disliked_keys, 400);
    if !preview.is_empty() {
        waves.disliked_previews.retain(|item| item != &preview);
        waves.disliked_previews.push(preview.clone());
    }
    for (like_title, like_artist, like_preview) in like_tracks {
        let like_key = track_key(like_artist, like_title);
        if like_key != "|" && !waves.disliked_keys.contains(&like_key) {
            waves.disliked_keys.push(like_key);
        }
        if !like_preview.is_empty() && !waves.disliked_previews.contains(like_preview) {
            waves.disliked_previews.push(like_preview.clone());
        }
    }
    trim_front(&mut waves.disliked_keys, 400);
    trim_front(&mut waves.disliked_previews, 400);
    waves.dislikes.retain(|item| item.key != key);
    waves.dislikes.push(crate::model::WaveDislike {
        key: key.clone(),
        preview,
        artist: artist_key(artist),
        like_artists: artists.clone(),
    });
    if waves.dislikes.len() > 40 {
        let extra = waves.dislikes.len() - 40;
        waves.dislikes.drain(0..extra);
    }
    (key, artists)
}

pub fn known_track_keys(store: &Store) -> HashSet<String> {
    if !store.settings.waves.skip_known {
        return HashSet::new();
    }
    store.songs.iter().map(|song| track_key(&song.artist, &song.title)).collect()
}

/// «Похожее на это»: the chosen track first, then tracks like it.
/// Genre and language filters apply to everything after the seed.
/// The seed artist’s other songs are left out — that queue is the artist wave.
pub fn build_track_wave(waves: &Waves, known: &HashSet<String>, title: &str, artist: &str, id: Option<u64>, preview: &str) -> Vec<WaveTrack> {
    let resolved = resolve_track(title, artist, id);
    let mut similar = resolved.as_ref().map(similar_of).unwrap_or_default();
    if waves.genre != "all" && !waves.genre.is_empty() {
        fill_album_genres(&mut similar);
    }
    if waves.skip_known {
        similar.retain(|item| !known.contains(&track_key(&item.artist, &item.title)));
    }
    let seed = seed_candidate(title, artist, preview, resolved.as_ref());
    finish_track_wave(seed, similar, waves)
        .into_iter()
        .take(POOL_CAP)
        .map(|item| WaveTrack {
            preview_url: item.preview,
            title: item.title,
            artist: item.artist,
        })
        .collect()
}

fn push_artist(names: &mut Vec<String>, artist: &str) {
    let key = artist_key(artist);
    if key.is_empty() || names.iter().any(|have| have == &key) {
        return;
    }
    names.push(key);
}

fn trim_front(items: &mut Vec<String>, cap: usize) {
    if items.len() > cap {
        let extra = items.len() - cap;
        items.drain(0..extra);
    }
}

fn seed_candidate(title: &str, artist: &str, preview: &str, resolved: Option<&Resolved>) -> Option<Candidate> {
    let title = resolved
        .map(|item| item.title.clone())
        .filter(|item| !item.trim().is_empty())
        .unwrap_or_else(|| title.trim().to_string());
    if title.is_empty() {
        return None;
    }
    let artist = resolved
        .map(|item| item.artist.clone())
        .filter(|item| !item.trim().is_empty())
        .unwrap_or_else(|| artist.trim().to_string());
    let from_api = resolved.map(|item| item.preview.clone()).unwrap_or_default();
    let preview = if from_api.is_empty() { preview.trim().to_string() } else { from_api };
    Some(Candidate {
        title,
        artist,
        preview,
        catalog_genre: resolved.and_then(|item| item.catalog_genre),
        from_genre_catalog: false,
            album_id: None,
    })
}

/// Similar tracks for one recording: the artist’s radio and a few related artists,
/// without that artist’s own songs.
fn similar_of(resolved: &Resolved) -> Vec<Candidate> {
    let seed_artist = artist_key(&resolved.artist);
    let seed_key = track_key(&resolved.artist, &resolved.title);
    let mut found = Vec::new();
    let artist_id = if resolved.artist_id > 0 {
        resolved.artist_id
    } else {
        resolve_artist(&resolved.artist).unwrap_or(0)
    };
    if artist_id > 0 {
        found.extend(fetch_list(&format!("/artist/{artist_id}/radio?limit=30"), false));
        if let Ok(body) = http_get(&format!("{DEEZER}/artist/{artist_id}/related?limit=6")) {
            if let Ok(value) = serde_json::from_str::<Value>(&body) {
                if let Some(rows) = value.get("data").and_then(|data| data.as_array()) {
                    for row in rows.iter().take(4) {
                        let Some(related) = row.get("id").and_then(|value| value.as_u64()) else { continue };
                        found.extend(fetch_list(&format!("/artist/{related}/top?limit=5"), false));
                    }
                }
            }
        }
    }
    found.retain(|item| artist_key(&item.artist) != seed_artist && track_key(&item.artist, &item.title) != seed_key);
    found
}

fn finish_track_wave(seed: Option<Candidate>, mut similar: Vec<Candidate>, waves: &Waves) -> Vec<Candidate> {
    let seed_artist = seed.as_ref().map(|item| artist_key(&item.artist)).unwrap_or_default();
    let seed_key = seed.as_ref().map(|item| track_key(&item.artist, &item.title)).unwrap_or_default();
    similar.retain(|item| {
        if !seed_artist.is_empty() && artist_names(&item.artist).iter().any(|name| name == &seed_artist) {
            return false;
        }
        if !seed_key.is_empty() && track_key(&item.artist, &item.title) == seed_key {
            return false;
        }
        matches_language(item, &waves.language) && matches_genre(item, &waves.genre) && !blocked_exact(waves, item) && !blocked_like(waves, item)
    });
    let heard: HashSet<String> = waves.heard.iter().cloned().collect();
    arrange(&mut similar, &heard, waves.spin, false);
    if let Some(seed) = seed {
        if !blocked_exact(waves, &seed) {
            similar.insert(0, seed);
        }
    }
    similar
}

fn keep_artist_wave_track(waves: &Waves, artist_name: &str, item: &Candidate) -> bool {
    if blocked_exact(waves, item) {
        return false;
    }
    if artist_names(&item.artist).iter().any(|name| name == &artist_key(artist_name)) {
        return true;
    }
    !blocked_like(waves, item)
}

fn blocked_exact(waves: &Waves, item: &Candidate) -> bool {
    if !item.preview.is_empty() && waves.disliked_previews.iter().any(|url| url == &item.preview) {
        return true;
    }
    let key = track_key(&item.artist, &item.title);
    waves.disliked_keys.iter().any(|saved| saved == &key)
}

fn blocked_like(waves: &Waves, item: &Candidate) -> bool {
    let names = artist_names(&item.artist);
    waves.dislikes.iter().any(|dislike| {
        names.iter().any(|name| dislike.like_artists.iter().any(|blocked| blocked == name))
    })
}

fn artist_names(artist: &str) -> Vec<String> {
    let mut names = Vec::new();
    push_artist(&mut names, artist);
    for part in split_artists(artist) {
        push_artist(&mut names, &part);
    }
    names
}

fn resolve_track(title: &str, artist: &str, id: Option<u64>) -> Option<Resolved> {
    if title.trim().is_empty() && id.is_none() {
        return None;
    }
    if let Some(id) = id {
        if let Some(found) = fetch_track(id) {
            return Some(found);
        }
    }
    if title.trim().is_empty() {
        return None;
    }
    // Deezer's fielded query (artist:"…" track:"…") comes back empty.
    // A plain search still lets us keep the result whose title and artist match.
    let query = format!("{} {}", artist.trim(), title.trim()).trim().to_string();
    let path = format!("/search/track?q={}&limit=8", urlencoding::encode(&query));
    let body = http_get(&format!("{DEEZER}{path}")).ok()?;
    let value: Value = serde_json::from_str(&body).ok()?;
    let rows = value.get("data")?.as_array()?;
    let want_title = artist_key(title);
    let want_artist = artist_key(artist);
    let mut fallback = None;
    for row in rows {
        let Some(found) = resolved_from(row) else { continue };
        let title_ok = artist_key(&found.title) == want_title;
        let artist_ok = want_artist.is_empty() || artist_names(&found.artist).iter().any(|name| name == &want_artist);
        if title_ok && artist_ok {
            return Some(found);
        }
        if fallback.is_none() && title_ok {
            fallback = Some(found);
        }
    }
    fallback
}

fn fetch_track(id: u64) -> Option<Resolved> {
    let body = http_get(&format!("{DEEZER}/track/{id}")).ok()?;
    let value: Value = serde_json::from_str(&body).ok()?;
    if value.get("error").is_some() {
        return None;
    }
    resolved_from(&value)
}

fn resolved_from(raw: &Value) -> Option<Resolved> {
    let title = raw
        .get("title")
        .or_else(|| raw.get("title_short"))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if title.is_empty() {
        return None;
    }
    let artist = raw
        .get("artist")
        .and_then(|artist| artist.get("name").and_then(|value| value.as_str()).or_else(|| artist.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();
    let artist_id = raw.get("artist").and_then(|artist| artist.get("id")).and_then(|value| value.as_u64()).unwrap_or(0);
    let preview = raw.get("preview").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    Some(Resolved {
        artist_id,
        title,
        artist,
        preview,
        catalog_genre: read_catalog_genre(raw),
    })
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

/// One genre-chart request. Radios are only a backup when that chart comes back short,
/// so Apply does not wait on extra Deezer calls when the catalog already has tracks.
fn genre_catalog(id: u32) -> Vec<Candidate> {
    let mut found = fetch_list(&format!("/chart/{id}/tracks?limit=40"), true);
    if found.len() < 12 {
        if let Ok(body) = http_get(&format!("{DEEZER}/genre/{id}/radios?limit=1")) {
            if let Ok(value) = serde_json::from_str::<Value>(&body) {
                if let Some(row) = value.get("data").and_then(|data| data.as_array()).and_then(|rows| rows.first()) {
                    if let Some(radio) = row.get("id").and_then(|value| value.as_u64()) {
                        found.extend(fetch_list(&format!("/radio/{radio}/tracks?limit=25"), true));
                    }
                }
            }
        }
    }
    for item in &mut found {
        item.from_genre_catalog = true;
        if item.catalog_genre.is_none() {
            item.catalog_genre = Some(id);
        }
    }
    found
}

fn fetch_list(path: &str, from_genre_catalog: bool) -> Vec<Candidate> {
    let url = format!("{DEEZER}{path}");
    let Ok(body) = http_get(&url) else { return Vec::new() };
    let Ok(value) = serde_json::from_str::<Value>(&body) else { return Vec::new() };
    let Some(rows) = value.get("data").and_then(|data| data.as_array()) else { return Vec::new() };
    rows.iter().filter_map(map_track).map(|mut item| {
        item.from_genre_catalog = from_genre_catalog;
        item
    }).collect()
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
    Some(Candidate {
        title,
        artist,
        preview,
        catalog_genre: read_catalog_genre(raw),
        from_genre_catalog: false,
        album_id: raw.get("album").and_then(|album| album.get("id")).and_then(|value| value.as_u64()),
    })
}

fn read_catalog_genre(raw: &Value) -> Option<u32> {
    let as_id = |value: &Value| value.as_u64().map(|id| id as u32);
    raw.get("genre_id")
        .and_then(as_id)
        .or_else(|| raw.get("album").and_then(|album| album.get("genre_id")).and_then(as_id))
        .or_else(|| {
            raw.get("album")?
                .get("genres")?
                .get("data")?
                .as_array()?
                .iter()
                .find_map(|genre| genre.get("id").and_then(as_id))
        })
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

fn title_language(title: &str) -> &'static str {
    let mut cyrillic = 0;
    let mut latin = 0;
    for ch in title.chars() {
        if ('\u{0400}'..='\u{04FF}').contains(&ch) {
            cyrillic += 1;
        } else if ch.is_ascii_alphabetic() {
            latin += 1;
        }
    }
    if cyrillic == 0 && latin == 0 {
        "other"
    } else if cyrillic > latin {
        "ru"
    } else if latin > cyrillic {
        "en"
    } else {
        "other"
    }
}

fn matches_language(track: &Candidate, language: &str) -> bool {
    match language {
        "ru" => title_language(&track.title) == "ru",
        "en" => title_language(&track.title) == "en",
        _ => true,
    }
}

/// Radio and related-artist tracks often omit genre_id. The album document has it,
/// so a chosen genre can still reject tracks that are not that genre.
fn fill_album_genres(items: &mut [Candidate]) {
    let mut ids = Vec::new();
    for item in items.iter() {
        let Some(id) = item.album_id else { continue };
        if item.catalog_genre.is_some() || ids.contains(&id) {
            continue;
        }
        ids.push(id);
        if ids.len() >= 16 {
            break;
        }
    }
    let mut found = HashMap::new();
    for id in ids {
        found.insert(id, fetch_album_genre(id));
    }
    for item in items.iter_mut() {
        if item.catalog_genre.is_some() {
            continue;
        }
        if let Some(id) = item.album_id {
            if let Some(genre) = found.get(&id).copied().flatten() {
                item.catalog_genre = Some(genre);
            }
        }
    }
}

fn fetch_album_genre(id: u64) -> Option<u32> {
    let body = http_get(&format!("{DEEZER}/album/{id}")).ok()?;
    let value: Value = serde_json::from_str(&body).ok()?;
    value.get("genre_id").and_then(|item| item.as_u64()).map(|item| item as u32).or_else(|| read_catalog_genre(&value))
}

/// Genre is the catalog id (album genre, or the genre chart/radio that supplied the track).
/// A missing genre field does not throw away a track that already came from that catalog.
/// The word in the title, album, or nickname is not a genre.
fn matches_genre(track: &Candidate, genre: &str) -> bool {
    if genre == "all" || genre.is_empty() {
        return true;
    }
    let Some(want) = preset(genre).deezer_id else {
        return true;
    };
    if let Some(got) = track.catalog_genre {
        if got != want {
            return false;
        }
    } else if !track.from_genre_catalog {
        return false;
    }
    if genre == "ruRap" && title_language(&track.title) != "ru" {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(preview: &str, artist: &str) -> Candidate {
        Candidate {
            title: preview.into(),
            artist: artist.into(),
            preview: preview.into(),
            catalog_genre: None,
            from_genre_catalog: false,
            album_id: None,
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
    fn russian_filter_drops_latin_titles() {
        let russian = Candidate {
            title: "Младшая сестра".into(),
            artist: "дора".into(),
            preview: "ru".into(),
            catalog_genre: None,
            from_genre_catalog: false,
            album_id: None,
        };
        let english = Candidate {
            title: "Creep".into(),
            artist: "Radiohead".into(),
            preview: "en".into(),
            catalog_genre: None,
            from_genre_catalog: false,
            album_id: None,
        };
        assert!(matches_language(&russian, "ru"));
        assert!(!matches_language(&english, "ru"));
        assert!(matches_language(&english, "en"));
        assert!(!matches_language(&russian, "en"));
        assert!(matches_language(&english, "any"));
    }

    #[test]
    fn language_is_the_title_not_a_word_in_the_nickname() {
        let nickname = Candidate {
            title: "Creep".into(),
            artist: "Русский".into(),
            preview: "nick".into(),
            catalog_genre: None,
            from_genre_catalog: false,
            album_id: None,
        };
        assert!(!matches_language(&nickname, "ru"));
        assert!(matches_language(&nickname, "en"));
        let mixed = Candidate {
            title: "Best русский remix".into(),
            artist: "DJ".into(),
            preview: "mix".into(),
            catalog_genre: None,
            from_genre_catalog: false,
            album_id: None,
        };
        assert_eq!(title_language(&mixed.title), "en");
        assert!(!matches_language(&mixed, "ru"));
        let russian_title = Candidate {
            title: "Русский размер".into(),
            artist: "Rockwell".into(),
            preview: "ru-title".into(),
            catalog_genre: None,
            from_genre_catalog: false,
            album_id: None,
        };
        assert!(matches_language(&russian_title, "ru"));
        assert!(!matches_language(&russian_title, "en"));
    }

    #[test]
    fn genre_does_not_match_a_word_inside_a_name() {
        let nickname = Candidate {
            title: "Somebody's Watching Me".into(),
            artist: "Rockwell".into(),
            preview: "nick".into(),
            catalog_genre: None,
            from_genre_catalog: false,
            album_id: None,
        };
        assert!(!matches_genre(&nickname, "rock"));
        let labels = [
            ("rock", "Рок"),
            ("pop", "Поп"),
            ("rap", "Рэп"),
            ("ruRap", "Русский рэп"),
            ("electronic", "Электроника"),
            ("rnb", "R&B"),
            ("indie", "Инди"),
            ("metal", "Metal"),
            ("dance", "Дэнс"),
            ("jazz", "Джаз"),
        ];
        for (genre, word) in labels {
            let titled = Candidate {
                title: word.into(),
                artist: format!("Ник {word}"),
                preview: genre.into(),
                catalog_genre: None,
                from_genre_catalog: false,
            album_id: None,
            };
            assert!(!matches_genre(&titled, genre), "{word}");
            let classified = Candidate {
                title: "Песня без ярлыка".into(),
                artist: "Кто-то".into(),
                preview: format!("chart-{genre}"),
                catalog_genre: None,
                from_genre_catalog: true,
            album_id: None,
            };
            if genre == "ruRap" {
                assert!(matches_genre(&classified, genre));
            } else {
                assert!(matches_genre(&classified, genre));
            }
        }
        let chart = Candidate {
            title: "Свобода".into(),
            artist: "Кино".into(),
            preview: "chart".into(),
            catalog_genre: None,
            from_genre_catalog: true,
            album_id: None,
        };
        assert!(matches_genre(&chart, "rock"));
        assert!(matches_language(&chart, "ru"));
        let by_id = Candidate {
            title: "Creep".into(),
            artist: "Radiohead".into(),
            preview: "by-id".into(),
            catalog_genre: Some(152),
            from_genre_catalog: false,
            album_id: None,
        };
        assert!(matches_genre(&by_id, "rock"));
        assert!(!matches_genre(&by_id, "pop"));
        let english_rap = Candidate {
            title: "Creep".into(),
            artist: "Radiohead".into(),
            preview: "en-rap".into(),
            catalog_genre: Some(116),
            from_genre_catalog: true,
            album_id: None,
        };
        assert!(matches_genre(&english_rap, "rap"));
        assert!(!matches_genre(&english_rap, "ruRap"));
    }

    #[test]
    fn skip_library_is_the_same_recording() {
        let owned = track_key("Rockwell", "Somebody's Watching Me");
        assert_ne!(owned, track_key("Rock", "Somebody's Watching Me"));
        assert_ne!(owned, track_key("Rockwell", "Rock"));
        assert_ne!(track_key("Наутилус", "Русский рок"), track_key("Другой", "Рок"));
        assert_eq!(track_key("дора", "Младшая сестра"), track_key("Дора", "Младшая  сестра"));
        assert_ne!(artist_key("Rock"), artist_key("Rockwell"));
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

    #[test]
    fn apply_filters_keeps_only_the_remaining_controls() {
        let mut waves = Waves::default();
        waves.mood = "chill".into();
        waves.diversity = "high".into();
        apply_filters(&mut waves, "jazz", "ru", "chart", "0");
        assert_eq!(waves.genre, "jazz");
        assert_eq!(waves.language, "ru");
        assert_eq!(waves.seed, "chart");
        assert!(!waves.skip_known);
        assert_eq!(waves.mood, "any");
        assert_eq!(waves.diversity, "normal");
        assert!(!apply_setting(&mut waves, "seed", "polka"));
        assert_eq!(waves.seed, "chart");
    }

    #[test]
    fn filters_do_not_search_for_their_own_labels() {
        for genre in ["rock", "pop", "rap", "ruRap", "electronic", "rnb", "indie", "metal", "dance", "jazz"] {
            assert!(preset(genre).deezer_id.is_some());
        }
        assert!(uses_artist_radio("all", "taste"));
        assert!(!uses_artist_radio("all", "chart"));
        assert!(!uses_artist_radio("rock", "chart"));
        assert!(!uses_artist_radio("jazz", "liked"));
    }

    #[test]
    fn source_changes_the_next_wave_plan() {
        assert!(uses_artist_radio("all", "taste"));
        assert!(uses_artist_radio("all", "liked"));
        assert!(uses_artist_radio("all", "wishlist"));
        assert!(!uses_artist_radio("all", "chart"));
        assert!(!uses_artist_radio("jazz", "liked"));
        assert!(style_filtered("jazz", "any"));
        assert!(style_filtered("all", "ru"));
        assert!(!style_filtered("all", "any"));
    }

    fn classified(title: &str, artist: &str, preview: &str, genre: Option<u32>) -> Candidate {
        Candidate {
            title: title.into(),
            artist: artist.into(),
            preview: preview.into(),
            catalog_genre: genre,
            from_genre_catalog: genre.is_some(),
            album_id: None,
        }
    }

    #[test]
    fn dislike_drops_that_track_and_tracks_like_it() {
        let mut waves = Waves::default();
        let (key, artists) = remember_dislike(
            &mut waves,
            "Creep",
            "Radiohead",
            "http://preview/creep",
            &["Radiohead".into(), "Muse".into(), "Jeff Buckley".into()],
            &[],
        );
        assert_eq!(key, track_key("Radiohead", "Creep"));
        assert!(artists.iter().any(|name| name == "radiohead"));
        assert!(artists.iter().any(|name| name == "muse"));
        let creep = classified("Creep", "Radiohead", "http://preview/creep", Some(152));
        let other = classified("Karma Police", "Radiohead", "http://preview/karma", Some(152));
        let featured = classified("Map of the Problematique", "Muse feat. Someone", "http://preview/muse", Some(152));
        let elsewhere = classified("Yellow", "Coldplay", "http://preview/yellow", Some(132));
        let same_file = classified("Creep (Remaster)", "Someone", "http://preview/creep", None);
        assert!(blocked_exact(&waves, &creep));
        assert!(blocked_like(&waves, &other));
        assert!(blocked_like(&waves, &featured));
        assert!(!blocked_exact(&waves, &elsewhere));
        assert!(!blocked_like(&waves, &elsewhere));
        assert!(blocked_exact(&waves, &same_file));
        assert!(keep_artist_wave_track(&waves, "Radiohead", &other));
        assert!(!keep_artist_wave_track(&waves, "Radiohead", &creep));
        assert!(!keep_artist_wave_track(&waves, "Radiohead", &featured));
    }

    #[test]
    fn track_wave_starts_at_the_seed_and_keeps_genre_and_language() {
        let mut waves = Waves::default();
        waves.genre = "rock".into();
        waves.language = "en".into();
        let seed = classified("Группа крови", "Кино", "seed", Some(152));
        let rock = classified("Starlight", "Muse", "rock", Some(152));
        let same_artist = classified("Звезда по имени Солнце", "Кино", "own", Some(152));
        let pop = classified("Yellow", "Coldplay", "pop", Some(132));
        let russian = classified("Свобода", "Другой", "ru", Some(152));
        let queued = finish_track_wave(
            Some(seed),
            vec![pop, same_artist, russian, rock],
            &waves,
        );
        assert_eq!(queued[0].preview, "seed");
        assert_eq!(queued.iter().filter(|item| item.preview == "rock").count(), 1);
        assert!(queued.iter().all(|item| item.preview != "pop" && item.preview != "ru" && item.preview != "own"));
    }

    #[test]
    fn a_disliked_recording_does_not_open_the_next_track_wave() {
        let mut waves = Waves::default();
        remember_dislike(&mut waves, "Creep", "Radiohead", "seed", &[], &[]);
        let seed = classified("Creep", "Radiohead", "seed", Some(152));
        let other = classified("Yellow", "Coldplay", "other", None);
        let queued = finish_track_wave(Some(seed), vec![other], &waves);
        assert!(queued.iter().all(|item| item.preview != "seed"));
        assert_eq!(queued.first().map(|item| item.preview.as_str()), Some("other"));
    }
}
