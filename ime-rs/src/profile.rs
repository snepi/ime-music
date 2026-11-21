//! Local music profile. Events stay on this computer. Scores use listens,
//! favorites and dislikes that already happened. Genre and language come from
//! tags. A trait that was not measured is left out.

use crate::i18n::esc;
use crate::model::{Store, Taste, TasteItem};
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
use std::path::Path;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

pub struct Db {
    conn: Connection,
}

#[derive(Clone, Debug)]
pub struct Listen {
    pub at_ms: i64,
    pub listen_id: String,
    pub kind: String,
    #[allow(dead_code)]
    pub source: String,
    #[allow(dead_code)]
    pub song_id: String,
    pub title: String,
    pub artist: String,
    pub genre: String,
    pub language: String,
    pub bpm: Option<f32>,
    pub energy: Option<f32>,
    pub heard_s: f64,
    pub fraction: f64,
    pub background: bool,
}

#[derive(Clone, Debug)]
pub struct NewEvent {
    pub at_ms: i64,
    pub listen_id: String,
    pub kind: String,
    pub source: String,
    pub song_id: String,
    pub title: String,
    pub artist: String,
    pub heard_s: f64,
    pub duration_s: f64,
    pub fraction: f64,
}

struct Section {
    title: &'static str,
    empty: &'static str,
    rows: Vec<Row>,
    catalog_artist: String,
    catalog_reason: String,
}

struct Row {
    song_id: String,
    title: String,
    artist: String,
    reason: String,
    tags: String,
}

impl Db {
    pub fn open(path: &Path) -> Self {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(path).unwrap_or_else(|_| Connection::open_in_memory().expect("sqlite"));
        let db = Self { conn };
        db.migrate();
        db
    }

    fn migrate(&self) {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS events (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               at_ms INTEGER NOT NULL,
               listen_id TEXT NOT NULL DEFAULT '',
               kind TEXT NOT NULL,
               source TEXT NOT NULL DEFAULT '',
               song_id TEXT NOT NULL DEFAULT '',
               title TEXT NOT NULL DEFAULT '',
               artist TEXT NOT NULL DEFAULT '',
               genre TEXT NOT NULL DEFAULT '',
               language TEXT NOT NULL DEFAULT '',
               bpm REAL,
               energy REAL,
               heard_s REAL NOT NULL DEFAULT 0,
               duration_s REAL NOT NULL DEFAULT 0,
               fraction REAL NOT NULL DEFAULT 0
             );
             CREATE INDEX IF NOT EXISTS events_at ON events(at_ms);
             CREATE TABLE IF NOT EXISTS reports (
               month TEXT PRIMARY KEY,
               created_at INTEGER NOT NULL,
               body TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS snapshots (
               day TEXT PRIMARY KEY,
               body TEXT NOT NULL
             );",
        ).ok();
        let version: i64 = self.meta("schema").parse().unwrap_or(0);
        if version < 1 {
            self.set_meta("schema", "1");
        }
    }

    fn meta(&self, key: &str) -> String {
        self.conn
            .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| row.get(0))
            .unwrap_or_default()
    }

    fn set_meta(&self, key: &str, value: &str) {
        let _ = self.conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        );
    }

    pub fn bump_spin(&self) {
        let next = self.meta("spin").parse::<u64>().unwrap_or(0).wrapping_add(1);
        self.set_meta("spin", &next.to_string());
    }

    pub fn record(&self, event: &NewEvent, store: &Store) {
        let song = store.song(&event.song_id).or_else(|| {
            store.songs.iter().find(|song| same_name(&song.title, &event.title) && same_name(&song.artist, &event.artist))
        });
        let title_for_script = song.map(|song| song.title.clone()).filter(|title| !title.is_empty()).unwrap_or_else(|| event.title.clone());
        let language = crate::model::script_language(&title_for_script);
        let genre = song.map(|song| song.genre.clone()).filter(|genre| !genre.is_empty()).unwrap_or_default();
        let bpm: Option<f32> = None;
        let energy: Option<f32> = None;
        let at = if event.at_ms > 0 { event.at_ms } else { now_ms() };
        let _ = self.conn.execute(
            "INSERT INTO events (at_ms, listen_id, kind, source, song_id, title, artist, genre, language, bpm, energy, heard_s, duration_s, fraction)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                at,
                event.listen_id,
                event.kind,
                event.source,
                event.song_id,
                event.title,
                event.artist,
                genre,
                language,
                bpm,
                energy,
                event.heard_s.max(0.0),
                event.duration_s.max(0.0),
                event.fraction.clamp(0.0, 1.0),
            ],
        );
    }

    /// One-time import of the history and wave dislikes that already exist.
    pub fn migrate_legacy(&self, store: &Store) {
        if self.meta("legacy_v1") == "1" {
            return;
        }
        for item in &store.history {
            let Some(song) = store.song(&item.song_id) else { continue };
            let event = NewEvent {
                at_ms: item.played_at,
                listen_id: format!("legacy-{}", item.id),
                kind: "start".into(),
                source: "library".into(),
                song_id: song.id.clone(),
                title: song.title.clone(),
                artist: song.artist.clone(),
                heard_s: 0.0,
                duration_s: song.duration,
                fraction: 0.0,
            };
            self.record(&event, store);
        }
        for dislike in &store.settings.waves.dislikes {
            let event = NewEvent {
                at_ms: now_ms(),
                listen_id: String::new(),
                kind: "dislike".into(),
                source: "waves".into(),
                song_id: String::new(),
                title: String::new(),
                artist: dislike.artist.clone(),
                heard_s: 0.0,
                duration_s: 0.0,
                fraction: 0.0,
            };
            self.record(&event, store);
        }
        self.set_meta("legacy_v1", "1");
    }

    fn events(&self) -> Vec<Listen> {
        let mut stmt = match self.conn.prepare(
            "SELECT at_ms, listen_id, kind, source, song_id, title, artist, genre, language, bpm, energy, heard_s, fraction
             FROM events ORDER BY at_ms ASC LIMIT 20000",
        ) {
            Ok(stmt) => stmt,
            Err(_) => return Vec::new(),
        };
        let rows = stmt.query_map([], |row| {
            Ok(Listen {
                at_ms: row.get(0)?,
                listen_id: row.get(1)?,
                kind: row.get(2)?,
                source: row.get(3)?,
                song_id: row.get(4)?,
                title: row.get(5)?,
                artist: row.get(6)?,
                genre: row.get(7)?,
                language: row.get(8)?,
                bpm: row.get(9)?,
                energy: row.get(10)?,
                heard_s: row.get(11)?,
                fraction: row.get(12)?,
                background: false,
            })
        });
        rows.ok().map(|iter| iter.filter_map(|row| row.ok()).collect()).unwrap_or_default()
    }

    pub fn fill(&self, store: &mut Store, section: Option<&str>) {
        self.migrate_legacy(store);
        let mut events = collapse(self.events());
        mark_background(&mut events);
        let spin = self.meta("spin").parse::<u64>().unwrap_or(0);
        store.taste = taste_from(&events, store, spin, now_ms());
        store.profile_seed = seed_json(&store.taste);
        self.remember_snapshot(&store.taste);
        if let Some(section) = section {
            self.ensure_reports(&events);
            let reports = self.reports();
            store.profile_page = page(store, &events, section, &reports);
        }
    }

    fn remember_snapshot(&self, taste: &Taste) {
        if !taste.ready {
            return;
        }
        let day = day_key(now_ms());
        if self.meta(&format!("snap-{day}")) == "1" {
            return;
        }
        let body = serde_json::json!({
            "genres": taste.long_genres.iter().take(6).map(|item| &item.label).collect::<Vec<_>>(),
            "artists": taste.long_artists.iter().take(6).map(|item| &item.label).collect::<Vec<_>>(),
            "current": taste.current_genres.iter().take(3).map(|item| &item.label).collect::<Vec<_>>(),
        });
        let _ = self.conn.execute(
            "INSERT INTO snapshots (day, body) VALUES (?1, ?2) ON CONFLICT(day) DO NOTHING",
            params![day, body.to_string()],
        );
        self.set_meta(&format!("snap-{day}"), "1");
    }

    fn ensure_reports(&self, events: &[Listen]) {
        let now = now_ms();
        let mut months = HashSet::new();
        for event in events {
            months.insert(month_key(event.at_ms));
        }
        let current = month_key(now);
        for month in months {
            if month >= current || self.report_exists(&month) {
                continue;
            }
            let body = report_body(events, &month);
            let _ = self.conn.execute(
                "INSERT INTO reports (month, created_at, body) VALUES (?1, ?2, ?3)",
                params![month, now, body.to_string()],
            );
        }
    }

    fn report_exists(&self, month: &str) -> bool {
        self.conn
            .query_row("SELECT 1 FROM reports WHERE month = ?1", [month], |_| Ok(()))
            .is_ok()
    }

    fn reports(&self) -> Vec<(String, String)> {
        let mut stmt = match self.conn.prepare("SELECT month, body FROM reports ORDER BY month DESC") {
            Ok(stmt) => stmt,
            Err(_) => return Vec::new(),
        };
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .ok()
            .map(|rows| rows.filter_map(|row| row.ok()).collect())
            .unwrap_or_default()
    }
}

pub fn fill(db: &Db, store: &mut Store, section: Option<&str>) {
    db.fill(store, section);
}

fn collapse(items: Vec<Listen>) -> Vec<Listen> {
    let mut grouped: HashMap<String, Vec<Listen>> = HashMap::new();
    let mut solo = Vec::new();
    for item in items {
        if item.listen_id.is_empty() || matches!(item.kind.as_str(), "dislike" | "favorite_add" | "favorite_remove") {
            solo.push(item);
        } else {
            grouped.entry(item.listen_id.clone()).or_default().push(item);
        }
    }
    for (_, group) in grouped {
        let rank = |kind: &str| match kind {
            "replay" => 4,
            "finish" => 3,
            "skip" => 2,
            "start" => 1,
            _ => 0,
        };
        if let Some(best) = group.into_iter().max_by_key(|item| (rank(&item.kind), item.at_ms)) {
            solo.push(best);
        }
    }
    solo.sort_by_key(|item| item.at_ms);
    solo
}

fn mark_background(items: &mut [Listen]) {
    let mut run: Vec<usize> = Vec::new();
    for index in 0..=items.len() {
        let continues = if index == items.len() {
            false
        } else {
            let kind_finish = items[index].kind == "finish" && items[index].fraction >= 0.9;
            if !kind_finish {
                false
            } else if let Some(prev) = run.last().copied() {
                let gap = items[index].at_ms - items[prev].at_ms;
                (45_000..15 * 60 * 1000).contains(&gap)
            } else {
                true
            }
        };
        if continues {
            run.push(index);
            continue;
        }
        if run.len() >= 10 {
            let span = items[*run.last().unwrap()].at_ms - items[run[0]].at_ms;
            if span >= 30 * 60 * 1000 {
                for index in run.iter().copied() {
                    items[index].background = true;
                }
            }
        }
        run.clear();
        if index < items.len() && items[index].kind == "finish" && items[index].fraction >= 0.9 {
            run.push(index);
        }
    }
}

fn weight(item: &Listen) -> f32 {
    if item.background {
        return 0.0;
    }
    match item.kind.as_str() {
        "finish" if item.fraction >= 0.75 => 4.0,
        "finish" if item.fraction >= 0.4 => 1.2,
        "finish" => 0.3,
        "replay" => 3.0,
        "skip" => -0.45,
        "dislike" => -8.0,
        "favorite_remove" => -3.0,
        "start" => 0.15,
        _ => 0.0,
    }
}

fn decay(age_ms: i64, half_days: f32) -> f32 {
    let days = (age_ms.max(0) as f32) / DAY_MS as f32;
    0.5f32.powf(days / half_days.max(0.1))
}

struct Bag {
    genres: HashMap<String, f32>,
    artists: HashMap<String, (String, f32, u32, u32, f64)>,
    languages: HashMap<String, f32>,
    bpm: (f32, f32, u32),
    energy: (f32, f32, u32),
    heard: f64,
    tracks: HashSet<String>,
}

impl Bag {
    fn new() -> Self {
        Self {
            genres: HashMap::new(),
            artists: HashMap::new(),
            languages: HashMap::new(),
            bpm: (0.0, 0.0, 0),
            energy: (0.0, 0.0, 0),
            heard: 0.0,
            tracks: HashSet::new(),
        }
    }

    fn add_artist(&mut self, name: &str, score: f32, plays: u32, replays: u32, heard: f64) {
        let key = person_key(name);
        if key.is_empty() || score == 0.0 && plays == 0 {
            return;
        }
        let entry = self.artists.entry(key).or_insert_with(|| (display_person(name), 0.0, 0, 0, 0.0));
        entry.1 += score;
        entry.2 += plays;
        entry.3 += replays;
        entry.4 += heard;
    }

    fn add_genres(&mut self, genre: &str, score: f32) {
        let parts: Vec<&str> = genre.split(',').map(str::trim).filter(|part| !part.is_empty()).collect();
        if parts.is_empty() || score == 0.0 {
            return;
        }
        let share = score / parts.len() as f32;
        for part in parts {
            *self.genres.entry(part.to_string()).or_insert(0.0) += share;
        }
    }
}

fn taste_from(events: &[Listen], store: &Store, spin: u64, now: i64) -> Taste {
    let mut long = Bag::new();
    let mut days14 = Bag::new();
    let mut days30 = Bag::new();
    let mut listens = 0u32;
    for event in events {
        let mut score = weight(event);
        if event.kind == "dislike" {
            score *= decay(now - event.at_ms, 180.0).max(0.5);
        }
        let age = now - event.at_ms;
        let long_score = if event.kind == "dislike" { score } else { score * decay(age, 180.0) };
        add_event(&mut long, event, long_score);
        if age <= 14 * DAY_MS {
            let current = if event.kind == "dislike" { score } else { score * decay(age, 3.5) };
            add_event(&mut days14, event, current);
        }
        if age <= 30 * DAY_MS {
            let current = if event.kind == "dislike" { score } else { score * decay(age, 8.0) };
            add_event(&mut days30, event, current);
        }
        if matches!(event.kind.as_str(), "start" | "finish" | "skip" | "replay") {
            listens += 1;
        }
    }
    for song in &store.songs {
        if !song.liked {
            continue;
        }
        let at = song.last_played_at.unwrap_or(song.added_at);
        let age = now - at;
        long.add_artist(&song.artist, 5.0 * decay(age, 180.0), 0, 0, 0.0);
        long.add_genres(&song.genre, 5.0 * decay(age, 180.0));
        days14.add_artist(&song.artist, 3.0 * decay(age, 3.5), 0, 0, 0.0);
        days14.add_genres(&song.genre, 3.0 * decay(age, 3.5));
        days30.add_artist(&song.artist, 3.0 * decay(age, 8.0), 0, 0, 0.0);
        days30.add_genres(&song.genre, 3.0 * decay(age, 8.0));
    }
    for artist in &store.settings.favorite_artists {
        long.add_artist(&artist.name, 4.0, 0, 0, 0.0);
        days14.add_artist(&artist.name, 2.5, 0, 0, 0.0);
        days30.add_artist(&artist.name, 2.5, 0, 0, 0.0);
    }
    let current = blend(&days14, &days30);
    let mut disliked = Vec::new();
    for event in events.iter().filter(|event| event.kind == "dislike") {
        let name = event.artist.trim();
        if !name.is_empty() && !disliked.iter().any(|have: &String| person_key(have) == person_key(name)) {
            disliked.push(name.to_string());
        }
    }
    let tagged = store.songs.iter().filter(|song| !song.genre.is_empty() || !song.language.is_empty()).count() as u32;
    let untagged = store.songs.len() as u32 - store.songs.iter().filter(|song| !song.genre.is_empty()).count() as u32;
    let ready = listens >= 4 || (store.songs.iter().filter(|song| song.liked).count() >= 2 && listens >= 1);
    let mut taste = Taste {
        ready,
        event_count: events.len() as u32,
        listen_seconds: long.heard.max(0.0) as u64,
        track_count: long.tracks.len() as u32,
        diversity: diversity_of(&long),
        long_genres: ranked_genres(&long.genres),
        current_genres: ranked_genres(&current.genres),
        long_artists: ranked_artists(&long),
        current_artists: ranked_artists(&current),
        disliked,
        languages: ranked_genres(&long.languages),
        bpm: measured(long.bpm),
        energy: measured(long.energy),
        line: String::new(),
        spin,
        tagged,
        untagged,
    };
    taste.line = portrait_line(&taste, store.songs.is_empty());
    taste
}

fn add_event(bag: &mut Bag, event: &Listen, score: f32) {
    if score == 0.0 && event.heard_s <= 0.0 {
        return;
    }
    let plays = u32::from(matches!(event.kind.as_str(), "start" | "finish" | "skip" | "replay"));
    let replays = u32::from(event.kind == "replay");
    let heard = if event.background { 0.0 } else { event.heard_s.max(0.0) };
    bag.add_artist(&event.artist, score, plays, replays, heard);
    bag.add_genres(&event.genre, score);
    if !event.language.is_empty() && score > 0.0 {
        *bag.languages.entry(event.language.clone()).or_insert(0.0) += score;
    }
    if score > 0.0 {
        if let Some(bpm) = event.bpm {
            let weight = score.max(0.1);
            bag.bpm.0 += bpm * weight;
            bag.bpm.1 += weight;
            bag.bpm.2 += 1;
        }
        if let Some(energy) = event.energy {
            let weight = score.max(0.1);
            bag.energy.0 += energy * weight;
            bag.energy.1 += weight;
            bag.energy.2 += 1;
        }
        bag.heard += heard;
        if !event.title.is_empty() {
            bag.tracks.insert(format!("{}|{}", person_key(&event.artist), person_key(&event.title)));
        }
    }
}

fn blend(fast: &Bag, slow: &Bag) -> Bag {
    let mut out = Bag::new();
    let mut keys = HashSet::new();
    keys.extend(fast.genres.keys().cloned());
    keys.extend(slow.genres.keys().cloned());
    for key in keys {
        let score = fast.genres.get(&key).copied().unwrap_or(0.0) * 0.62 + slow.genres.get(&key).copied().unwrap_or(0.0) * 0.38;
        if score != 0.0 {
            out.genres.insert(key, score);
        }
    }
    let mut artists = HashSet::new();
    artists.extend(fast.artists.keys().cloned());
    artists.extend(slow.artists.keys().cloned());
    for key in artists {
        let left = fast.artists.get(&key);
        let right = slow.artists.get(&key);
        let label = left.or(right).map(|item| item.0.clone()).unwrap_or_default();
        let score = left.map(|item| item.1).unwrap_or(0.0) * 0.62 + right.map(|item| item.1).unwrap_or(0.0) * 0.38;
        let plays = left.map(|item| item.2).unwrap_or(0) + right.map(|item| item.2).unwrap_or(0);
        let replays = left.map(|item| item.3).unwrap_or(0);
        let heard = left.map(|item| item.4).unwrap_or(0.0) * 0.62 + right.map(|item| item.4).unwrap_or(0.0) * 0.38;
        out.artists.insert(key, (label, score, plays, replays, heard));
    }
    out.heard = fast.heard * 0.62 + slow.heard * 0.38;
    out.tracks = fast.tracks.clone();
    out.languages = fast.languages.clone();
    out.bpm = fast.bpm;
    out.energy = fast.energy;
    out
}

fn ranked_genres(map: &HashMap<String, f32>) -> Vec<TasteItem> {
    let mut items: Vec<TasteItem> = map
        .iter()
        .filter(|(_, score)| **score > 0.05)
        .map(|(key, score)| TasteItem { key: key.clone(), label: genre_label(key), score: *score })
        .collect();
    items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    items.truncate(8);
    items
}

fn ranked_artists(bag: &Bag) -> Vec<TasteItem> {
    let mut items: Vec<TasteItem> = bag
        .artists
        .iter()
        .filter(|(_, item)| item.1 > 0.05)
        .map(|(key, item)| TasteItem { key: key.clone(), label: item.0.clone(), score: item.1 })
        .collect();
    items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    items.truncate(8);
    items
}

fn diversity_of(bag: &Bag) -> Option<f32> {
    let total: f64 = bag.artists.values().map(|item| item.4.max(0.0)).sum();
    if total < 30.0 || bag.artists.values().filter(|item| item.4 > 0.0).count() < 3 {
        return None;
    }
    let herfindahl: f32 = bag
        .artists
        .values()
        .map(|item| {
            let share = (item.4.max(0.0) / total) as f32;
            share * share
        })
        .sum();
    Some(((1.0 - herfindahl) * 100.0).clamp(0.0, 100.0))
}

fn measured(sum: (f32, f32, u32)) -> Option<f32> {
    if sum.2 < 3 || sum.1 <= 0.0 {
        None
    } else {
        Some(sum.0 / sum.1)
    }
}

fn portrait_line(taste: &Taste, empty_library: bool) -> String {
    if empty_library && taste.event_count == 0 {
        return "Библиотека пуста. Профиль ничего не придумывает: он ждёт файлы, прослушивания, избранное и «не нравится».".into();
    }
    if !taste.ready {
        return "Профиль собирается. Записываются прослушивания, избранное и «не нравится». Жанр и язык берутся только из тегов.".into();
    }
    let long_genre = taste.long_genres.first().map(|item| item.label.as_str());
    let current_genre = taste.current_genres.first().map(|item| item.label.as_str());
    let artist = taste.long_artists.first().map(|item| item.label.as_str());
    match (long_genre, current_genre, artist) {
        (Some(long), Some(current), Some(artist)) if long != current => {
            format!("В долгом профиле чаще {long}. За последние две недели сильнее {current}. Больше всего времени у {artist}.")
        }
        (Some(long), _, Some(artist)) => format!("Чаще всего звучит {long}. Больше всего времени у {artist}."),
        (None, _, Some(artist)) => format!("В тегах нет жанра, поэтому портрет держится на артистах. Больше всего времени у {artist}."),
        _ => "Прослушиваний ещё мало, чтобы назвать вкус. Ничего не додумывается.".into(),
    }
}

pub fn genre_label(key: &str) -> String {
    match key {
        "rock" => "рок",
        "metal" => "метал",
        "rap" => "рэп",
        "pop" => "поп",
        "electronic" => "электро",
        "jazz" => "джаз",
        "blues" => "блюз",
        "indie" => "инди",
        "dance" => "танцевальная",
        "disco" => "диско",
        "soul" => "соул",
        "rnb" => "рнб",
        "ambient" => "эмбиент",
        "soundtrack" => "саундтрек",
        "classical" => "классика",
        "folk" => "фолк",
        "latin" => "латина",
        "kpop" => "k-pop",
        "lofi" => "лоуфай",
        "ru" => "русский",
        "en" => "английский",
        "uk" => "украинский",
        "es" => "испанский",
        "fr" => "французский",
        "de" => "немецкий",
        other => other,
    }
    .to_string()
}

fn seed_json(taste: &Taste) -> String {
    let mut artists = Vec::new();
    let mut seen = HashSet::new();
    for (horizon, list) in [("current", &taste.current_artists), ("long", &taste.long_artists)] {
        for item in list.iter().take(6) {
            if !seen.insert(item.key.clone()) {
                continue;
            }
            artists.push(serde_json::json!({ "name": item.label, "horizon": horizon }));
        }
    }
    let genres: Vec<&str> = taste
        .current_genres
        .iter()
        .chain(taste.long_genres.iter())
        .take(6)
        .map(|item| item.key.as_str())
        .collect();
    serde_json::json!({
        "ready": taste.ready,
        "line": taste.line,
        "artists": artists,
        "avoid": taste.disliked,
        "genres": genres,
    })
    .to_string()
}

fn sections(store: &Store) -> Vec<Section> {
    let taste = &store.taste;
    let mut used_songs = HashSet::new();
    let mut used_artists: HashMap<String, u32> = HashMap::new();
    let allow = |song: &crate::model::Song, used_songs: &HashSet<String>, used_artists: &HashMap<String, u32>| {
        if used_songs.contains(&song.id) || taste_blocks(taste, &song.artist) {
            return false;
        }
        used_artists.get(&person_key(&song.artist)).copied().unwrap_or(0) < 3
    };
    let take = |songs: Vec<&crate::model::Song>, reason: &str, used_songs: &mut HashSet<String>, used_artists: &mut HashMap<String, u32>| {
        let mut rows = Vec::new();
        let mut per_artist: HashMap<String, u32> = HashMap::new();
        let spin = taste.spin as usize;
        let mut ordered = songs;
        if ordered.len() > 1 {
            let shift = spin % ordered.len();
            ordered.rotate_left(shift);
        }
        for song in ordered {
            if rows.len() >= 4 || !allow(song, used_songs, used_artists) {
                continue;
            }
            let key = person_key(&song.artist);
            if per_artist.get(&key).copied().unwrap_or(0) >= 2 {
                continue;
            }
            rows.push(Row {
                song_id: song.id.clone(),
                title: song.title.clone(),
                artist: song.artist.clone(),
                reason: reason.to_string(),
                tags: tag_line(&song.genre, &song.language),
            });
            used_songs.insert(song.id.clone());
            *per_artist.entry(key.clone()).or_insert(0) += 1;
            *used_artists.entry(key).or_insert(0) += 1;
        }
        rows
    };
    let top_long: HashSet<&str> = taste.long_genres.iter().take(2).map(|item| item.key.as_str()).collect();
    let top_artists: HashSet<&str> = taste.long_artists.iter().take(5).map(|item| item.key.as_str()).collect();
    let prefs: Vec<&crate::model::Song> = store
        .songs
        .iter()
        .filter(|song| !taste_blocks(taste, &song.artist))
        .filter(|song| song.liked || genre_hit(song, &taste.long_genres, 3) || genre_hit(song, &taste.current_genres, 3) || artist_hit(song, &taste.long_artists, 8) || artist_hit(song, &taste.current_artists, 8))
        .collect();
    let pref_reason = if taste.long_genres.first().is_some() {
        "Ты часто слушаешь этот жанр"
    } else if taste.long_artists.first().is_some() {
        "Ты часто слушаешь этого артиста"
    } else {
        "Этот трек в избранном"
    };
    let beyond: Vec<&crate::model::Song> = store
        .songs
        .iter()
        .filter(|song| !song.genre.is_empty())
        .filter(|song| song.genre.split(',').any(|key| !key.is_empty() && !top_long.contains(key)))
        .filter(|song| !top_artists.contains(person_key(&song.artist).as_str()))
        .collect();
    let unexpected: Vec<&crate::model::Song> = store
        .songs
        .iter()
        .filter(|song| song.genre.split(',').filter(|key| !key.is_empty()).count() >= 2)
        .filter(|song| {
            song.genre.split(',').all(|key| {
                taste.long_genres.iter().chain(taste.current_genres.iter()).any(|item| item.key == key && item.score > 0.2)
            })
        })
        .collect();
    let returning_keys: HashSet<String> = taste
        .long_artists
        .iter()
        .take(5)
        .filter(|item| {
            let current = taste.current_artists.iter().find(|now| now.key == item.key).map(|now| now.score).unwrap_or(0.0);
            current < item.score * 0.25
        })
        .map(|item| item.key.clone())
        .collect();
    let returns: Vec<&crate::model::Song> = store.songs.iter().filter(|song| returning_keys.contains(&person_key(&song.artist))).collect();
    let rising_artists: Vec<String> = taste
        .current_artists
        .iter()
        .filter(|item| {
            let long = taste.long_artists.iter().find(|old| old.key == item.key).map(|old| old.score).unwrap_or(0.0);
            item.score > long * 1.6 && item.score > 1.0 && taste.long_artists.iter().take(3).all(|old| old.key != item.key)
        })
        .map(|item| item.label.clone())
        .collect();
    let rising_genres: HashSet<String> = taste
        .current_genres
        .iter()
        .filter(|item| {
            let long = taste.long_genres.iter().find(|old| old.key == item.key).map(|old| old.score).unwrap_or(0.0);
            item.score > long * 1.6 && item.score > 1.0
        })
        .map(|item| item.key.clone())
        .collect();
    let discover: Vec<&crate::model::Song> = store
        .songs
        .iter()
        .filter(|song| rising_genres.iter().any(|key| song.genre.split(',').any(|part| part == key)) || rising_artists.iter().any(|name| person_key(name) == person_key(&song.artist)))
        .collect();
    let pref_rows = take(prefs, pref_reason, &mut used_songs, &mut used_artists);
    let beyond_rows = take(beyond, "Этот жанр есть в библиотеке, но он не в основе профиля", &mut used_songs, &mut used_artists);
    let unexpected_owned: Vec<crate::model::Song> = unexpected
        .into_iter()
        .filter(|song| !used_songs.contains(&song.id))
        .take(4)
        .cloned()
        .collect();
    let mut unexpected_rows = Vec::new();
    for song in unexpected_owned {
        let labels: Vec<String> = song.genre.split(',').map(genre_label).collect();
        used_songs.insert(song.id.clone());
        unexpected_rows.push(            Row {
                song_id: song.id.clone(),
                title: song.title.clone(),
                artist: song.artist.clone(),
                reason: format!("В одном треке сходятся {} и {}, а вместе они у тебя редкость", labels.first().map(String::as_str).unwrap_or(""), labels.get(1).map(String::as_str).unwrap_or("")),
                tags: tag_line(&song.genre, &song.language),
            });
    }
    let return_rows = take(returns, "Раньше ты слушал этого артиста чаще, чем за последние 14 дней", &mut used_songs, &mut used_artists);
    let discover_rows = take(discover, "За последние 14 дней это стало заметнее, чем в долгом профиле", &mut used_songs, &mut used_artists);
    vec![
        Section { title: "Твои предпочтения", empty: "Пока мало прослушиваний, чтобы собрать предпочтения.", rows: pref_rows, catalog_artist: String::new(), catalog_reason: String::new() },
        Section { title: "За пределами привычного", empty: "В библиотеке нет другого жанра с тегом.", rows: beyond_rows, catalog_artist: String::new(), catalog_reason: String::new() },
        Section { title: "Неожиданное сочетание", empty: "Нет трека, где в тегах сходятся два твоих жанра.", rows: unexpected_rows, catalog_artist: String::new(), catalog_reason: String::new() },
        Section { title: "Возвращение к интересам", empty: "Давние артисты пока не отстают от последних двух недель.", rows: return_rows, catalog_artist: String::new(), catalog_reason: String::new() },
        Section {
            title: "Продолжай открывать",
            empty: "Новое направление появится, когда текущие две недели разойдутся с долгим профилем.",
            rows: discover_rows,
            catalog_artist: if rising_artists.is_empty() { String::new() } else { rising_artists[0].clone() },
            catalog_reason: "За последние 14 дней этот артист стал заметнее, чем в долгом профиле".into(),
        },
    ]
}

fn genre_hit(song: &crate::model::Song, list: &[TasteItem], n: usize) -> bool {
    let keys: HashSet<&str> = list.iter().take(n).map(|item| item.key.as_str()).collect();
    song.genre.split(',').any(|key| keys.contains(key))
}

fn artist_hit(song: &crate::model::Song, list: &[TasteItem], n: usize) -> bool {
    let key = person_key(&song.artist);
    list.iter().take(n).any(|item| item.key == key)
}

fn taste_blocks(taste: &Taste, artist: &str) -> bool {
    let key = person_key(artist);
    taste.disliked.iter().any(|name| person_key(name) == key)
}

fn page(store: &Store, events: &[Listen], section: &str, reports: &[(String, String)]) -> String {
    if section == "report" {
        return report_page(events, reports);
    }
    let (left, right) = if let Some(rest) = section.strip_prefix("cmp-") {
        let mut parts = rest.split('-');
        (parts.next().unwrap_or("30"), parts.next().unwrap_or("7"))
    } else {
        ("", "")
    };
    let period = if section.is_empty() || section.starts_with("cmp-") { "30" } else { section };
    let mut html = String::from(r#"<div class="profile-view"><div class="view-header"><div class="view-info"><h1>Музыкальный профиль</h1><p>На этом компьютере: прослушивания, избранное и «не нравится». Вкусы не придумываются.</p></div><div class="profile-header-actions"><a class="btn btn-ghost" href="/?view=profile&section=report">Отчёт за месяц</a><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="profile-refresh"><input type="hidden" name="back" value="/?view=profile"><button type="submit" class="btn btn-secondary">Обновить</button></form></div></div>"#);
    html.push_str(&portrait(store));
    html.push_str(&recommendation_block(store));
    html.push_str(&discoveries(store, events));
    html.push_str(&history_block(events, period, left, right));
    html.push_str("</div>");
    html
}

fn portrait(store: &Store) -> String {
    let taste = &store.taste;
    let mut html = String::from(r#"<section class="home-section"><h2 class="home-section-title">Мой музыкальный портрет</h2><div class="profile-card"><p class="profile-lead">"#);
    html.push_str(&esc(&taste.line));
    html.push_str(r#"</p><div class="profile-stats">"#);
    html.push_str(&stat("Время", &format_duration(taste.listen_seconds)));
    html.push_str(&stat("Треки", &taste.track_count.to_string()));
    if let Some(diversity) = taste.diversity {
        html.push_str(&stat("Разнообразие", &format!("{diversity:.0}")));
    }
    html.push_str("</div>");
    if store.songs.is_empty() {
        html.push_str(r#"<p class="home-section-hint">Библиотека пуста. Рекомендации берут только ваши файлы и уже открытый каталог.</p>"#);
    } else if taste.tagged == 0 {
        html.push_str(r#"<p class="home-section-hint">В тегах нет жанра и языка. Эти поля скрыты, по имени файла они не угадываются.</p>"#);
    } else if taste.untagged > 0 {
        html.push_str(&format!(
            r#"<p class="home-section-hint">Без тега жанра: {} из {} треков. Они не входят в доли жанров.</p>"#,
            taste.untagged,
            store.songs.len()
        ));
    }
    html.push_str("</div></section>");
    html.push_str(r#"<div class="profile-split">"#);
    html.push_str(&genre_card(&taste.long_genres));
    html.push_str(&artist_block(store));
    html.push_str("</div>");
    html.push_str(&trait_block(taste));
    html
}

fn stat(label: &str, value: &str) -> String {
    format!(r#"<div class="profile-stat"><span>{}</span><strong>{}</strong></div>"#, esc(label), esc(value))
}

fn genre_card(items: &[TasteItem]) -> String {
    let mut html = String::from(r#"<section class="profile-card"><h2 class="home-section-title">Любимые жанры</h2>"#);
    if items.is_empty() {
        html.push_str(r#"<p class="home-section-hint">Жанр не найден в тегах.</p></section>"#);
        return html;
    }
    html.push_str(&bars(items));
    html.push_str("</section>");
    html
}

fn bars(items: &[TasteItem]) -> String {
    if items.is_empty() {
        return String::new();
    }
    let max = items.iter().map(|item| item.score).fold(0.0f32, f32::max).max(0.01);
    let mut html = String::from(r#"<div class="profile-bars">"#);
    for item in items.iter().take(6) {
        let width = ((item.score / max) * 100.0).clamp(8.0, 100.0);
        html.push_str(&format!(
            r#"<div class="profile-bar"><span>{}</span><span class="profile-bar-track"><span style="width:{width:.0}%"></span></span></div>"#,
            esc(&item.label)
        ));
    }
    html.push_str("</div>");
    html
}

fn artist_block(store: &Store) -> String {
    let taste = &store.taste;
    if taste.long_artists.is_empty() && taste.current_artists.is_empty() {
        return r#"<section class="profile-card"><h2 class="home-section-title">Любимые исполнители</h2><p class="home-section-hint">Появятся после прослушиваний или избранного.</p></section>"#.into();
    }
    let mut html = String::from(r#"<section class="profile-card"><h2 class="home-section-title">Любимые исполнители</h2><ul class="profile-people">"#);
    for item in taste.long_artists.iter().take(6) {
        let current = taste.current_artists.iter().find(|now| now.key == item.key);
        let top_now = taste.current_artists.first().map(|now| now.key.as_str());
        let top_long = taste.long_artists.first().map(|old| old.key.as_str());
        let note = if current.is_none() {
            "в долгом профиле, почти не звучал последние 14 дней"
        } else if top_now == Some(item.key.as_str()) && top_long != Some(item.key.as_str()) {
            "сильнее в текущих двух неделях"
        } else if current.unwrap().score > item.score {
            "сейчас слушается чаще, чем раньше"
        } else {
            "держится в долгом профиле"
        };
        html.push_str(&format!(r#"<li><strong>{}</strong><span>{}</span></li>"#, esc(&item.label), esc(note)));
    }
    html.push_str("</ul></section>");
    html
}

fn trait_block(taste: &Taste) -> String {
    let mut html = String::from(r#"<section class="home-section"><h2 class="home-section-title">Музыкальные предпочтения</h2><div class="profile-facts">"#);
    let mut any = false;
    if !taste.languages.is_empty() {
        any = true;
        let labels: Vec<String> = taste.languages.iter().take(4).map(|item| genre_label(&item.key)).collect();
        html.push_str(&fact("Язык", &labels.join(", ")));
    }
    let current = taste.current_genres.first().map(|item| item.label.as_str()).unwrap_or("");
    let long = taste.long_genres.first().map(|item| item.label.as_str()).unwrap_or("");
    if !current.is_empty() && !long.is_empty() {
        any = true;
        if current == long {
            html.push_str(&fact("Сейчас и давно", long));
        } else {
            html.push_str(&fact("Долго", long));
            html.push_str(&fact("14 и 30 дней", current));
        }
    }
    if !any {
        html.push_str(r#"<p class="home-section-hint">Темп, энергия и язык не показаны: в тегах и локальном разборе их нет.</p>"#);
    }
    html.push_str("</div></section>");
    html
}

fn tag_line(genre: &str, language: &str) -> String {
    let mut parts = Vec::new();
    for key in genre.split(',').map(str::trim).filter(|key| !key.is_empty()) {
        parts.push(genre_label(key));
    }
    if !language.is_empty() {
        parts.push(genre_label(language));
    }
    if parts.is_empty() {
        "тегов нет".into()
    } else {
        parts.join(" · ")
    }
}

fn fact(label: &str, value: &str) -> String {
    format!(r#"<div class="profile-fact"><span>{}</span><strong>{}</strong></div>"#, esc(label), esc(value))
}

fn recommendation_block(store: &Store) -> String {
    let mut html = String::from(r#"<section class="home-section"><div class="home-section-head"><h2 class="home-section-title">Персональные рекомендации</h2></div><p class="home-section-hint">Треки из библиотеки и уже открытого каталога. Причина берётся из профиля.</p>"#);
    if !store.taste.ready {
        html.push_str(r#"<p class="home-section-empty">Список появится после нескольких прослушиваний. Пустые места не заполняются выдуманными треками.</p></section>"#);
        return html;
    }
    html.push_str(r#"<div class="profile-rec-grid">"#);
    for section in sections(store) {
        html.push_str(&format!(r#"<article class="profile-card"><h3>{}</h3>"#, esc(section.title)));
        if section.rows.is_empty() {
            html.push_str(&format!(r#"<p class="home-section-hint">{}</p>"#, esc(section.empty)));
            if !section.catalog_artist.is_empty() {
                html.push_str(&format!(
                    r#"<div class="profile-catalog" data-profile-artist="{}" data-profile-reason="{}"><ul class="demo-tracks-grid" data-profile-results></ul></div>"#,
                    esc(&section.catalog_artist),
                    esc(&section.catalog_reason)
                ));
            }
        } else {
            html.push_str(r#"<ul class="profile-tracks">"#);
            for row in section.rows {
                html.push_str(&format!(
                    r#"<li><div class="profile-track-copy"><button type="button" class="song-name" data-play="{id}" data-title="{title}" data-artist="{artist}">{title}</button><span class="song-artist">{artist}</span><span class="track-tags{empty}">{tags}</span><span class="profile-reason">{reason}</span></div><button type="button" class="btn btn-ghost" data-menu-act="queue" data-id="{id}">В очередь</button></li>"#,
                    id = esc(&row.song_id),
                    title = esc(&row.title),
                    artist = esc(&row.artist),
                    empty = if row.tags == "тегов нет" { " is-empty" } else { "" },
                    tags = esc(&row.tags),
                    reason = esc(&row.reason),
                ));
            }
            html.push_str("</ul>");
        }
        html.push_str("</article>");
    }
    html.push_str("</div></section>");
    html
}

fn history_block(events: &[Listen], period: &str, left: &str, right: &str) -> String {
    let listens = events.iter().filter(|event| matches!(event.kind.as_str(), "start" | "finish" | "skip" | "replay")).count();
    let mut html = String::from(r#"<section class="home-section"><h2 class="home-section-title">История изменения вкусов</h2><div class="profile-chips">"#);
    for (key, label) in [("7", "7 дней"), ("30", "30 дней"), ("90", "3 месяца"), ("180", "6 месяцев"), ("365", "1 год"), ("all", "всё время")] {
        let class = if key == period { "rec-filter-chip active" } else { "rec-filter-chip" };
        html.push_str(&format!(r#"<a class="{class}" href="/?view=profile&section={key}">{label}</a>"#));
    }
    html.push_str("</div>");
    if listens < 4 {
        html.push_str(r#"<p class="home-section-empty">Истории пока мало. Нужно несколько разных прослушиваний, чтобы сравнить периоды.</p></section>"#);
        return html;
    }
    let current = share_bag(events, period, now_ms());
    html.push_str(r#"<div class="profile-split">"#);
    html.push_str(&format!(r#"<section class="profile-card"><h3>Жанры · {}</h3>{}</section>"#, esc(&period_label(period)), bars(&ranked_genres(&current.genres))));
    html.push_str(&format!(r#"<section class="profile-card"><h3>Исполнители · {}</h3>{}</section>"#, esc(&period_label(period)), bars(&ranked_artists(&current))));
    html.push_str("</div>");
    if !left.is_empty() && !right.is_empty() {
        html.push_str(&compare_block(events, left, right));
    } else {
        html.push_str(r#"<p class="home-section-hint">Сравнить периоды: "#);
        html.push_str(&format!(
            r#"<a href="/?view=profile&section=cmp-{period}-7">с 7 днями</a> · <a href="/?view=profile&section=cmp-{period}-30">с 30 днями</a> · <a href="/?view=profile&section=cmp-30-90">30 дней и 3 месяца</a></p>"#
        ));
    }
    html.push_str("</section>");
    html
}

fn compare_block(events: &[Listen], left: &str, right: &str) -> String {
    let now = now_ms();
    let a = share_bag(events, left, now);
    let b = share_bag(events, right, now);
    let mut html = format!(
        r#"<section class="profile-card profile-compare-card"><h3>Сравнение: {} и {}</h3><ul class="profile-compare">"#,
        esc(&period_label(left)),
        esc(&period_label(right))
    );
    let mut keys: Vec<String> = a.genres.keys().chain(b.genres.keys()).cloned().collect();
    keys.sort();
    keys.dedup();
    if keys.is_empty() {
        return r#"<p class="home-section-hint">В этих периодах нет жанров из тегов, сравнивать нечего.</p>"#.into();
    }
    for key in keys.into_iter().take(8) {
        let left_share = share_of(&a.genres, &key);
        let right_share = share_of(&b.genres, &key);
        html.push_str(&format!(
            r#"<li><span>{}</span><span>{:.0}% → {:.0}%</span></li>"#,
            esc(&genre_label(&key)),
            left_share * 100.0,
            right_share * 100.0
        ));
    }
    html.push_str("</ul></section>");
    html
}

fn discoveries(store: &Store, events: &[Listen]) -> String {
    let mut html = String::from(r#"<section class="home-section"><h2 class="home-section-title">Музыкальные открытия</h2>"#);
    if !store.taste.ready {
        html.push_str(r#"<p class="home-section-empty">Открытия появятся, когда текущие две недели можно будет сравнить с долгим профилем.</p></section>"#);
        return html;
    }
    let mut lines = Vec::new();
    for item in store.taste.current_genres.iter().take(4) {
        let long = store.taste.long_genres.iter().find(|old| old.key == item.key).map(|old| old.score).unwrap_or(0.0);
        if long < 0.2 && item.score > 1.0 {
            lines.push(format!("Новый для долгого профиля жанр: {}.", genre_label(&item.key)));
        } else if item.score > long * 1.6 && item.score > 1.0 {
            lines.push(format!("Жанр {} растёт относительно долгого профиля.", genre_label(&item.key)));
        }
    }
    for item in store.taste.current_artists.iter().take(4) {
        let long = store.taste.long_artists.iter().find(|old| old.key == item.key).map(|old| old.score).unwrap_or(0.0);
        if item.score > long * 1.6 && item.score > 1.0 {
            lines.push(format!("Исполнитель {} стал заметнее за последние недели.", item.label));
        }
    }
    let now = now_ms();
    let this_month = trait_shift(events, month_start(now), now);
    let previous = month_start(month_start(now) - DAY_MS);
    let prev_month = trait_shift(events, previous, month_start(now));
    if let (Some(now_bpm), Some(prev_bpm)) = (this_month.0, prev_month.0) {
        if (now_bpm - prev_bpm).abs() >= 8.0 {
            lines.push(format!("Темп по тегам: около {:.0} против {:.0} в прошлом месяце.", now_bpm, prev_bpm));
        }
    }
    if lines.is_empty() {
        html.push_str(r#"<p class="home-section-hint">Заметного сдвига относительно долгого профиля пока нет.</p>"#);
    } else {
        html.push_str(r#"<ul class="profile-people profile-card">"#);
        for line in lines {
            html.push_str(&format!("<li>{}</li>", esc(&line)));
        }
        html.push_str("</ul>");
    }
    html.push_str("</section>");
    html
}

fn report_page(events: &[Listen], saved: &[(String, String)]) -> String {
    let mut html = String::from(r#"<div class="profile-view"><div class="view-header"><div class="view-info"><h1>Отчёт за месяц</h1><p>Закрытый месяц сохраняется на этом компьютере.</p></div><a class="btn btn-secondary" href="/?view=profile">К профилю</a></div>"#);
    let month = month_key(now_ms());
    let open = report_body(events, &month);
    html.push_str(&format!(r#"<section class="home-section"><h2 class="home-section-title">{} ещё идёт</h2><div class="profile-card">{}</div></section>"#, esc(&month_title(&month)), report_html(&open)));
    if saved.is_empty() {
        html.push_str(r#"<section class="home-section"><p class="home-section-hint">Закрытых отчётов пока нет. Они записываются, когда месяц закончился и в нём были прослушивания.</p></section>"#);
    } else {
        for (month, body) in saved {
            let parsed: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
            html.push_str(&format!(r#"<section class="home-section"><h2 class="home-section-title">{}</h2><div class="profile-card">{}</div></section>"#, esc(&month_title(month)), report_html(&parsed)));
        }
    }
    html.push_str("</div>");
    html
}

fn report_body(events: &[Listen], month: &str) -> serde_json::Value {
    let mut bag = Bag::new();
    let mut tracks: HashMap<String, (String, String, f32)> = HashMap::new();
    for event in events.iter().filter(|event| month_key(event.at_ms) == month && !event.background) {
        add_event(&mut bag, event, weight(event).max(0.0));
        if !event.title.is_empty() && weight(event) > 0.0 {
            let entry = tracks.entry(format!("{}|{}", person_key(&event.artist), person_key(&event.title))).or_insert_with(|| (event.title.clone(), event.artist.clone(), 0.0));
            entry.2 += weight(event);
        }
    }
    let genres = ranked_genres(&bag.genres);
    let artists = ranked_artists(&bag);
    let top_track = tracks.values().max_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal));
    serde_json::json!({
        "genre": genres.first().map(|item| item.label.clone()).unwrap_or_default(),
        "artist": artists.first().map(|item| item.label.clone()).unwrap_or_default(),
        "track": top_track.map(|item| item.0.clone()).unwrap_or_default(),
        "seconds": bag.heard.max(0.0) as u64,
        "directions": genres.iter().skip(1).take(2).map(|item| item.label.clone()).collect::<Vec<_>>(),
    })
}

fn report_html(body: &serde_json::Value) -> String {
    let text = |key: &str| body.get(key).and_then(|value| value.as_str()).unwrap_or("").to_string();
    let seconds = body.get("seconds").and_then(|value| value.as_u64()).unwrap_or(0);
    if text("genre").is_empty() && text("artist").is_empty() && seconds == 0 {
        return r#"<p class="profile-empty">В этом месяце ещё нет прослушиваний для отчёта.</p>"#.into();
    }
    format!(
        r#"<ul class="profile-people"><li>Жанр: {}</li><li>Исполнитель: {}</li><li>Трек: {}</li><li>Время: {}</li></ul>"#,
        esc(&text_or(&text("genre"), "в тегах не найден")),
        esc(&text_or(&text("artist"), "пока нет")),
        esc(&text_or(&text("track"), "пока нет")),
        esc(&format_duration(seconds)),
    )
}

fn share_bag(events: &[Listen], period: &str, now: i64) -> Bag {
    let mut bag = Bag::new();
    let window = period_ms(period);
    for event in events {
        if event.background {
            continue;
        }
        if let Some(window) = window {
            if now - event.at_ms > window {
                continue;
            }
        }
        add_event(&mut bag, event, weight(event));
    }
    bag
}

fn share_of(map: &HashMap<String, f32>, key: &str) -> f32 {
    let total: f32 = map.values().filter(|score| **score > 0.0).sum();
    if total <= 0.0 {
        0.0
    } else {
        map.get(key).copied().unwrap_or(0.0).max(0.0) / total
    }
}

fn trait_shift(events: &[Listen], from: i64, to: i64) -> (Option<f32>, Option<f32>) {
    let mut bpm = (0.0f32, 0.0f32, 0u32);
    let mut energy = (0.0f32, 0.0f32, 0u32);
    for event in events {
        if event.at_ms < from || event.at_ms >= to || weight(event) <= 0.0 {
            continue;
        }
        if let Some(value) = event.bpm {
            bpm.0 += value;
            bpm.1 += 1.0;
            bpm.2 += 1;
        }
        if let Some(value) = event.energy {
            energy.0 += value;
            energy.1 += 1.0;
            energy.2 += 1;
        }
    }
    (measured(bpm), measured(energy))
}

fn period_ms(period: &str) -> Option<i64> {
    match period {
        "7" => Some(7 * DAY_MS),
        "30" => Some(30 * DAY_MS),
        "90" => Some(90 * DAY_MS),
        "180" => Some(180 * DAY_MS),
        "365" => Some(365 * DAY_MS),
        _ => None,
    }
}

fn period_label(period: &str) -> String {
    match period {
        "7" => "7 дней",
        "30" => "30 дней",
        "90" => "3 месяца",
        "180" => "6 месяцев",
        "365" => "1 год",
        _ => "всё время",
    }
    .into()
}

fn month_key(at_ms: i64) -> String {
    let days = at_ms.div_euclid(DAY_MS);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    format!("{year:04}-{:02}", month)
}

fn month_title(key: &str) -> String {
    let month = key.get(5..7).unwrap_or("").parse::<u32>().unwrap_or(0);
    let name = ["", "январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]
        .get(month as usize)
        .copied()
        .unwrap_or("месяц");
    format!("{name} {}", key.get(0..4).unwrap_or(""))
}

fn month_start(at_ms: i64) -> i64 {
    let key = month_key(at_ms);
    let year: i64 = key.get(0..4).unwrap_or("1970").parse().unwrap_or(1970);
    let month: i64 = key.get(5..7).unwrap_or("01").parse().unwrap_or(1);
    civil_days(year, month, 1) * DAY_MS
}

fn civil_days(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy as u64;
    era * 146097 + doe as i64 - 719468
}

fn day_key(at_ms: i64) -> String {
    let day = (at_ms - month_start(at_ms)) / DAY_MS + 1;
    format!("{}-{:02}", month_key(at_ms), day.max(1))
}

fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    if hours > 0 {
        format!("{hours} ч {minutes} мин")
    } else {
        format!("{minutes} мин")
    }
}

fn text_or<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.is_empty() { fallback } else { value }
}

fn person_key(name: &str) -> String {
    let cut = name.split([',', '&']).next().unwrap_or(name);
    let cut = cut.split(" feat").next().unwrap_or(cut);
    cut.trim().to_lowercase().replace('ё', "е").split_whitespace().collect::<Vec<_>>().join(" ")
}

fn display_person(name: &str) -> String {
    let cut = name.split([',', '&']).next().unwrap_or(name);
    let cut = cut.split(" feat").next().unwrap_or(cut);
    let cut = cut.trim();
    if cut.is_empty() { name.trim().to_string() } else { cut.to_string() }
}

fn same_name(left: &str, right: &str) -> bool {
    !right.trim().is_empty() && person_key(left) == person_key(right)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Song;

    fn ev(days_ago: i64, kind: &str, artist: &str, genre: &str, fraction: f64) -> Listen {
        Listen {
            at_ms: 1_700_000_000_000 - days_ago * DAY_MS,
            listen_id: format!("{artist}-{days_ago}-{kind}"),
            kind: kind.into(),
            source: "library".into(),
            song_id: String::new(),
            title: format!("Track {artist}"),
            artist: artist.into(),
            genre: genre.into(),
            language: String::new(),
            bpm: None,
            energy: None,
            heard_s: 180.0 * fraction,
            fraction,
            background: false,
        }
    }

    fn song(title: &str, artist: &str, genre: &str, liked: bool) -> Song {
        Song {
            id: format!("{artist}-{title}"),
            path: String::new(),
            title: title.into(),
            artist: artist.into(),
            album: String::new(),
            year: None,
            duration: 180.0,
            liked,
            added_at: 0,
            modified_at: 0,
            play_count: 1,
            last_played_at: None,
            file_size: 0,
            cover_path: String::new(),
            trim_start: 0.0,
            trim_end: 0.0,
            genre: genre.into(),
            language: String::new(),
            bpm: None,
            energy: None,
            tags_read: true,
        }
    }

    #[test]
    fn rock_stays_long_while_electronic_rises_now() {
        let now = 1_700_000_000_000;
        let mut events = Vec::new();
        for day in 40..80 {
            events.push(ev(day, "finish", "Queen", "rock", 0.95));
        }
        for day in 1..12 {
            events.push(ev(day, "finish", "Daft Punk", "electronic", 0.95));
        }
        let store = Store::default();
        let taste = taste_from(&events, &store, 0, now);
        assert_eq!(taste.long_genres.first().map(|item| item.key.as_str()), Some("rock"));
        assert_eq!(taste.current_genres.first().map(|item| item.key.as_str()), Some("electronic"));
        assert!(taste.line.contains("рок") && taste.line.contains("электро"));
    }

    #[test]
    fn one_skip_is_weak_and_dislike_is_strong() {
        let now = 1_700_000_000_000;
        let events = vec![
            ev(1, "finish", "Queen", "rock", 0.9),
            ev(1, "skip", "Queen", "rock", 0.1),
            ev(1, "dislike", "Nickelback", "rock", 0.0),
        ];
        let store = Store::default();
        let taste = taste_from(&events, &store, 0, now);
        let queen = taste.long_artists.iter().find(|item| item.label == "Queen").map(|item| item.score).unwrap_or(0.0);
        let disliked = taste.long_artists.iter().find(|item| item.label == "Nickelback").map(|item| item.score);
        assert!(queen > 3.0);
        assert!(disliked.is_none());
        assert!(taste.disliked.iter().any(|name| name == "Nickelback"));
        assert!(weight(&events[1]).abs() < 1.0);
        assert!(weight(&events[2]).abs() > 5.0);
    }

    #[test]
    fn a_long_unattended_run_does_not_count() {
        let mut events = Vec::new();
        let start = 1_700_000_000_000;
        for index in 0..12 {
            let mut event = ev(0, "finish", "Radio", "pop", 0.95);
            event.at_ms = start + index * 180_000;
            event.listen_id = format!("bg-{index}");
            events.push(event);
        }
        mark_background(&mut events);
        assert!(events.iter().all(|event| event.background));
        assert_eq!(weight(&events[0]), 0.0);
    }

    #[test]
    fn recommendations_use_real_reasons_and_do_not_repeat_one_artist() {
        let now = 1_700_000_000_000;
        let mut events = Vec::new();
        for day in 20..40 {
            events.push(ev(day, "finish", "Queen", "rock", 0.95));
        }
        for day in 1..8 {
            events.push(ev(day, "finish", "Daft Punk", "electronic", 0.9));
        }
        let mut store = Store::default();
        store.songs = vec![
            song("Bohemian", "Queen", "rock", true),
            song("We Will Rock You", "Queen", "rock", false),
            song("Another", "Queen", "rock", false),
            song("One More Time", "Daft Punk", "electronic", false),
            song("Around", "Daft Punk", "electronic", false),
            song("Blue", "Miles Davis", "jazz", false),
            song("Combo", "Hybrid", "rock,electronic", false),
        ];
        store.taste = taste_from(&events, &store, 1, now);
        let built = sections(&store);
        let prefs = built.iter().find(|section| section.title == "Твои предпочтения").unwrap();
        assert!(!prefs.rows.is_empty());
        assert!(prefs.rows.iter().all(|row| row.reason.contains("жанр") || row.reason.contains("артист") || row.reason.contains("избранн")));
        let queen_rows = built.iter().flat_map(|section| section.rows.iter()).filter(|row| row.artist == "Queen").count();
        assert!(queen_rows <= 3);
        let combo = built.iter().find(|section| section.title == "Неожиданное сочетание").unwrap();
        assert!(combo.rows.iter().any(|row| row.reason.contains("рок") && row.reason.contains("электро")));
    }

    #[test]
    fn filename_is_not_a_language_and_missing_traits_stay_hidden() {
        assert!(crate::model::normalize_language("track_ru.mp3").is_empty());
        assert_eq!(crate::model::normalize_language("rus"), "ru");
        assert!(crate::model::normalize_genres("").is_empty());
        let taste = Taste::default();
        assert!(taste.bpm.is_none() && taste.energy.is_none() && taste.diversity.is_none());
        assert!(portrait_line(&taste, true).contains("не придумывает") || portrait_line(&taste, false).contains("собирается"));
    }

    #[test]
    fn reports_survive_reopen() {
        let path = std::env::temp_dir().join(format!("ime-profile-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let db = Db::open(&path);
        let mut events = vec![ev(40, "finish", "Queen", "rock", 1.0)];
        events[0].at_ms = civil_days(2026, 10, 15) * DAY_MS;
        db.ensure_reports(&events);
        drop(db);
        let db = Db::open(&path);
        let saved = db.reports();
        assert!(saved.iter().any(|(month, _)| month == "2026-10"));
        let _ = std::fs::remove_file(&path);
    }
}
