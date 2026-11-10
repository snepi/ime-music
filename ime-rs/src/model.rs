use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

static SEQ: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn nid() -> String {
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{:x}{:x}", now_ms(), n)
}

fn is_audio(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "mp3" | "flac" | "wav" | "ogg" | "m4a" | "aac" | "opus" | "wma" | "aiff" | "aif" | "webm" | "mp4" | "mkv"
    )
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub year: Option<i32>,
    pub duration: f64,
    pub liked: bool,
    pub added_at: i64,
    pub modified_at: i64,
    pub play_count: u32,
    pub last_played_at: Option<i64>,
    pub file_size: u64,
    #[serde(default)]
    pub cover_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub song_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryItem {
    pub id: String,
    pub song_id: String,
    pub played_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Wish {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    #[serde(default)]
    pub preview_url: String,
    #[serde(default)]
    pub cover_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Behavior {
    pub start_view: String,
    pub restore_last_page: bool,
    pub restore_track: bool,
    pub restore_queue: bool,
    pub focus_search_on_open: bool,
    pub confirm_delete: bool,
    pub confirm_clear_queue: bool,
    pub space_toggles_playback: bool,
    pub auto_resume_on_launch: bool,
}

impl Default for Behavior {
    fn default() -> Self {
        Self {
            start_view: "home".into(),
            restore_last_page: true,
            restore_track: true,
            restore_queue: true,
            focus_search_on_open: false,
            confirm_delete: true,
            confirm_clear_queue: true,
            space_toggles_playback: true,
            auto_resume_on_launch: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Playback {
    pub shuffle: bool,
    pub repeat: String,
    pub normalize_volume: bool,
    pub crossfade_seconds: i32,
    pub gapless_enabled: bool,
    pub eq_enabled: bool,
    pub eq_preset: String,
    pub eq_bass: i32,
    pub eq_mid: i32,
    pub eq_treble: i32,
    pub close_to_tray: bool,
}

impl Default for Playback {
    fn default() -> Self {
        Self {
            shuffle: false,
            repeat: "off".into(),
            normalize_volume: false,
            crossfade_seconds: 0,
            gapless_enabled: false,
            eq_enabled: false,
            eq_preset: "flat".into(),
            eq_bass: 0,
            eq_mid: 0,
            eq_treble: 0,
            close_to_tray: true,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Waves {
    pub genre: String,
    pub language: String,
    pub mood: String,
    pub seed: String,
    pub diversity: String,
    pub skip_known: bool,
    pub active: bool,
    /// Preview URLs already played. The next session puts these after fresh tracks.
    #[serde(default)]
    pub heard: Vec<String>,
    /// Increments every time a queue is built so the shuffle changes between sessions.
    #[serde(default)]
    pub spin: u64,
}

impl Default for Waves {
    fn default() -> Self {
        Self {
            genre: "all".into(),
            language: "any".into(),
            mood: "any".into(),
            seed: "taste".into(),
            diversity: "normal".into(),
            skip_known: true,
            active: false,
            heard: Vec::new(),
            spin: 0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PresetColor {
    pub id: String,
    pub name: String,
    pub bg: String,
    pub accent: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Settings {
    pub locale: String,
    pub theme: String,
    pub show_sidebar: bool,
    pub show_queue: bool,
    pub show_search: bool,
    pub sidebar_collapsed: bool,
    pub sort_by: String,
    pub sort_order: String,
    pub volume: f32,
    pub muted: bool,
    pub onboarding_done: bool,
    pub behavior: Behavior,
    pub playback: Playback,
    pub waves: Waves,
    pub wishlist: Vec<Wish>,
    pub preset_id: String,
    pub bg_main: Option<String>,
    pub bg_sidebar: Option<String>,
    pub accent: Option<String>,
    pub listenbrainz: bool,
    pub lastfm: bool,
    pub ffmpeg_path: String,
    pub ytdlp_path: String,
    pub ytdlp_proxy: String,
    pub last_view: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            locale: "ru".into(),
            theme: "dark".into(),
            show_sidebar: true,
            show_queue: true,
            show_search: true,
            sidebar_collapsed: false,
            sort_by: "title".into(),
            sort_order: "asc".into(),
            volume: 0.8,
            muted: false,
            onboarding_done: false,
            behavior: Behavior::default(),
            playback: Playback::default(),
            waves: Waves::default(),
            wishlist: Vec::new(),
            preset_id: "default".into(),
            bg_main: None,
            bg_sidebar: None,
            accent: None,
            listenbrainz: false,
            lastfm: false,
            ffmpeg_path: String::new(),
            ytdlp_path: String::new(),
            ytdlp_proxy: String::new(),
            last_view: "home".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Player {
    pub current_id: Option<String>,
    pub queue: Vec<String>,
    pub queue_index: usize,
    pub position: f64,
    pub playing: bool,
}

impl Default for Player {
    fn default() -> Self {
        Self {
            current_id: None,
            queue: Vec::new(),
            queue_index: 0,
            position: 0.0,
            playing: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Store {
    pub songs: Vec<Song>,
    pub playlists: Vec<Playlist>,
    pub history: Vec<HistoryItem>,
    pub settings: Settings,
    pub player: Player,
}

impl Default for Store {
    fn default() -> Self {
        Self {
            songs: Vec::new(),
            playlists: Vec::new(),
            history: Vec::new(),
            settings: Settings::default(),
            player: Player::default(),
        }
    }
}

impl Store {
    pub fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => Store::default(),
        }
    }

    pub fn save(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(self) {
            let _ = fs::write(path, raw);
        }
    }

    pub fn song(&self, id: &str) -> Option<&Song> {
        self.songs.iter().find(|s| s.id == id)
    }

    pub fn visible(&self, view: &str, playlist: Option<&str>) -> Vec<Song> {
        let mut songs: Vec<Song> = match view {
            "liked" => self.songs.iter().filter(|s| s.liked).cloned().collect(),
            "playlist" => {
                let ids = playlist
                    .and_then(|id| self.playlists.iter().find(|p| p.id == id))
                    .map(|p| p.song_ids.clone())
                    .unwrap_or_default();
                ids.iter()
                    .filter_map(|id| self.song(id).cloned())
                    .collect()
            }
            _ => self.songs.clone(),
        };
        let asc = self.settings.sort_order != "desc";
        songs.sort_by(|a, b| {
            let ord = match self.settings.sort_by.as_str() {
                "dateModified" => a.modified_at.cmp(&b.modified_at),
                "dateAdded" => a.added_at.cmp(&b.added_at),
                _ => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
            };
            if asc {
                ord
            } else {
                ord.reverse()
            }
        });
        songs
    }

    pub fn import_path(&mut self, path: &Path) -> usize {
        let mut n = 0;
        if path.is_file() {
            if self.add_file(path) {
                n += 1;
            }
        } else if path.is_dir() {
            for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() && self.add_file(entry.path()) {
                    n += 1;
                }
            }
        }
        n
    }

    /// The wishlist download knows the real title and artist. The file name is only a YouTube id.
    pub fn apply_download_meta(&mut self, path: &Path, title: &str, artist: &str, album: &str, cover_path: &str) -> bool {
        let path_str = path.to_string_lossy().to_string();
        let Some(song) = self.songs.iter_mut().find(|song| song.path == path_str) else {
            return false;
        };
        if !title.trim().is_empty() {
            song.title = title.trim().to_string();
        }
        if !artist.trim().is_empty() {
            song.artist = artist.trim().to_string();
        }
        if !album.trim().is_empty() {
            song.album = album.trim().to_string();
        }
        if !cover_path.trim().is_empty() {
            song.cover_path = cover_path.trim().to_string();
        }
        true
    }

    pub fn add_file(&mut self, path: &Path) -> bool {
        if !is_audio(path) {
            return false;
        }
        let path_str = path.to_string_lossy().to_string();
        if self.songs.iter().any(|s| s.path == path_str) {
            return false;
        }
        let meta = read_tags(path);
        let file_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let modified_at = fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or_else(now_ms);
        self.songs.push(Song {
            id: nid(),
            path: path_str,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            year: meta.year,
            duration: meta.duration,
            liked: false,
            added_at: now_ms(),
            modified_at,
            play_count: 0,
            last_played_at: None,
            file_size,
            cover_path: String::new(),
        });
        true
    }

    pub fn toggle_like(&mut self, id: &str) {
        if let Some(song) = self.songs.iter_mut().find(|s| s.id == id) {
            song.liked = !song.liked;
        }
    }

    pub fn remove_song(&mut self, id: &str) {
        self.songs.retain(|s| s.id != id);
        for pl in &mut self.playlists {
            pl.song_ids.retain(|s| s != id);
        }
        if self.player.current_id.as_deref() == Some(id) {
            self.player.current_id = None;
            self.player.playing = false;
        }
        self.player.queue.retain(|s| s != id);
    }

    pub fn remember_wave(&mut self, preview_url: &str) {
        let url = preview_url.trim();
        if url.is_empty() {
            return;
        }
        self.settings.waves.heard.retain(|heard| heard != url);
        self.settings.waves.heard.push(url.to_string());
        if self.settings.waves.heard.len() > 160 {
            let extra = self.settings.waves.heard.len() - 160;
            self.settings.waves.heard.drain(0..extra);
        }
    }

    pub fn toggle_wish(&mut self, title: &str, artist: &str, album: &str, preview_url: &str, cover_url: &str) {
        let title = title.trim();
        if title.is_empty() {
            return;
        }
        let artist = artist.trim();
        if let Some(index) = self.settings.wishlist.iter().position(|wish| {
            wish.title.eq_ignore_ascii_case(title) && wish.artist.eq_ignore_ascii_case(artist)
        }) {
            self.settings.wishlist.remove(index);
            return;
        }
        self.settings.wishlist.insert(
            0,
            Wish {
                id: nid(),
                title: title.into(),
                artist: artist.into(),
                album: album.trim().into(),
                preview_url: preview_url.into(),
                cover_url: cover_url.into(),
            },
        );
    }

    pub fn create_playlist(&mut self, name: &str) -> String {
        let id = nid();
        self.playlists.push(Playlist {
            id: id.clone(),
            name: name.trim().to_string(),
            song_ids: Vec::new(),
        });
        id
    }

    pub fn add_to_playlist(&mut self, playlist: &str, song: &str) {
        if let Some(pl) = self.playlists.iter_mut().find(|p| p.id == playlist) {
            if !pl.song_ids.iter().any(|s| s == song) {
                pl.song_ids.push(song.to_string());
            }
        }
    }

    pub fn play(&mut self, id: &str) {
        if self.song(id).is_none() {
            return;
        }
        if self.player.queue.is_empty() || !self.player.queue.iter().any(|s| s == id) {
            self.player.queue = self.songs.iter().map(|s| s.id.clone()).collect();
        }
        if let Some(idx) = self.player.queue.iter().position(|s| s == id) {
            self.player.queue_index = idx;
        }
        self.player.current_id = Some(id.to_string());
        self.player.position = 0.0;
        self.player.playing = true;
        if let Some(song) = self.songs.iter_mut().find(|s| s.id == id) {
            song.play_count += 1;
            song.last_played_at = Some(now_ms());
        }
        self.history.insert(
            0,
            HistoryItem {
                id: nid(),
                song_id: id.to_string(),
                played_at: now_ms(),
            },
        );
        self.history.truncate(80);
    }

    pub fn pause(&mut self) {
        self.player.playing = false;
    }

    pub fn resume(&mut self) {
        if self.player.current_id.is_some() {
            self.player.playing = true;
        }
    }

    pub fn next(&mut self) -> Option<String> {
        if self.player.queue.is_empty() {
            return None;
        }
        let repeat = self.settings.playback.repeat.clone();
        if repeat == "one" {
            if let Some(id) = self.player.current_id.clone() {
                self.play(&id);
                return Some(id);
            }
        }
        let len = self.player.queue.len();
        let mut idx = self.player.queue_index.saturating_add(1);
        if idx >= len {
            if repeat == "all" {
                idx = 0;
            } else {
                self.player.playing = false;
                return None;
            }
        }
        let id = self.player.queue[idx].clone();
        self.play(&id);
        Some(id)
    }

    pub fn prev(&mut self) -> Option<String> {
        if self.player.queue.is_empty() {
            return None;
        }
        let idx = if self.player.queue_index == 0 {
            if self.settings.playback.repeat == "all" {
                self.player.queue.len() - 1
            } else {
                0
            }
        } else {
            self.player.queue_index - 1
        };
        let id = self.player.queue[idx].clone();
        self.play(&id);
        Some(id)
    }

    pub fn history_stats(&self) -> (u32, u32, u32) {
        let now = now_ms();
        let week = now - 7 * 24 * 3600 * 1000;
        let month = now - 30 * 24 * 3600 * 1000;
        let week_count = self.history.iter().filter(|h| h.played_at >= week).count() as u32;
        let month_count = self.history.iter().filter(|h| h.played_at >= month).count() as u32;
        (week_count, month_count, self.history.len() as u32)
    }

    pub fn duplicate_groups(&self) -> usize {
        use std::collections::HashMap;
        let mut map: HashMap<(String, String), usize> = HashMap::new();
        for song in &self.songs {
            let key = (song.artist.to_lowercase(), song.title.to_lowercase());
            *map.entry(key).or_default() += 1;
        }
        map.values().filter(|n| **n > 1).count()
    }

    pub fn merge_duplicates(&mut self) -> (usize, usize) {
        use std::collections::HashMap;
        let mut groups: HashMap<(String, String), Vec<String>> = HashMap::new();
        for song in &self.songs {
            let key = (song.artist.to_lowercase(), song.title.to_lowercase());
            groups.entry(key).or_default().push(song.id.clone());
        }
        let mut merged = 0;
        let mut removed = 0;
        for ids in groups.values() {
            if ids.len() < 2 {
                continue;
            }
            merged += 1;
            for id in ids.iter().skip(1) {
                self.remove_song(id);
                removed += 1;
            }
        }
        (merged, removed)
    }

    pub fn missing_count(&self) -> usize {
        self.songs.iter().filter(|s| !Path::new(&s.path).exists()).count()
    }

    pub fn apply_preset(&mut self, id: &str) {
        self.settings.preset_id = id.to_string();
        let (bg, side, accent) = match id {
            "graphite" => ("#121417", "#1a1d22", "#9aa4b2"),
            "midnight" => ("#0b1020", "#11182b", "#7aa2ff"),
            "ocean" => ("#0d1518", "#132022", "#3dbbce"),
            "forest" => ("#101612", "#16201a", "#6fbf8a"),
            "rose" => ("#161014", "#20181d", "#e089a8"),
            "amber" => ("#16130e", "#1f1a14", "#e0b15a"),
            "violet" => ("#120f1a", "#1a1526", "#a78bfa"),
            "high-contrast" => ("#000000", "#0a0a0a", "#66ddff"),
            _ => {
                self.settings.bg_main = None;
                self.settings.bg_sidebar = None;
                self.settings.accent = None;
                self.settings.preset_id = "default".into();
                return;
            }
        };
        self.settings.bg_main = Some(bg.into());
        self.settings.bg_sidebar = Some(side.into());
        self.settings.accent = Some(accent.into());
    }
}

struct Tags {
    title: String,
    artist: String,
    album: String,
    year: Option<i32>,
    duration: f64,
}

fn read_tags(path: &Path) -> Tags {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Track")
        .to_string();
    let (artist, title) = split_name(&stem);
    let mut tags = Tags {
        title,
        artist,
        album: String::new(),
        year: None,
        duration: 0.0,
    };
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("mp3") {
            if let Some(id3) = read_id3(path) {
                if !id3.0.is_empty() {
                    tags.title = id3.0;
                }
                if !id3.1.is_empty() {
                    tags.artist = id3.1;
                }
                if !id3.2.is_empty() {
                    tags.album = id3.2;
                }
                tags.year = id3.3;
            }
        }
        if ext.eq_ignore_ascii_case("wav") {
            tags.duration = wav_duration(path);
        }
    }
    tags
}

fn split_name(stem: &str) -> (String, String) {
    if let Some((a, t)) = stem.split_once(" - ") {
        let artist = a.trim();
        let title = t.trim();
        if !artist.is_empty() && !title.is_empty() {
            return (artist.to_string(), title.to_string());
        }
    }
    (String::new(), stem.to_string())
}

fn read_id3(path: &Path) -> Option<(String, String, String, Option<i32>)> {
    let mut file = fs::File::open(path).ok()?;
    let mut header = [0u8; 10];
    file.read_exact(&mut header).ok()?;
    if &header[0..3] != b"ID3" {
        return None;
    }
    let size = synchsafe(&header[6..10]);
    let mut buf = vec![0u8; size.min(2_000_000)];
    let n = file.read(&mut buf).ok()?;
    buf.truncate(n);
    let mut title = String::new();
    let mut artist = String::new();
    let mut album = String::new();
    let mut year = None;
    let mut i = 0;
    while i + 10 <= buf.len() {
        let id = &buf[i..i + 4];
        if id.iter().all(|b| *b == 0) {
            break;
        }
        let frame_size = u32::from_be_bytes([buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]]) as usize;
        if frame_size == 0 || i + 10 + frame_size > buf.len() {
            break;
        }
        let data = &buf[i + 10..i + 10 + frame_size];
        let text = decode_frame(data);
        match id {
            b"TIT2" => title = text,
            b"TPE1" => artist = text,
            b"TALB" => album = text,
            b"TYER" | b"TDRC" => {
                year = text.chars().take(4).collect::<String>().parse().ok();
            }
            _ => {}
        }
        i += 10 + frame_size;
    }
    Some((title, artist, album, year))
}

fn synchsafe(bytes: &[u8]) -> usize {
    bytes.iter().fold(0usize, |acc, b| (acc << 7) | (*b as usize & 0x7f))
}

fn decode_frame(data: &[u8]) -> String {
    if data.is_empty() {
        return String::new();
    }
    let enc = data[0];
    let rest = &data[1..];
    match enc {
        0 => rest.iter().take_while(|b| **b != 0).map(|b| *b as char).collect(),
        1 | 2 => {
            let (skip, be) = if enc == 1 {
                if rest.starts_with(&[0xFF, 0xFE]) {
                    (2, false)
                } else if rest.starts_with(&[0xFE, 0xFF]) {
                    (2, true)
                } else {
                    (0, false)
                }
            } else {
                (0, true)
            };
            let bytes = &rest[skip..];
            let mut chars = Vec::new();
            let mut i = 0;
            while i + 1 < bytes.len() {
                let u = if be {
                    u16::from_be_bytes([bytes[i], bytes[i + 1]])
                } else {
                    u16::from_le_bytes([bytes[i], bytes[i + 1]])
                };
                if u == 0 {
                    break;
                }
                if let Some(c) = char::from_u32(u as u32) {
                    chars.push(c);
                }
                i += 2;
            }
            chars.into_iter().collect()
        }
        _ => String::from_utf8_lossy(rest).trim_end_matches('\0').trim().to_string(),
    }
}

fn wav_duration(path: &Path) -> f64 {
    let mut file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 0.0,
    };
    let mut header = [0u8; 44];
    if file.read_exact(&mut header).is_err() {
        return 0.0;
    }
    if &header[0..4] != b"RIFF" || &header[8..12] != b"WAVE" {
        return 0.0;
    }
    let channels = u16::from_le_bytes([header[22], header[23]]) as f64;
    let rate = u32::from_le_bytes([header[24], header[25], header[26], header[27]]) as f64;
    let bits = u16::from_le_bytes([header[34], header[35]]) as f64;
    let data_size = u32::from_le_bytes([header[40], header[41], header[42], header[43]]) as f64;
    if channels <= 0.0 || rate <= 0.0 || bits <= 0.0 {
        return 0.0;
    }
    data_size / (rate * channels * (bits / 8.0))
}

pub fn data_file(data_dir: &Path) -> PathBuf {
    data_dir.join("library.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wishlist_download_replaces_youtube_id_with_title_artist_and_cover() {
        let dir = std::env::temp_dir().join("ime-meta-proof");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("downloads")).unwrap();
        let audio = dir.join("downloads").join("dQw4w9WgXcQ.wav");
        fs::write(
            &audio,
            b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00",
        )
        .unwrap();
        let cover = dir.join("cover.png");
        fs::write(
            &cover,
            [
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
                0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
                0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE, 0x02, 0xFE, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
                0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
            ],
        )
        .unwrap();
        let mut store = Store::default();
        assert!(store.add_file(&audio));
        assert_eq!(store.songs[0].title, "dQw4w9WgXcQ");
        assert!(store.songs[0].artist.is_empty());
        assert!(store.apply_download_meta(
            &audio,
            "Младшая сестра",
            "дора",
            "Младшая сестра",
            cover.to_str().unwrap(),
        ));
        assert_eq!(store.songs[0].title, "Младшая сестра");
        assert_eq!(store.songs[0].artist, "дора");
        assert_eq!(store.songs[0].album, "Младшая сестра");
        assert_eq!(store.songs[0].cover_path, cover.to_string_lossy());
        store.settings.onboarding_done = true;
        store.save(&dir.join("library.json"));
    }
}
