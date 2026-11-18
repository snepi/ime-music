//! IMe Waves pool. Genre, language, and source shape the next wave.
//! Mood and diversity are kept on the saved settings so older files still
//! load, and they no longer change the pool.

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
            queries: &["рэп", "hip hop"],
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
    /// Came from that genre's Deezer chart, so the genre is Deezer's, not a word in the name.
    from_genre_chart: bool,
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
/// Settings (genre, seed, mood) stay as they are.
pub fn build_artist_wave(name: &str, id: Option<u64>) -> Vec<WaveTrack> {
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
        raw.extend(fetch_list(&format!("/chart/{id}/tracks?limit=40"), true));
    } else if waves.seed == "chart" && !filtered {
        raw.extend(fetch_list("/chart/0/tracks?limit=40", false));
    }
    for query in wave_queries(&waves.genre, &waves.language) {
        let path = format!("/search/track?q={}&limit=25", urlencoding::encode(&query));
        raw.extend(fetch_list(&path, false));
    }
    // A Russian filter needs Russian titles, not the word «русский».
    // Genre charts supply them; the title script decides the language.
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

fn fetch_list(path: &str, from_genre_chart: bool) -> Vec<Candidate> {
    let url = format!("{DEEZER}{path}");
    let Ok(body) = http_get(&url) else { return Vec::new() };
    let Ok(value) = serde_json::from_str::<Value>(&body) else { return Vec::new() };
    let Some(rows) = value.get("data").and_then(|data| data.as_array()) else { return Vec::new() };
    rows.iter().filter_map(map_track).map(|mut item| {
        item.from_genre_chart = from_genre_chart;
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
    let album = raw
        .get("album")
        .and_then(|album| album.get("title").and_then(|v| v.as_str()).or_else(|| album.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();
    Some(Candidate { title, artist, album, preview, from_genre_chart: false })
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

fn wave_queries(genre: &str, language: &str) -> Vec<String> {
    let preset = preset(genre);
    let mut queries: Vec<String> = preset.queries.iter().map(|query| (*query).to_string()).collect();
    if queries.is_empty() {
        queries.push("music".into());
    }
    if language == "ru" {
        if let Some(cyrillic) = cyrillic_genre(genre) {
            if !queries.iter().any(|query| query == cyrillic) {
                queries.push(cyrillic.to_string());
            }
        }
    }
    queries.into_iter().take(4).collect()
}

fn cyrillic_genre(genre: &str) -> Option<&'static str> {
    match genre {
        "rock" => Some("рок"),
        "pop" => Some("поп"),
        "rap" | "ruRap" => Some("рэп"),
        "electronic" => Some("электроника"),
        "rnb" => Some("рнб"),
        "indie" => Some("инди"),
        "metal" => Some("метал"),
        "dance" => Some("дэнс"),
        "jazz" => Some("джаз"),
        _ => None,
    }
}

fn matches_language(track: &Candidate, language: &str) -> bool {
    match language {
        "ru" => title_language(&track.title) == "ru",
        "en" => title_language(&track.title) == "en",
        _ => true,
    }
}

fn words(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() || ch == '&' {
            current.extend(ch.to_lowercase());
        } else if !current.is_empty() {
            out.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn has_phrase(text: &str, phrase: &str) -> bool {
    let haystack = words(text);
    let needle = words(phrase);
    if needle.is_empty() || haystack.len() < needle.len() {
        return false;
    }
    haystack.windows(needle.len()).any(|window| window == needle.as_slice())
}

fn genre_phrases(genre: &str) -> &'static [&'static str] {
    match genre {
        "rock" => &["rock", "рок"],
        "pop" => &["pop", "поп"],
        "rap" | "ruRap" => &["rap", "рэп", "hip hop", "хип-хоп", "хип хоп"],
        "electronic" => &["electronic", "edm", "электроника", "электро"],
        "rnb" => &["r&b", "rnb", "рнб"],
        "indie" => &["indie", "инди"],
        "metal" => &["metal", "метал"],
        "dance" => &["dance", "дэнс"],
        "jazz" => &["jazz", "джаз"],
        _ => &[],
    }
}

fn matches_genre(track: &Candidate, genre: &str) -> bool {
    if genre == "all" || genre.is_empty() {
        return true;
    }
    if genre == "ruRap" && title_language(&track.title) != "ru" {
        return false;
    }
    if track.from_genre_chart {
        return true;
    }
    let text = format!("{} {}", track.title, track.album);
    genre_phrases(genre).iter().any(|phrase| has_phrase(&text, phrase))
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
            from_genre_chart: false,
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
            album: String::new(),
            preview: "ru".into(),
            from_genre_chart: false,
        };
        let english = Candidate {
            title: "Creep".into(),
            artist: "Radiohead".into(),
            album: String::new(),
            preview: "en".into(),
            from_genre_chart: false,
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
            album: "Best Of".into(),
            preview: "nick".into(),
            from_genre_chart: false,
        };
        assert!(!matches_language(&nickname, "ru"));
        assert!(matches_language(&nickname, "en"));
        let mixed = Candidate {
            title: "Best русский remix".into(),
            artist: "DJ".into(),
            album: String::new(),
            preview: "mix".into(),
            from_genre_chart: false,
        };
        assert_eq!(title_language(&mixed.title), "en");
        assert!(!matches_language(&mixed, "ru"));
        let russian_title = Candidate {
            title: "Русский размер".into(),
            artist: "Rockwell".into(),
            album: String::new(),
            preview: "ru-title".into(),
            from_genre_chart: false,
        };
        assert!(matches_language(&russian_title, "ru"));
        assert!(!matches_language(&russian_title, "en"));
    }

    #[test]
    fn genre_does_not_match_a_word_inside_a_name() {
        let nickname = Candidate {
            title: "Somebody's Watching Me".into(),
            artist: "Rockwell".into(),
            album: String::new(),
            preview: "nick".into(),
            from_genre_chart: false,
        };
        assert!(!matches_genre(&nickname, "rock"));
        let inside = Candidate {
            title: "Therapy".into(),
            artist: "Rap".into(),
            album: "Trap".into(),
            preview: "inside".into(),
            from_genre_chart: false,
        };
        assert!(!matches_genre(&inside, "rap"));
        let titled = Candidate {
            title: "Ночной джаз".into(),
            artist: "Кто-то".into(),
            album: String::new(),
            preview: "jazz".into(),
            from_genre_chart: false,
        };
        assert!(matches_genre(&titled, "jazz"));
        assert!(!matches_genre(&titled, "rock"));
        let chart = Candidate {
            title: "Свобода".into(),
            artist: "Кино".into(),
            album: String::new(),
            preview: "chart".into(),
            from_genre_chart: true,
        };
        assert!(matches_genre(&chart, "rock"));
        assert!(matches_language(&chart, "ru"));
        let english_rap = Candidate {
            title: "Creep".into(),
            artist: "Radiohead".into(),
            album: String::new(),
            preview: "en-rap".into(),
            from_genre_chart: true,
        };
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
    fn queries_follow_genre_and_language() {
        let jazz = wave_queries("jazz", "any");
        assert!(jazz.iter().any(|query| query == "jazz"));
        assert!(jazz.iter().all(|query| !query.contains("русский") && !query.contains("english")));
        let russian = wave_queries("jazz", "ru");
        assert!(russian.iter().any(|query| query == "jazz"));
        assert!(russian.iter().any(|query| query == "джаз"));
        assert!(russian.iter().all(|query| !query.split_whitespace().any(|word| word == "русский")));
        let english = wave_queries("rock", "en");
        assert!(english.iter().all(|query| query == "rock"));
        assert_ne!(wave_queries("all", "any"), wave_queries("pop", "any"));
        assert_eq!(wave_queries("all", "ru"), wave_queries("all", "en"));
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
}
