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
    #[serde(default)]
    pub colors: std::collections::BTreeMap<String, String>,
    pub ffmpeg_path: String,
    pub ytdlp_path: String,
    pub ytdlp_proxy: String,
    pub last_view: String,
    #[serde(default)]
    pub favorite_artists: Vec<FavoriteArtist>,
    #[serde(default)]
    pub hotkeys: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub ui: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub wallpaper_mode: String,
    #[serde(default)]
    pub wallpaper_path: String,
    /// How many upcoming Waves tracks to download. 2–20.
    #[serde(default = "default_archive_ahead")]
    pub archive_ahead: u32,
    /// How many archived tracks to keep. The next download drops the oldest. 10–250.
    #[serde(default = "default_archive_keep")]
    pub archive_keep: u32,
    /// How many downloaded mix albums the archive keeps. 4–20.
    #[serde(default = "default_mix_keep")]
    pub archive_mix_keep: u32,
}

fn default_mix_keep() -> u32 {
    8
}

fn default_archive_ahead() -> u32 {
    3
}

fn default_archive_keep() -> u32 {
    30
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FavoriteArtist {
    pub name: String,
    #[serde(default)]
    pub deezer_id: String,
    #[serde(default)]
    pub picture: String,
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
            colors: std::collections::BTreeMap::new(),
            ffmpeg_path: String::new(),
            ytdlp_path: String::new(),
            ytdlp_proxy: String::new(),
            last_view: "home".into(),
            favorite_artists: Vec::new(),
            hotkeys: std::collections::BTreeMap::new(),
            ui: std::collections::BTreeMap::new(),
            wallpaper_mode: "none".into(),
            wallpaper_path: String::new(),
            archive_ahead: default_archive_ahead(),
            archive_keep: default_archive_keep(),
            archive_mix_keep: default_mix_keep(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ArchiveItem {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub path: String,
    #[serde(default)]
    pub cover_path: String,
    pub added_at: i64,
    #[serde(default)]
    pub mix_id: String,
    #[serde(default)]
    pub mix_title: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MixTrack {
    pub title: String,
    pub artist: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreatedMix {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub tracks: Vec<MixTrack>,
}

pub struct LibraryMix {
    pub title: String,
    pub song_ids: Vec<String>,
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
    #[serde(default)]
    pub archive: Vec<ArchiveItem>,
    #[serde(default)]
    pub created_mixes: Vec<CreatedMix>,
}

impl Default for Store {
    fn default() -> Self {
        Self {
            songs: Vec::new(),
            playlists: Vec::new(),
            history: Vec::new(),
            settings: Settings::default(),
            player: Player::default(),
            archive: Vec::new(),
            created_mixes: Vec::new(),
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

    pub fn archive_has(&self, title: &str, artist: &str) -> bool {
        self.archive.iter().any(|item| same_label(&item.title, title) && same_label(&item.artist, artist))
            || self.songs.iter().any(|song| same_label(&song.title, title) && same_label(&song.artist, artist))
    }

    pub fn archive_match(&self, title: &str, artist: &str) -> Option<&ArchiveItem> {
        self.archive.iter().find(|item| same_label(&item.title, title) && same_label(&item.artist, artist))
    }

    pub fn push_archive(&mut self, title: &str, artist: &str, path: &Path, cover_path: &str) {
        if self.archive_has(title, artist) {
            return;
        }
        self.archive.push(ArchiveItem {
            id: nid(),
            title: title.trim().to_string(),
            artist: artist.trim().to_string(),
            path: path.to_string_lossy().into_owned(),
            cover_path: cover_path.trim().to_string(),
            added_at: now_ms(),
            mix_id: String::new(),
            mix_title: String::new(),
        });
    }

    pub fn tag_latest_archive(&mut self, title: &str, artist: &str, mix_id: &str, mix_title: &str) {
        if mix_id.is_empty() {
            return;
        }
        if let Some(item) = self.archive.iter_mut().rev().find(|item| same_label(&item.title, title) && same_label(&item.artist, artist)) {
            item.mix_id = mix_id.to_string();
            item.mix_title = mix_title.to_string();
        }
    }

    /// Drop the oldest downloaded mix albums past the keep limit. Returns file paths.
    pub fn trim_mix_albums(&mut self) -> Vec<String> {
        let keep = self.settings.archive_mix_keep.clamp(4, 20) as usize;
        let mut groups: Vec<(String, i64)> = Vec::new();
        for item in &self.archive {
            if item.mix_id.is_empty() {
                continue;
            }
            if let Some(group) = groups.iter_mut().find(|(id, _)| id == &item.mix_id) {
                group.1 = group.1.min(item.added_at);
            } else {
                groups.push((item.mix_id.clone(), item.added_at));
            }
        }
        groups.sort_by_key(|(_, at)| *at);
        let mut doomed = Vec::new();
        while groups.len() > keep {
            let (id, _) = groups.remove(0);
            doomed.extend(self.delete_mix_files(&id));
        }
        doomed
    }

    pub fn delete_mix_files(&mut self, mix_id: &str) -> Vec<String> {
        let mut doomed = Vec::new();
        self.archive.retain(|item| {
            if item.mix_id == mix_id {
                doomed.push(item.path.clone());
                false
            } else {
                true
            }
        });
        doomed
    }

    /// Drop the oldest files once the archive is past its limit. Returns paths to delete.
    pub fn trim_archive(&mut self) -> Vec<String> {
        let keep = self.settings.archive_keep.clamp(10, 250) as usize;
        let mut doomed = Vec::new();
        while self.archive.len() > keep {
            doomed.push(self.archive.remove(0).path);
        }
        doomed
    }

    /// Move an archived file into the library and drop the archive row.
    pub fn promote_archive(&mut self, id: &str) -> bool {
        let Some(pos) = self.archive.iter().position(|item| item.id == id) else {
            return false;
        };
        let item = self.archive.remove(pos);
        let path = PathBuf::from(&item.path);
        if Path::new(&item.path).is_file() {
            self.add_file(&path);
            self.apply_download_meta(&path, &item.title, &item.artist, "", &item.cover_path);
        }
        true
    }

    pub fn add_file(&mut self, path: &Path) -> bool {
        self.add_file_named(path, None)
    }

    pub fn add_file_named(&mut self, path: &Path, display_stem: Option<&str>) -> bool {
        if !is_audio(path) {
            return false;
        }
        let path_str = path.to_string_lossy().to_string();
        if self.songs.iter().any(|s| s.path == path_str) {
            return false;
        }
        let meta = read_tags(path, display_stem);
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

    /// Returns whether the artist is a favorite after the click.
    pub fn toggle_favorite_artist(&mut self, name: &str, deezer_id: &str, picture: &str) -> bool {
        let name = name.trim();
        if name.is_empty() {
            return false;
        }
        if let Some(index) = self
            .settings
            .favorite_artists
            .iter()
            .position(|artist| artist.name.eq_ignore_ascii_case(name))
        {
            self.settings.favorite_artists.remove(index);
            return false;
        }
        self.settings.favorite_artists.insert(
            0,
            FavoriteArtist {
                name: name.into(),
                deezer_id: deezer_id.trim().into(),
                picture: picture.trim().into(),
            },
        );
        true
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
        if let Some(snap) = self.settings.ui.get(&format!("themeSnap.{id}")).cloned() {
            let parts: Vec<&str> = snap.split(',').collect();
            if parts.len() >= 3 {
                self.settings.bg_main = non_empty(parts[0]);
                self.settings.bg_sidebar = non_empty(parts[1]);
                self.settings.accent = non_empty(parts[2]);
                return;
            }
        }
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

    pub fn set_color(&mut self, key: &str, value: &str) {
        let key = key.trim();
        if key.is_empty() {
            return;
        }
        let value = value.trim();
        if value.is_empty() {
            self.settings.colors.remove(key);
        } else {
            self.settings.colors.insert(key.to_string(), value.to_string());
        }
        match key {
            "bgMain" => self.settings.bg_main = non_empty(value),
            "accent" => self.settings.accent = non_empty(value),
            _ => {}
        }
    }

    pub fn enqueue(&mut self, id: &str) {
        if self.song(id).is_none() || self.player.queue.iter().any(|item| item == id) {
            return;
        }
        self.player.queue.push(id.to_string());
    }

    pub fn enqueue_next(&mut self, id: &str) {
        if self.song(id).is_none() {
            return;
        }
        self.player.queue.retain(|item| item != id);
        let at = self.player.queue_index.saturating_add(1).min(self.player.queue.len());
        self.player.queue.insert(at, id.to_string());
    }

    pub fn queue_remove(&mut self, id: &str) {
        if let Some(pos) = self.player.queue.iter().position(|item| item == id) {
            self.player.queue.remove(pos);
            if pos < self.player.queue_index {
                self.player.queue_index = self.player.queue_index.saturating_sub(1);
            } else if self.player.queue_index >= self.player.queue.len() && !self.player.queue.is_empty() {
                self.player.queue_index = self.player.queue.len() - 1;
            }
        }
    }

    pub fn queue_clear(&mut self) {
        let current = self.player.current_id.clone();
        self.player.queue.clear();
        self.player.queue_index = 0;
        if let Some(id) = current {
            if self.song(&id).is_some() {
                self.player.queue.push(id);
            }
        }
    }

    pub fn update_meta(&mut self, id: &str, title: &str, artist: &str, album: &str) {
        if let Some(song) = self.songs.iter_mut().find(|song| song.id == id) {
            if !title.trim().is_empty() {
                song.title = title.trim().to_string();
            }
            song.artist = artist.trim().to_string();
            song.album = album.trim().to_string();
        }
    }

    pub fn add_to_playlist_by_name(&mut self, playlist_id: &str, song_id: &str) -> bool {
        if self.song(song_id).is_none() {
            return false;
        }
        let Some(pl) = self.playlists.iter_mut().find(|pl| pl.id == playlist_id) else {
            return false;
        };
        if !pl.song_ids.iter().any(|id| id == song_id) {
            pl.song_ids.push(song_id.to_string());
        }
        true
    }

    pub fn rebuild_autos(&mut self) -> usize {
        let liked: Vec<String> = self
            .songs
            .iter()
            .filter(|song| song.liked)
            .map(|song| song.id.clone())
            .collect();
        let mut frequent: Vec<&Song> = self.songs.iter().filter(|song| song.play_count > 0).collect();
        frequent.sort_by_key(|song| std::cmp::Reverse(song.play_count));
        let frequent: Vec<String> = frequent.into_iter().take(25).map(|song| song.id.clone()).collect();
        upsert_playlist(self, "auto-liked", "Избранное", liked);
        upsert_playlist(self, "auto-often", "Часто слушаю", frequent);
        2
    }

    pub fn backup_value(&self) -> serde_json::Value {
        let liked: Vec<_> = self
            .songs
            .iter()
            .filter(|song| song.liked)
            .map(|song| track_ref(song))
            .collect();
        let playlists: Vec<_> = self
            .playlists
            .iter()
            .filter(|pl| !pl.id.starts_with("auto-"))
            .map(|pl| {
                serde_json::json!({
                    "name": pl.name,
                    "tracks": pl.song_ids.iter().filter_map(|id| self.song(id)).map(track_ref).collect::<Vec<_>>(),
                })
            })
            .collect();
        let wishlist: Vec<_> = self
            .settings
            .wishlist
            .iter()
            .map(|wish| {
                serde_json::json!({
                    "title": wish.title,
                    "artist": wish.artist,
                    "album": wish.album,
                    "preview": wish.preview_url,
                    "cover": wish.cover_url,
                })
            })
            .collect();
        serde_json::json!({
            "format": "ime-music-library-backup",
            "version": 1,
            "liked": liked,
            "playlists": playlists,
            "wishlist": wishlist,
        })
    }

    pub fn import_backup(&mut self, value: &serde_json::Value) -> (usize, usize, usize) {
        let mut liked_applied = 0;
        if let Some(rows) = value.get("liked").and_then(|v| v.as_array()) {
            for row in rows {
                let title = row.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let artist = row.get("artist").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(song) = self.songs.iter_mut().find(|song| same_track(song, title, artist)) {
                    if !song.liked {
                        song.liked = true;
                        liked_applied += 1;
                    }
                }
            }
        }
        let mut playlists_created = 0;
        if let Some(rows) = value.get("playlists").and_then(|v| v.as_array()) {
            for row in rows {
                let name = row.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
                if name.is_empty() {
                    continue;
                }
                let id = if let Some(existing) = self.playlists.iter().find(|pl| pl.name.eq_ignore_ascii_case(name)) {
                    existing.id.clone()
                } else {
                    playlists_created += 1;
                    self.create_playlist(name)
                };
                if let Some(tracks) = row.get("tracks").and_then(|v| v.as_array()) {
                    for track in tracks {
                        let title = track.get("title").and_then(|v| v.as_str()).unwrap_or("");
                        let artist = track.get("artist").and_then(|v| v.as_str()).unwrap_or("");
                        if let Some(song) = self.songs.iter().find(|song| same_track(song, title, artist)) {
                            let song_id = song.id.clone();
                            self.add_to_playlist_by_name(&id, &song_id);
                        }
                    }
                }
            }
        }
        let mut wishlist_added = 0;
        if let Some(rows) = value.get("wishlist").and_then(|v| v.as_array()) {
            for row in rows {
                let title = row.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let artist = row.get("artist").and_then(|v| v.as_str()).unwrap_or("");
                let album = row.get("album").and_then(|v| v.as_str()).unwrap_or("");
                let preview = row.get("preview").and_then(|v| v.as_str()).unwrap_or("");
                let cover = row.get("cover").and_then(|v| v.as_str()).unwrap_or("");
                if title.trim().is_empty() {
                    continue;
                }
                let existed = self.settings.wishlist.iter().any(|wish| {
                    wish.title.eq_ignore_ascii_case(title) && wish.artist.eq_ignore_ascii_case(artist)
                });
                if !existed {
                    self.toggle_wish(title, artist, album, preview, cover);
                    wishlist_added += 1;
                }
            }
        }
        (liked_applied, playlists_created, wishlist_added)
    }

    pub fn import_track_lines(&mut self, name: &str, lines: &[(String, String)]) -> (usize, usize, usize) {
        let mut matched = 0;
        let mut unmatched = 0;
        let mut wishlist_added = 0;
        let label = if name.trim().is_empty() { "Импорт плейлиста" } else { name.trim() };
        let playlist_id = self.create_playlist(label);
        for (artist, title) in lines {
            let title = title.trim();
            let artist = artist.trim();
            if title.is_empty() {
                continue;
            }
            if let Some(song) = self.songs.iter().find(|song| same_track(song, title, artist)) {
                let id = song.id.clone();
                self.add_to_playlist_by_name(&playlist_id, &id);
                matched += 1;
            } else {
                unmatched += 1;
                let existed = self.settings.wishlist.iter().any(|wish| {
                    wish.title.eq_ignore_ascii_case(title) && wish.artist.eq_ignore_ascii_case(artist)
                });
                if !existed {
                    self.toggle_wish(title, artist, "", "", "");
                    wishlist_added += 1;
                }
            }
        }
        if matched == 0 && unmatched == 0 {
            self.playlists.retain(|pl| pl.id != playlist_id);
        }
        (matched, unmatched, wishlist_added)
    }

    pub fn fill_album(&mut self, id: &str, album: &str, year: Option<i32>) -> bool {
        let Some(song) = self.songs.iter_mut().find(|song| song.id == id) else {
            return false;
        };
        if !song.album.is_empty() || album.trim().is_empty() {
            return false;
        }
        song.album = album.trim().to_string();
        if song.year.is_none() {
            song.year = year;
        }
        true
    }

    pub fn apply_synced(&mut self, id: &str, title: &str, artist: &str, album: &str, year: Option<i32>, cover_path: Option<&str>) -> bool {
        let Some(song) = self.songs.iter_mut().find(|song| song.id == id) else {
            return false;
        };
        let mut changed = false;
        if !title.trim().is_empty() && song.title != title.trim() {
            song.title = title.trim().to_string();
            changed = true;
        }
        if !artist.trim().is_empty() && song.artist != artist.trim() {
            song.artist = artist.trim().to_string();
            changed = true;
        }
        if !album.trim().is_empty() && song.album != album.trim() {
            song.album = album.trim().to_string();
            changed = true;
        }
        if song.year.is_none() {
            if let Some(year) = year {
                song.year = Some(year);
                changed = true;
            }
        }
        if let Some(path) = cover_path.filter(|path| !path.is_empty()) {
            if song.cover_path != path {
                song.cover_path = path.to_string();
                changed = true;
            }
        }
        changed
    }
}

const FIVE_HOURS_MS: i64 = 5 * 60 * 60 * 1000;
const THREE_HOURS_MS: i64 = 3 * 60 * 60 * 1000;

struct MixKind {
    title: &'static str,
    words: &'static [&'static str],
}

const LIBRARY_KINDS: &[MixKind] = &[
    MixKind { title: "Смиксовали ваши треки в стиле рок", words: &["рок", "rock", "metal", "метал", "punk", "панк"] },
    MixKind { title: "Смиксовали ваши треки в жанре рэп", words: &["рэп", "rap", "hip", "хип"] },
    MixKind { title: "Смиксовали ваши треки в стиле поп", words: &["поп", "pop"] },
    MixKind { title: "Смиксовали ваши треки в стиле электро", words: &["electro", "электро", "edm", "techno", "техно"] },
    MixKind { title: "Смиксовали ваши треки в стиле джаз", words: &["джаз", "jazz", "blues", "блюз"] },
    MixKind { title: "Смиксовали ваши треки в стиле инди", words: &["инди", "indie", "alternative"] },
    MixKind { title: "Смиксовали ваши русские треки", words: &["рус"] },
    MixKind { title: "Смиксовали ваши зарубежные треки", words: &["лат"] },
    MixKind { title: "Смиксовали ваши любимые треки", words: &["лайк"] },
    MixKind { title: "Смиксовали то, что вы часто слушаете", words: &["часто"] },
    MixKind { title: "Смиксовали ваши новые треки", words: &["новые"] },
    MixKind { title: "Смиксовали ваши спокойные треки", words: &["ballad", "acoustic", "piano", "спокой"] },
    MixKind { title: "Смиксовали ваши танцевальные треки", words: &["dance", "house", "disco", "танц"] },
    MixKind { title: "Смиксовали ваши саундтреки", words: &["ost", "soundtrack", "саундтрек", "score"] },
    MixKind { title: "Смиксовали ваши треки в стиле соул", words: &["soul", "соул", "funk", "фанк"] },
];

fn song_blob(song: &Song) -> String {
    format!("{} {} {}", song.title, song.artist, song.album).to_lowercase()
}

fn song_matches_kind(song: &Song, words: &[&str]) -> bool {
    match words {
        ["рус"] => song.title.chars().any(|ch| ('а'..='я').contains(&ch) || ch == 'ё'),
        ["лат"] => song.title.chars().any(|ch| ch.is_ascii_alphabetic()) && !song.title.chars().any(|ch| ('а'..='я').contains(&ch)),
        ["лайк"] => song.liked,
        ["часто"] => song.play_count > 0,
        ["новые"] => true,
        _ => {
            let blob = song_blob(song);
            words.iter().any(|word| blob.contains(word))
        }
    }
}

impl Store {
    pub fn continue_song(&self) -> Option<&Song> {
        if let Some(id) = self.player.current_id.as_deref() {
            if let Some(song) = self.song(id) {
                return Some(song);
            }
        }
        self.songs
            .iter()
            .filter(|song| song.last_played_at.is_some())
            .max_by_key(|song| song.last_played_at.unwrap_or(0))
    }

    pub fn library_mixes(&self) -> Vec<LibraryMix> {
        let now = now_ms();
        if self.songs.is_empty() {
            return Vec::new();
        }
        let step = (now / FIVE_HOURS_MS).max(0) as usize;
        let want = 2 + (step % 3);
        let mut mixes = Vec::new();
        for offset in 0..LIBRARY_KINDS.len() {
            if mixes.len() >= want {
                break;
            }
            let kind = &LIBRARY_KINDS[(step + offset) % LIBRARY_KINDS.len()];
            let mut songs: Vec<&Song> = self.songs.iter().filter(|song| song_matches_kind(song, kind.words)).collect();
            if kind.words == ["новые"] {
                songs.sort_by_key(|song| std::cmp::Reverse(song.added_at));
            } else if kind.words == ["часто"] {
                songs.sort_by_key(|song| std::cmp::Reverse(song.play_count));
            }
            if songs.len() < 2 && kind.words != ["лайк"] && kind.words != ["часто"] {
                continue;
            }
            if songs.is_empty() {
                continue;
            }
            let ids: Vec<String> = songs.into_iter().take(20).map(|song| song.id.clone()).collect();
            if mixes.iter().any(|mix: &LibraryMix| mix.song_ids == ids) {
                continue;
            }
            mixes.push(LibraryMix { title: kind.title.to_string(), song_ids: ids });
        }
        if mixes.is_empty() {
            let ids: Vec<String> = self.songs.iter().take(20).map(|song| song.id.clone()).collect();
            mixes.push(LibraryMix { title: "Смиксовали ваши треки".into(), song_ids: ids });
        }
        mixes
    }

    pub fn create_external_mixes(&mut self) -> Result<(), &'static str> {
        let now = now_ms();
        if let Some(existing) = self.created_mixes.first() {
            if now.saturating_sub(existing.created_at) < THREE_HOURS_MS {
                return Err("Миксы можно обновить раз в 3 часа");
            }
        }
        let step = (now / THREE_HOURS_MS).max(0) as usize;
        let want = 2 + (step % 3);
        let mut mixes = Vec::new();
        for offset in 0..EXTERNAL_MIXES.len() {
            if mixes.len() >= want {
                break;
            }
            let kind = &EXTERNAL_MIXES[(step.wrapping_mul(2) + offset) % EXTERNAL_MIXES.len()];
            let tracks = kind
                .tracks
                .iter()
                .filter(|(title, artist)| !self.songs.iter().any(|song| same_label(&song.title, title) && same_label(&song.artist, artist)))
                .take(20)
                .map(|(title, artist)| MixTrack { title: (*title).to_string(), artist: (*artist).to_string() })
                .collect::<Vec<_>>();
            if tracks.is_empty() {
                continue;
            }
            mixes.push(CreatedMix {
                id: format!("mix-{}-{}", step, offset),
                title: kind.title.to_string(),
                created_at: now,
                tracks,
            });
        }
        if mixes.is_empty() {
            return Err("Не удалось собрать миксы");
        }
        self.created_mixes = mixes;
        Ok(())
    }

    pub fn mix_refresh_wait_ms(&self) -> i64 {
        let Some(mix) = self.created_mixes.first() else {
            return 0;
        };
        (THREE_HOURS_MS - now_ms().saturating_sub(mix.created_at)).max(0)
    }
}

struct ExternalKind {
    title: &'static str,
    tracks: &'static [(&'static str, &'static str)],
}

const EXTERNAL_MIXES: &[ExternalKind] = &[
    ExternalKind { title: "Микс в стиле рок", tracks: &[("Bohemian Rhapsody", "Queen"), ("Smells Like Teen Spirit", "Nirvana"), ("Back in Black", "AC/DC"), ("Wonderwall", "Oasis"), ("Enter Sandman", "Metallica")] },
    ExternalKind { title: "Микс в жанре рэп", tracks: &[("Lose Yourself", "Eminem"), ("HUMBLE.", "Kendrick Lamar"), ("Sicko Mode", "Travis Scott"), ("God's Plan", "Drake"), ("In Da Club", "50 Cent")] },
    ExternalKind { title: "Микс в стиле поп", tracks: &[("Blinding Lights", "The Weeknd"), ("Levitating", "Dua Lipa"), ("Anti-Hero", "Taylor Swift"), ("As It Was", "Harry Styles"), ("Flowers", "Miley Cyrus")] },
    ExternalKind { title: "Микс в стиле электро", tracks: &[("One More Time", "Daft Punk"), ("Levels", "Avicii"), ("Titanium", "David Guetta"), ("Strobe", "deadmau5"), ("Opus", "Eric Prydz")] },
    ExternalKind { title: "Микс в стиле джаз", tracks: &[("Take Five", "Dave Brubeck"), ("So What", "Miles Davis"), ("Feeling Good", "Nina Simone"), ("Fly Me to the Moon", "Frank Sinatra"), ("What a Wonderful World", "Louis Armstrong")] },
    ExternalKind { title: "Микс в стиле инди", tracks: &[("Do I Wanna Know?", "Arctic Monkeys"), ("Somebody Else", "The 1975"), ("Electric Feel", "MGMT"), ("R U Mine?", "Arctic Monkeys"), ("Fluorescent Adolescent", "Arctic Monkeys")] },
    ExternalKind { title: "Микс в стиле соул", tracks: &[("Respect", "Aretha Franklin"), ("Superstition", "Stevie Wonder"), ("I Want You Back", "The Jackson 5"), ("Ain't No Sunshine", "Bill Withers"), ("Lovely Day", "Bill Withers")] },
    ExternalKind { title: "Микс в стиле метал", tracks: &[("Master of Puppets", "Metallica"), ("Chop Suey!", "System of a Down"), ("Du Hast", "Rammstein"), ("Toxicity", "System of a Down"), ("The Trooper", "Iron Maiden")] },
    ExternalKind { title: "Микс в стиле фолк", tracks: &[("The Sound of Silence", "Simon & Garfunkel"), ("Fast Car", "Tracy Chapman"), ("Heart of Gold", "Neil Young"), ("Both Sides Now", "Joni Mitchell"), ("Big Yellow Taxi", "Joni Mitchell")] },
    ExternalKind { title: "Микс в стиле латина", tracks: &[("Despacito", "Luis Fonsi"), ("Livin' la Vida Loca", "Ricky Martin"), ("Bailando", "Enrique Iglesias"), ("Provenza", "Karol G"), ("Tití Me Preguntó", "Bad Bunny")] },
    ExternalKind { title: "Микс в стиле k-pop", tracks: &[("Dynamite", "BTS"), ("How You Like That", "BLACKPINK"), ("Butter", "BTS"), ("Pink Venom", "BLACKPINK"), ("Cupid", "FIFTY FIFTY")] },
    ExternalKind { title: "Микс в стиле классика", tracks: &[("Für Elise", "Ludwig van Beethoven"), ("Clair de Lune", "Claude Debussy"), ("The Four Seasons", "Antonio Vivaldi"), ("Nocturne Op. 9 No. 2", "Frédéric Chopin"), ("Moonlight Sonata", "Ludwig van Beethoven")] },
    ExternalKind { title: "Микс из саундтреков", tracks: &[("Cornfield Chase", "Hans Zimmer"), ("Time", "Hans Zimmer"), ("Now We Are Free", "Lisa Gerrard"), ("Married Life", "Michael Giacchino"), ("Comptine d'un autre été", "Yann Tiersen")] },
    ExternalKind { title: "Микс в стиле лоуфай", tracks: &[("Snowman", "WYS"), ("Coffee", "beabadoobee"), ("Sunset Lover", "Petit Biscuit"), ("Night Owl", "Galimatias"), ("Weightless", "Marconi Union")] },
    ExternalKind { title: "Микс в стиле диско", tracks: &[("Stayin' Alive", "Bee Gees"), ("Le Freak", "Chic"), ("I Will Survive", "Gloria Gaynor"), ("Don't Stop 'Til You Get Enough", "Michael Jackson"), ("September", "Earth, Wind & Fire")] },
];

fn same_label(left: &str, right: &str) -> bool {
    fn norm(value: &str) -> String {
        value.trim().to_lowercase().replace('ё', "е").split_whitespace().collect::<Vec<_>>().join(" ")
    }
    let left = norm(left);
    !left.is_empty() && left == norm(right)
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() { None } else { Some(value.to_string()) }
}

fn track_ref(song: &Song) -> serde_json::Value {
    serde_json::json!({
        "title": song.title,
        "artist": song.artist,
        "album": song.album,
    })
}

fn same_track(song: &Song, title: &str, artist: &str) -> bool {
    song.title.eq_ignore_ascii_case(title.trim())
        && (artist.trim().is_empty() || song.artist.eq_ignore_ascii_case(artist.trim()))
}

fn upsert_playlist(store: &mut Store, id: &str, name: &str, song_ids: Vec<String>) {
    if let Some(pl) = store.playlists.iter_mut().find(|pl| pl.id == id) {
        pl.name = name.to_string();
        pl.song_ids = song_ids;
        return;
    }
    store.playlists.push(Playlist {
        id: id.to_string(),
        name: name.to_string(),
        song_ids,
    });
}

struct Tags {
    title: String,
    artist: String,
    album: String,
    year: Option<i32>,
    duration: f64,
}

fn read_tags(path: &Path, display_stem: Option<&str>) -> Tags {
    let stem = display_stem
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Track")
                .to_string()
        });
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
                if !id3.title.is_empty() {
                    tags.title = id3.title;
                }
                if !id3.artist.is_empty() {
                    tags.artist = id3.artist;
                }
                if !id3.album.is_empty() {
                    tags.album = id3.album;
                }
                tags.year = id3.year;
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

pub fn embedded_tags(path: &Path) -> Option<(String, String, String, Option<i32>, Option<Vec<u8>>)> {
    let id3 = read_id3(path)?;
    Some((id3.title, id3.artist, id3.album, id3.year, id3.cover))
}

fn read_id3(path: &Path) -> Option<Id3> {
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
    let mut cover = None;
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
            b"APIC" => {
                if cover.is_none() {
                    cover = apic_bytes(data);
                }
            }
            _ => {}
        }
        i += 10 + frame_size;
    }
    Some(Id3 { title, artist, album, year, cover })
}

struct Id3 {
    title: String,
    artist: String,
    album: String,
    year: Option<i32>,
    cover: Option<Vec<u8>>,
}

fn apic_bytes(data: &[u8]) -> Option<Vec<u8>> {
    if data.len() < 4 {
        return None;
    }
    let mime_end = data[1..].iter().position(|b| *b == 0)? + 1;
    let mut i = mime_end + 2;
    if i >= data.len() {
        return None;
    }
    let encoding = data[0];
    if encoding == 1 || encoding == 2 {
        while i + 1 < data.len() && !(data[i] == 0 && data[i + 1] == 0) {
            i += 2;
        }
        i += 2;
    } else {
        i = data[i..].iter().position(|b| *b == 0).map(|pos| i + pos + 1)?;
    }
    if i >= data.len() {
        return None;
    }
    let bytes = data[i..].to_vec();
    if bytes.len() < 32 {
        return None;
    }
    Some(bytes)
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
