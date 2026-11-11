#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod bundle;
#[cfg(target_os = "windows")]
mod window;
mod i18n;
mod icons;
mod model;
mod render;
mod ytdlp;
mod waves;

use axum::extract::{DefaultBodyLimit, Multipart, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Form, Json, Router};
use model::{data_file, Store};
use render::{render, Screen};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tower_http::services::ServeDir;

struct SyncSession {
    token: String,
    expires_at: i64,
    files: u32,
    bytes: u64,
}

struct AppState {
    store: Mutex<Store>,
    data_path: PathBuf,
    static_dir: PathBuf,
    sync: Mutex<Option<SyncSession>>,
    import_status: Arc<Mutex<ImportLive>>,
    archive_inflight: Mutex<std::collections::HashSet<String>>,
}

#[derive(Clone)]
struct ImportLive {
    active: bool,
    label: String,
    message: String,
    percent: Option<u8>,
    done: bool,
    ok: bool,
}

#[derive(Deserialize, Default)]
struct PageQuery {
    view: Option<String>,
    playlist: Option<String>,
    settings: Option<String>,
    section: Option<String>,
    q: Option<String>,
    modal: Option<String>,
}

#[derive(Deserialize, Default)]
struct ActForm {
    action: Option<String>,
    field: Option<String>,
    value: Option<String>,
    id: Option<String>,
    name: Option<String>,
    path: Option<String>,
    back: Option<String>,
    ajax: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    url: Option<String>,
    cover: Option<String>,
    album: Option<String>,
    start: Option<String>,
    end: Option<String>,
    video: Option<String>,
}

fn main() {
    #[cfg(target_os = "windows")]
    std::panic::set_hook(Box::new(|info| {
        windows_message(&format!("IMe Music не запустился:\n{info}"));
    }));

    let (static_dir, data_dir) = app_dirs();
    bundle::ensure_static(&static_dir);
    let data_path = data_file(&data_dir);
    let store = Store::load(&data_path);
    let state = Arc::new(AppState {
        store: Mutex::new(store),
        data_path,
        static_dir: static_dir.clone(),
        sync: Mutex::new(None),
        import_status: Arc::new(Mutex::new(ImportLive {
            active: false,
            label: String::new(),
            message: String::new(),
            percent: None,
            done: true,
            ok: true,
        })),
        archive_inflight: Mutex::new(std::collections::HashSet::new()),
    });
    let port: u16 = std::env::var("IME_RS_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4173);

    let app = Router::new()
        .route("/", get(index))
        .route("/act", post(act))
        .route("/import", post(import_files))
        .route("/wallpaper", post(upload_wallpaper))
        .route("/wallpaper-image", get(wallpaper_image))
        .route("/import-path", post(import_path))
        .route("/import-search", post(import_search))
        .route("/api/archive/fetch", post(archive_fetch))
        .route("/api/archive/match", get(archive_match))
        .route("/api/track/search", get(track_search))
        .route("/api/track/preview", get(track_preview))
        .route("/api/track/replace", post(track_replace))
        .route("/import-status", get(import_status))
        .route("/audio/:id", get(audio))
        .route("/cover/:id", get(cover_file))
        .route("/api/state", get(api_state))
        .route("/api/queue", get(api_queue))
        .route("/api/deezer", get(deezer_proxy))
        .route("/api/waves", get(waves_pool))
        .route("/api/updates", get(api_updates))
        .route("/backup", get(backup_download))
        .route("/import-backup", post(import_backup))
        .route("/api/playlist", post(import_playlist))
        .route("/api/meta", post(meta_sync))
        .route("/api/phone/start", post(phone_start))
        .route("/api/phone/stop", post(phone_stop))
        .route("/sync/info", get(sync_info))
        .route("/sync/join", get(sync_join))
        .route("/sync/offer", post(sync_offer))
        .route("/sync/file/:id", get(sync_file))
        .route("/sync/done", post(sync_done))
        .nest_service("/brand", ServeDir::new(static_dir.join("brand")))
        .route("/index.css", get(css))
        .route("/player.js", get(player_js))
        .route("/favicon.png", get(favicon))
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .with_state(state);

    let (url_tx, url_rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        // Bind and accept on the same Tokio runtime. A listener created on
        // another runtime never wakes accept(), so the window stays blank.
        let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
            Ok(runtime) => runtime,
            Err(_) => return,
        };
        runtime.block_on(async move {
            let mut bound = None;
            let mut url = String::new();
            for candidate in port..port.saturating_add(20) {
                let addr = format!("127.0.0.1:{candidate}");
                if let Ok(listener) = tokio::net::TcpListener::bind(&addr).await {
                    url = format!("http://{addr}");
                    bound = Some(listener);
                    break;
                }
            }
            let Some(listener) = bound else {
                let _ = url_tx.send(String::new());
                return;
            };
            let _ = url_tx.send(url);
            let _ = axum::serve(listener, app).await;
        });
    });
    let url = url_rx.recv().unwrap_or_default();
    if url.is_empty() {
        fail(&format!("Не удалось открыть порт {port}."));
    }
    if let Err(err) = wait_for_player_page(&url) {
        fail(&format!("Окно IMe Music не получило интерфейс.\n{err}"));
    }

    #[cfg(target_os = "windows")]
    window::open(&url);
    #[cfg(not(target_os = "windows"))]
    std::thread::park();
}

fn wait_for_player_page(url: &str) -> Result<(), String> {
    let host = url.trim_start_matches("http://");
    let addr: std::net::SocketAddr = host
        .parse()
        .map_err(|_| format!("Некорректный адрес {url}"))?;
    for _ in 0..50 {
        if let Ok(mut stream) = std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(200)) {
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(2)));
            let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(2)));
            let request = format!("GET / HTTP/1.0\r\nHost: {host}\r\nConnection: close\r\n\r\n");
            if std::io::Write::write_all(&mut stream, request.as_bytes()).is_ok() {
                let mut response = String::new();
                if std::io::Read::read_to_string(&mut stream, &mut response).is_ok()
                    && response.contains("id=\"root\"")
                    && response.contains("player-bar")
                {
                    return Ok(());
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }
    Err(format!("Сервер {url} не отдал экран плеера."))
}

fn fail(message: &str) -> ! {
    #[cfg(target_os = "windows")]
    windows_message(message);
    #[cfg(not(target_os = "windows"))]
    eprintln!("{message}");
    std::process::exit(1);
}

#[cfg(target_os = "windows")]
fn wide(text: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn windows_message(text: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut core::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            kind: u32,
        ) -> i32;
    }
    let body = wide(text);
    let title = wide("IMe Music");
    unsafe {
        MessageBoxW(std::ptr::null_mut(), body.as_ptr(), title.as_ptr(), 0x40);
    }
}

fn screen_from(q: &PageQuery, store: &Store) -> Screen {
    let view = q
        .view
        .clone()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| {
            if store.settings.behavior.restore_last_page {
                store.settings.last_view.clone()
            } else {
                store.settings.behavior.start_view.clone()
            }
        });
    let view = if view.is_empty() { "home".into() } else { view };
    Screen {
        view,
        playlist: q.playlist.clone().unwrap_or_default(),
        settings: q.settings.clone().unwrap_or_default(),
        section: q.section.clone().unwrap_or_default(),
        search: q.q.clone().unwrap_or_default(),
        modal: q.modal.clone().unwrap_or_default(),
    }
}

#[derive(Deserialize)]
struct DeezerQuery {
    path: String,
}

/// Deezer has no browser CORS header, so the desktop page asks this proxy.
async fn deezer_proxy(Query(query): Query<DeezerQuery>) -> Response {
    let path = query.path.trim();
    let allowed = path.starts_with("/search/")
        || path.starts_with("/artist/")
        || path.starts_with("/track/")
        || path.starts_with("/album/")
        || path.starts_with("/chart/");
    if !allowed || path.contains("://") || path.contains("..") || path.contains('\n') {
        return (StatusCode::BAD_REQUEST, "bad path").into_response();
    }
    let url = format!("https://api.deezer.com{path}");
    let fetched = tokio::task::spawn_blocking(move || {
        ureq::get(&url)
            .timeout(std::time::Duration::from_secs(12))
            .call()
            .map_err(|err| err.to_string())
            .and_then(|response| response.into_string().map_err(|err| err.to_string()))
    })
    .await;
    match fetched {
        Ok(Ok(body)) => (
            [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
            body,
        )
            .into_response(),
        _ => (StatusCode::BAD_GATEWAY, "deezer").into_response(),
    }
}

async fn index(State(state): State<Arc<AppState>>, Query(q): Query<PageQuery>) -> Html<String> {
    let store = state.store.lock().expect("store");
    let screen = screen_from(&q, &store);
    let i18n = i18n::I18n::load(&state.static_dir.join("i18n"), &store.settings.locale);
    Html(render(&store, &i18n, &screen))
}

fn save(state: &AppState, store: &Store) {
    store.save(&state.data_path);
}

fn trim_json(ok: bool, message: &str, duration: f64, id: &str) -> Response {
    (
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::json!({
            "ok": ok,
            "id": id,
            "message": message,
            "detail": { "duration": duration },
        })
        .to_string(),
    )
        .into_response()
}

fn hidden_cmd(bin: &str) -> std::process::Command {
    let mut command = std::process::Command::new(bin);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

fn resolve_tool(configured: &str, name: &str) -> Option<String> {
    let mut candidates = Vec::new();
    let trimmed = configured.trim();
    if !trimmed.is_empty() {
        let path = std::path::Path::new(trimmed);
        if path.is_dir() {
            candidates.push(path.join(name).to_string_lossy().into_owned());
            candidates.push(path.join(format!("{name}.exe")).to_string_lossy().into_owned());
        } else if let Some(file_name) = path.file_name().and_then(|item| item.to_str()) {
            let swapped = if file_name.to_ascii_lowercase().starts_with("ffmpeg") {
                file_name.replacen("ffmpeg", name, 1)
            } else {
                name.to_string()
            };
            if let Some(parent) = path.parent() {
                candidates.push(parent.join(swapped).to_string_lossy().into_owned());
            }
            if name == "ffmpeg" {
                candidates.push(trimmed.to_string());
            }
        }
    }
    candidates.push(name.into());
    candidates.push(format!("{name}.exe"));
    candidates.into_iter().find(|bin| {
        hidden_cmd(bin)
            .arg("-version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    })
}

fn audio_codec(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "mp3" => "libmp3lame",
        "m4a" | "aac" | "mp4" => "aac",
        "flac" => "flac",
        "wav" => "pcm_s16le",
        "ogg" => "libvorbis",
        _ => "libopus",
    }
}

fn cut_audio(bin: &str, src: &std::path::Path, dest: &std::path::Path, start: f64, end: f64) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let ext = dest.extension().and_then(|item| item.to_str()).unwrap_or("webm");
    let start_s = format!("{start:.3}");
    let length_s = format!("{:.3}", (end - start).max(0.0));
    let output = hidden_cmd(bin)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(src)
        .args(["-ss", &start_s, "-t", &length_s, "-vn", "-map", "0:a:0", "-c:a", audio_codec(ext)])
        .arg(dest)
        .output()
        .map_err(|err| err.to_string())?;
    let size = std::fs::metadata(dest).map(|meta| meta.len()).unwrap_or(0);
    if !output.status.success() || size < 64 {
        let _ = std::fs::remove_file(dest);
        let err = String::from_utf8_lossy(&output.stderr);
        let line = err.lines().map(str::trim).find(|line| !line.is_empty()).unwrap_or("ffmpeg");
        return Err(line.chars().take(180).collect());
    }
    Ok(())
}

fn probe_duration(ffprobe: &str, path: &std::path::Path) -> Option<f64> {
    let output = hidden_cmd(ffprobe)
        .args(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0"])
        .arg(path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.trim().parse::<f64>().ok().filter(|value| value.is_finite() && *value > 0.0)
}

fn trim_dest(src: &std::path::Path, id: &str) -> std::path::PathBuf {
    let ext = src.extension().and_then(|item| item.to_str()).unwrap_or("webm");
    let dir = src.parent().unwrap_or_else(|| std::path::Path::new("."));
    let mut dest = dir.join(format!("{id}.trim.{ext}"));
    let mut n = 2u32;
    while dest.exists() {
        dest = dir.join(format!("{id}.trim-{n}.{ext}"));
        n += 1;
    }
    dest
}

async fn trim_song(state: Arc<AppState>, form: ActForm) -> Response {
    let id = form.id.clone().unwrap_or_default();
    let start_in = form.start.as_deref().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let end_in = form.end.as_deref().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    let (src, file_duration, ffmpeg_cfg) = {
        let store = state.store.lock().expect("store");
        let Some(song) = store.song(&id) else {
            return trim_json(false, "Не удалось обрезать: трек не найден", 0.0, &id);
        };
        (std::path::PathBuf::from(&song.path), song.duration, store.settings.ffmpeg_path.clone())
    };
    let mut start = if start_in.is_finite() { start_in.max(0.0) } else { 0.0 };
    let mut end = if end_in.is_finite() { end_in.max(0.0) } else { 0.0 };
    if file_duration > 0.0 {
        start = start.min(file_duration);
        if end <= 0.0 || end > file_duration + 0.05 {
            end = file_duration;
        }
    }
    if end < start {
        std::mem::swap(&mut start, &mut end);
    }
    if end - start < 0.5 {
        return trim_json(false, "Не удалось сохранить отрезок", 0.0, &id);
    }
    let Some(bin) = resolve_tool(&ffmpeg_cfg, "ffmpeg") else {
        return trim_json(false, "Не удалось обрезать: не найден FFmpeg", 0.0, &id);
    };
    let dest = trim_dest(&src, &id);
    let src_job = src.clone();
    let dest_job = dest.clone();
    let bin_job = bin.clone();
    let cut = tokio::task::spawn_blocking(move || cut_audio(&bin_job, &src_job, &dest_job, start, end)).await;
    if let Err(err) = cut.unwrap_or_else(|_| Err("Не удалось обрезать файл".into())) {
        return trim_json(false, &format!("Не удалось обрезать: {err}"), 0.0, &id);
    }
    let probed = resolve_tool(&ffmpeg_cfg, "ffprobe").and_then(|probe| probe_duration(&probe, &dest));
    let new_duration = probed.unwrap_or(end - start);
    let mut store = state.store.lock().expect("store");
    if let Err(err) = store.replace_song_file(&id, &dest) {
        let _ = std::fs::remove_file(&dest);
        return trim_json(false, &format!("Не удалось обрезать: {err}"), 0.0, &id);
    }
    if let Some(song) = store.songs.iter_mut().find(|song| song.id == id) {
        song.duration = new_duration;
        song.trim_start = 0.0;
        song.trim_end = 0.0;
    }
    save(&state, &store);
    trim_json(true, "Отрезок сохранён", new_duration, &id)
}

async fn act(State(state): State<Arc<AppState>>, Form(form): Form<ActForm>) -> Response {
    let back = form.back.clone().unwrap_or_else(|| "/".into());
    let ajax = form.ajax.as_deref() == Some("1");
    let action = form.action.clone().unwrap_or_default();
    if action == "trim" {
        return trim_song(state, form).await;
    }
    let mut store = state.store.lock().expect("store");
    let i18n = i18n::I18n::load(&state.static_dir.join("i18n"), &store.settings.locale);
    let mut message = String::new();
    let mut detail = serde_json::json!({});
    match action.as_str() {
        "set" => apply_field(&mut store, form.field.as_deref().unwrap_or(""), form.value.as_deref().unwrap_or("")),
        "preset" => {
            if let Some(id) = form.value.as_deref() {
                store.apply_preset(id);
            }
        }
        "collapse" => store.settings.sidebar_collapsed = !store.settings.sidebar_collapsed,
        "like" => {
            if let Some(id) = form.id.as_deref() {
                store.toggle_like(id);
            }
        }
        "play" => {
            if let Some(id) = form.id.clone().or(form.value.clone()) {
                store.play(&id);
            }
        }
        "pause" => store.pause(),
        "resume" => store.resume(),
        "next" => {
            store.next();
        }
        "prev" => {
            store.prev();
        }
        "shuffle" => store.settings.playback.shuffle = !store.settings.playback.shuffle,
        "repeat" => {
            store.settings.playback.repeat = match store.settings.playback.repeat.as_str() {
                "off" => "all",
                "all" => "one",
                _ => "off",
            }
            .into();
        }
        "mute" => {
            store.settings.muted = !store.settings.muted;
            if store.settings.muted {
                store.settings.volume = 0.0;
            } else if store.settings.volume <= 0.0 {
                store.settings.volume = 0.8;
            }
        }
        "wish" => {
            store.toggle_wish(
                form.title.as_deref().unwrap_or(""),
                form.artist.as_deref().unwrap_or(""),
                form.album.as_deref().unwrap_or(""),
                form.url.as_deref().unwrap_or(""),
                form.cover.as_deref().unwrap_or(""),
            );
        }
        "create-mixes" => match store.create_external_mixes() {
            Ok(()) => message = "Миксы собраны".into(),
            Err(text) => message = text.into(),
        },
        "delete-mix" => {
            if let Some(id) = form.id.as_deref() {
                for path in store.delete_mix_files(id) {
                    let _ = std::fs::remove_file(path);
                }
                message = "Микс удалён из архива".into();
            }
        }
        "archive-to-library" => {
            if let Some(id) = form.id.as_deref() {
                let previous = store
                    .archive
                    .iter()
                    .find(|item| item.id == id)
                    .map(|item| (item.title.clone(), item.artist.clone(), item.path.clone()));
                if store.promote_archive(id) {
                    message = "Трек добавлен в библиотеку".into();
                    if let Some((title, artist, path)) = previous {
                        if let Some(song) = store.songs.iter().find(|song| song.path == path) {
                            detail = serde_json::json!({
                                "library": true,
                                "id": song.id,
                                "title": title,
                                "artist": artist,
                            });
                        }
                    }
                }
            }
        }
        "favorite-artist" => {
            let on = store.toggle_favorite_artist(
                form.artist.as_deref().or(form.title.as_deref()).unwrap_or(""),
                form.id.as_deref().unwrap_or(""),
                form.cover.as_deref().unwrap_or(""),
            );
            message = if on {
                "Артист добавлен в избранное".into()
            } else {
                "Артист убран из избранного".into()
            };
            detail = serde_json::json!({ "favorite": on });
        }
        "open-url" => {
            if let Some(url) = form.url.as_deref().or(form.value.as_deref()) {
                if let Some(url) = external_url(url) {
                    open_external(&url);
                    message = "Открываю".into();
                    detail = serde_json::json!({ "url": url });
                }
            }
        }
        "waves-reset" => {
            let heard = store.settings.waves.heard.clone();
            let spin = store.settings.waves.spin;
            store.settings.waves = model::Waves::default();
            store.settings.waves.heard = heard;
            store.settings.waves.spin = spin;
            message = "Настройки волны сброшены".into();
        }
        "waves-setting" => {
            waves::apply_setting(
                &mut store.settings.waves,
                form.field.as_deref().unwrap_or(""),
                form.value.as_deref().unwrap_or(""),
            );
        }
        "waves-heard" => {
            if let Some(url) = form.url.as_deref().or(form.value.as_deref()) {
                store.remember_wave(url);
            }
        }
        "volume" => {
            if let Some(value) = form.value.as_deref() {
                if let Ok(level) = value.parse::<f32>() {
                    let level = level.clamp(0.0, 1.0);
                    store.settings.volume = level;
                    store.settings.muted = level == 0.0;
                }
            }
        }
        "sort" => {
            if let Some(value) = form.value.as_deref() {
                if let Some((by, order)) = value.split_once(':') {
                    store.settings.sort_by = by.into();
                    store.settings.sort_order = order.into();
                }
            }
        }
        "create-playlist" => {
            let name = form.name.unwrap_or_else(|| "Playlist".into());
            if !name.trim().is_empty() {
                store.create_playlist(&name);
            }
        }
        "onboard-done" => store.settings.onboarding_done = true,
        "onboard-next" => store.settings.onboarding_done = true,
        "reset-general" => {
            store.settings.theme = "dark".into();
            store.settings.show_sidebar = true;
            store.settings.show_queue = true;
            store.settings.show_search = true;
        }
        "reset-behavior" => store.settings.behavior = model::Behavior::default(),
        "reset-wallpaper" => {
            store.settings.wallpaper_mode = "none".into();
            store.settings.wallpaper_path.clear();
        }
        "reset-hotkeys" => store.settings.hotkeys.clear(),
        "reset-ui" => {
            let prefix = form.value.clone().unwrap_or_default();
            if !prefix.is_empty() && prefix.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '_') {
                store.settings.ui.retain(|key, _| !key.starts_with(&prefix));
            }
        }
        "reset-all" => {
            let ytdlp_path = store.settings.ytdlp_path.clone();
            let ytdlp_proxy = store.settings.ytdlp_proxy.clone();
            let wishlist = store.settings.wishlist.clone();
            let favorites = store.settings.favorite_artists.clone();
            let heard = store.settings.waves.heard.clone();
            let spin = store.settings.waves.spin;
            store.settings = model::Settings::default();
            store.settings.ytdlp_path = ytdlp_path;
            store.settings.ytdlp_proxy = ytdlp_proxy;
            store.settings.wishlist = wishlist;
            store.settings.favorite_artists = favorites;
            store.settings.waves.heard = heard;
            store.settings.waves.spin = spin;
            store.settings.onboarding_done = true;
        }
        "reset-preset" | "reset-section" => store.apply_preset("default"),
        "wallpaper" => {
            let mode = form.value.clone().unwrap_or_default();
            if matches!(
                mode.as_str(),
                "none" | "full" | "stretch" | "crop" | "fit" | "contain" | "window" | "content" | "fitBlur"
            ) {
                store.settings.wallpaper_mode = mode;
            }
        }
        "save-preset" => {
            let name = form.name.clone().unwrap_or_else(|| "Своя".into());
            let name = name.trim();
            if !name.is_empty() && name.len() < 40 {
                let id = slug_id(name);
                let bg = store.settings.bg_main.clone().unwrap_or_else(|| "#111315".into());
                let side = store.settings.bg_sidebar.clone().unwrap_or_else(|| "#181b1f".into());
                let accent = store.settings.accent.clone().unwrap_or_else(|| "#6ea8fe".into());
                store.settings.ui.insert(format!("themeSnap.{id}"), format!("{bg},{side},{accent}"));
                let mut entries: Vec<(String, String)> = theme_entries(&store.settings.ui);
                if !entries.iter().any(|(item, _)| item == &id) {
                    entries.push((id, name.to_string()));
                } else if let Some(item) = entries.iter_mut().find(|(item, _)| item == &id) {
                    item.1 = name.to_string();
                }
                store.settings.ui.insert("themeList".into(), encode_themes(&entries));
                message = "Тема сохранена".into();
            }
        }
        "delete-preset" => {
            if let Some(id) = form.value.clone() {
                store.settings.ui.remove(&format!("themeSnap.{id}"));
                let entries: Vec<(String, String)> = theme_entries(&store.settings.ui)
                    .into_iter()
                    .filter(|(item, _)| item != &id)
                    .collect();
                store.settings.ui.insert("themeList".into(), encode_themes(&entries));
                if store.settings.preset_id == id {
                    store.apply_preset("default");
                }
            }
        }
        "import-path" => {
            if let Some(path) = form.path.or(form.value) {
                store.import_path(std::path::Path::new(&path));
            }
        }
        "find-dupes" => {
            let groups = store.duplicate_groups();
            detail = serde_json::json!({ "groups": groups });
            message = if groups == 0 {
                i18n.t("tools.repairNone")
            } else {
                i18n.tf("tools.repairFound", &[("groups", &groups.to_string())])
            };
        }
        "merge-dupes" => {
            let (merged, removed) = store.merge_duplicates();
            detail = serde_json::json!({ "merged": merged, "removed": removed });
            message = if merged == 0 {
                i18n.t("tools.repairNone")
            } else {
                i18n.tf("tools.repairMerged", &[("merged", &merged.to_string()), ("removed", &removed.to_string())])
            };
        }
        "rebuild-autos" => {
            let count = store.rebuild_autos();
            detail = serde_json::json!({ "count": count });
            message = i18n.tf("tools.autosUpdated", &[("count", &count.to_string())]);
        }
        "queue-add" => {
            if let Some(id) = form.id.as_deref() {
                store.enqueue(id);
                message = i18n.t("menu.queueToast");
            }
        }
        "queue-next" => {
            if let Some(id) = form.id.as_deref() {
                store.enqueue_next(id);
                message = i18n.t("menu.nextToast");
            }
        }
        "queue-remove" => {
            if let Some(id) = form.id.as_deref() {
                store.queue_remove(id);
            }
        }
        "queue-clear" => store.queue_clear(),
        "delete-song" => {
            if let Some(id) = form.id.as_deref() {
                store.remove_song(id);
            }
        }
        "update-meta" => {
            if let Some(id) = form.id.as_deref() {
                store.update_meta(
                    id,
                    form.title.as_deref().unwrap_or(""),
                    form.artist.as_deref().unwrap_or(""),
                    form.album.as_deref().unwrap_or(""),
                );
            }
        }
        "add-playlist" => {
            if let (Some(id), Some(playlist)) = (form.id.as_deref(), form.value.as_deref().or(form.name.as_deref())) {
                store.add_to_playlist_by_name(playlist, id);
            }
        }
        "set-color" => {
            store.set_color(form.field.as_deref().unwrap_or(""), form.value.as_deref().unwrap_or(""));
        }
        "reveal" => {
            if let Some(id) = form.id.as_deref() {
                if let Some(song) = store.song(id) {
                    message = song.path.clone();
                    detail = serde_json::json!({ "path": song.path });
                    let folder = std::path::Path::new(&song.path)
                        .parent()
                        .map(|dir| dir.to_path_buf());
                    if let Some(folder) = folder {
                        let _ = std::process::Command::new("xdg-open").arg(folder).spawn();
                    }
                }
            }
        }
        "refresh" | "check-updates" | "export-backup" | "youtube" | "enrich" => {}
        _ => {}
    }
    if let Some(view) = back.split("view=").nth(1).and_then(|s| s.split('&').next()) {
        if !view.is_empty() {
            store.settings.last_view = urlencoding::decode(view).unwrap_or_default().into_owned();
        }
    }
    let current = store.player.current_id.clone();
    let current_song = current
        .as_ref()
        .and_then(|id| store.songs.iter().find(|song| &song.id == id));
    let current_title = current_song.map(|song| song.title.clone()).unwrap_or_default();
    let current_artist = current_song.map(|song| song.artist.clone()).unwrap_or_default();
    save(&state, &store);
    if ajax {
        return (
            [(header::CONTENT_TYPE, "application/json")],
            serde_json::json!({
                "ok": true,
                "id": current,
                "title": current_title,
                "artist": current_artist,
                "album": current_song.map(|song| song.album.clone()).unwrap_or_default(),
                "message": message,
                "detail": detail,
            })
            .to_string(),
        )
            .into_response();
    }
    let target: axum::http::Uri = if back.starts_with('/') {
        back.parse().unwrap_or_else(|_| "/".parse().unwrap())
    } else {
        "/".parse().unwrap()
    };
    Redirect::to(target.to_string().leak()).into_response()
}

fn slug_id(name: &str) -> String {
    let mut id = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            id.push(ch.to_ascii_lowercase());
        } else if ch.is_alphanumeric() {
            id.push(ch);
        } else if !id.ends_with('-') {
            id.push('-');
        }
    }
    let id = id.trim_matches('-').to_string();
    if id.is_empty() { "custom".into() } else { id }
}

fn theme_entries(ui: &std::collections::BTreeMap<String, String>) -> Vec<(String, String)> {
    ui.get("themeList")
        .map(|raw| {
            raw.lines()
                .filter_map(|line| {
                    let (id, name) = line.split_once('|')?;
                    if id.is_empty() { None } else { Some((id.to_string(), name.to_string())) }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn encode_themes(entries: &[(String, String)]) -> String {
    entries.iter().map(|(id, name)| format!("{id}|{name}")).collect::<Vec<_>>().join("\n")
}

fn apply_field(store: &mut Store, field: &str, value: &str) {
    let on = value == "1" || value == "true" || value == "on";
    match field {
        "locale" => {
            if matches!(value, "ru" | "en" | "zh" | "hi" | "es" | "fr" | "uk") {
                store.settings.locale = value.into();
            }
        }
        "theme" => {
            if matches!(value, "dark" | "light" | "system") {
                store.settings.theme = value.into();
            }
        }
        "show_sidebar" => store.settings.show_sidebar = on,
        "show_queue" => store.settings.show_queue = on,
        "show_search" => store.settings.show_search = on,
        "start_view" => store.settings.behavior.start_view = value.into(),
        "restore_last_page" => store.settings.behavior.restore_last_page = on,
        "restore_track" => store.settings.behavior.restore_track = on,
        "restore_queue" => store.settings.behavior.restore_queue = on,
        "focus_search_on_open" => store.settings.behavior.focus_search_on_open = on,
        "confirm_delete" => store.settings.behavior.confirm_delete = on,
        "confirm_clear_queue" => store.settings.behavior.confirm_clear_queue = on,
        "space_toggles_playback" => store.settings.behavior.space_toggles_playback = on,
        "auto_resume_on_launch" => store.settings.behavior.auto_resume_on_launch = on,
        "shuffle" => store.settings.playback.shuffle = on,
        "repeat" => store.settings.playback.repeat = value.into(),
        "gapless" => store.settings.playback.gapless_enabled = on,
        "eq" => store.settings.playback.eq_enabled = on,
        "tray" => store.settings.playback.close_to_tray = on,
        "listenbrainz" => store.settings.listenbrainz = on,
        "ytdlp_path" => store.settings.ytdlp_path = value.trim().into(),
        "ytdlp_proxy" => store.settings.ytdlp_proxy = value.trim().into(),
        "archive_ahead" => {
            if let Ok(count) = value.parse::<u32>() {
                store.settings.archive_ahead = count.clamp(2, 20);
            }
        }
        "archive_keep" => {
            if let Ok(count) = value.parse::<u32>() {
                store.settings.archive_keep = count.clamp(10, 250);
                for path in store.trim_archive() {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        "archive_mix_keep" => {
            if let Ok(count) = value.parse::<u32>() {
                store.settings.archive_mix_keep = count.clamp(4, 20);
                for path in store.trim_mix_albums() {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        "ffmpeg_path" => store.settings.ffmpeg_path = value.trim().into(),
        "preset" => store.apply_preset(value),
        "crossfade" => {
            if let Ok(seconds) = value.parse::<i32>() {
                store.settings.playback.crossfade_seconds = seconds.clamp(0, 12);
            }
        }
        "normalize" => store.settings.playback.normalize_volume = on,
        "eq_preset" => {
            if matches!(value, "flat" | "bassBoost" | "vocal" | "custom") {
                store.settings.playback.eq_preset = value.into();
                let (bass, mid, treble) = match value {
                    "bassBoost" => (6, 0, 0),
                    "vocal" => (-2, 4, 2),
                    "flat" => (0, 0, 0),
                    _ => (store.settings.playback.eq_bass, store.settings.playback.eq_mid, store.settings.playback.eq_treble),
                };
                if value != "custom" {
                    store.settings.playback.eq_bass = bass;
                    store.settings.playback.eq_mid = mid;
                    store.settings.playback.eq_treble = treble;
                    store.settings.playback.eq_enabled = true;
                }
            }
        }
        "eq_bass" | "eq_mid" | "eq_treble" => {
            if let Ok(band) = value.parse::<i32>() {
                let band = band.clamp(-12, 12);
                store.settings.playback.eq_preset = "custom".into();
                match field {
                    "eq_bass" => store.settings.playback.eq_bass = band,
                    "eq_mid" => store.settings.playback.eq_mid = band,
                    "eq_treble" => store.settings.playback.eq_treble = band,
                    _ => {}
                }
            }
        }
        "lastfm" => store.settings.lastfm = on,
        "preview_mode" | "preview_page" | "palette" => {
            store.settings.ui.insert(field.to_string(), value.trim().to_string());
        }
        _ => {
            if let Some(key) = field.strip_prefix("ui.") {
                if key.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '_') && key.len() < 80 {
                    store.settings.ui.insert(key.to_string(), value.trim().to_string());
                }
            } else if let Some(action) = field.strip_prefix("hotkey.") {
                if action.chars().all(|ch| ch.is_ascii_alphanumeric()) && value.len() < 40 {
                    if value.is_empty() {
                        store.settings.hotkeys.remove(action);
                    } else {
                        store.settings.hotkeys.insert(action.to_string(), value.to_string());
                    }
                }
            }
        }
    }
}

async fn import_files(State(state): State<Arc<AppState>>, mut multipart: Multipart) -> Redirect {
    let dir = state.data_path.parent().unwrap().join("media");
    let _ = std::fs::create_dir_all(&dir);
    let mut saved = Vec::new();
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.file_name().unwrap_or("track.bin").to_string();
        let original = name.rsplit(['/', '\\']).next().unwrap_or("track.bin").to_string();
        let stem = std::path::Path::new(&original)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Track")
            .trim()
            .to_string();
        let safe = safe_upload_name(&original);
        let dest = dir.join(format!("{}-{}", model_nid(), safe));
        if let Ok(bytes) = field.bytes().await {
            if std::fs::write(&dest, &bytes).is_ok() {
                saved.push((dest, stem));
            }
        }
    }
    let mut store = state.store.lock().expect("store");
    for (path, stem) in saved {
        store.add_file_named(&path, Some(stem.as_str()));
    }
    save(&state, &store);
    Redirect::to("/?view=all")
}

async fn upload_wallpaper(State(state): State<Arc<AppState>>, mut multipart: Multipart) -> Redirect {
    let dir = state.data_path.parent().unwrap().join("wallpaper");
    let _ = std::fs::create_dir_all(&dir);
    let dest = dir.join("background");
    if let Ok(Some(field)) = multipart.next_field().await {
        if let Ok(bytes) = field.bytes().await {
            if (16..12 * 1024 * 1024).contains(&bytes.len()) && std::fs::write(&dest, &bytes).is_ok() {
                let mut store = state.store.lock().expect("store");
                store.settings.wallpaper_path = dest.to_string_lossy().into_owned();
                if store.settings.wallpaper_mode.is_empty() || store.settings.wallpaper_mode == "none" {
                    store.settings.wallpaper_mode = "fitBlur".into();
                }
                save(&state, &store);
            }
        }
    }
    Redirect::to("/?settings=appearance&section=wallpaper")
}

async fn wallpaper_image(State(state): State<Arc<AppState>>) -> Response {
    let path = state.store.lock().expect("store").settings.wallpaper_path.clone();
    match std::fs::read(path) {
        Ok(bytes) => {
            let kind = if bytes.starts_with(b"\x89PNG") {
                "image/png"
            } else if bytes.starts_with(b"GIF8") {
                "image/gif"
            } else {
                "image/jpeg"
            };
            ([(header::CONTENT_TYPE, kind)], bytes).into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

fn model_nid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

async fn import_search(State(state): State<Arc<AppState>>, Form(form): Form<ActForm>) -> Response {
    let title = form.title.unwrap_or_default();
    let artist = form.artist.unwrap_or_default();
    let album = form.album.clone().unwrap_or_default();
    let cover_url = form.cover.clone().unwrap_or_default();
    let (configured, proxy, already, dest, covers) = {
        let store = state.store.lock().expect("store");
        let already = store.songs.iter().any(|song| {
            song.title.eq_ignore_ascii_case(title.trim()) && song.artist.eq_ignore_ascii_case(artist.trim())
        });
        let root = state
            .data_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .to_path_buf();
        (
            store.settings.ytdlp_path.clone(),
            store.settings.ytdlp_proxy.clone(),
            already,
            root.join("downloads"),
            root.join("covers"),
        )
    };
    if already {
        let cover = ytdlp::save_cover(&cover_url, &covers, &format!("{artist}-{title}"))
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default();
        let mut store = state.store.lock().expect("store");
        if let Some(song) = store.songs.iter_mut().find(|song| {
            song.title.eq_ignore_ascii_case(title.trim()) && song.artist.eq_ignore_ascii_case(artist.trim())
        }) {
            if song.album.trim().is_empty() && !album.trim().is_empty() {
                song.album = album.trim().to_string();
            }
            if song.cover_path.is_empty() && !cover.is_empty() {
                song.cover_path = cover;
            }
        }
        save(&state, &store);
        return json_msg(true, "Трек уже есть в библиотеке");
    }
    let label = if artist.trim().is_empty() {
        title.trim().to_string()
    } else if title.trim().is_empty() {
        artist.trim().to_string()
    } else {
        format!("{} — {}", artist.trim(), title.trim())
    };
    {
        let mut live = state.import_status.lock().expect("import");
        *live = ImportLive {
            active: true,
            label: label.clone(),
            message: format!("Поиск: {label}"),
            percent: None,
            done: false,
            ok: false,
        };
    }
    let fetched = {
        let title = title.clone();
        let artist = artist.clone();
        let progress = Arc::clone(&state.import_status);
        tokio::task::spawn_blocking(move || {
            ytdlp::download_search(&title, &artist, &configured, &proxy, &dest, &mut |message, percent| {
                if let Ok(mut live) = progress.lock() {
                    live.message = message.to_string();
                    live.percent = percent;
                    live.active = true;
                }
            })
        })
        .await
    };
    let finish = |ok: bool, message: &str| {
        if let Ok(mut live) = state.import_status.lock() {
            live.active = false;
            live.done = true;
            live.ok = ok;
            live.percent = if ok { Some(100) } else { live.percent };
            live.message = message.to_string();
        }
    };
    match fetched {
        Ok(Ok(path)) => {
            let cover = ytdlp::save_cover(&cover_url, &covers, &format!("{artist}-{title}"))
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default();
            let mut store = state.store.lock().expect("store");
            let added = store.add_file(&path);
            store.apply_download_meta(&path, &title, &artist, &album, &cover);
            save(&state, &store);
            let message = format!(
                "{}: {label}",
                if added { "Добавлено" } else { "Уже было скачано" }
            );
            finish(true, &message);
            json_msg(true, &message)
        }
        Ok(Err(message)) => {
            let message = format!("Не скачано: {label}. {message}");
            finish(false, &message);
            json_msg(false, &message)
        }
        Err(_) => {
            let message = format!("Скачивание прервалось: {label}");
            finish(false, &message);
            json_msg(false, &message)
        }
    }
}

async fn import_status(State(state): State<Arc<AppState>>) -> Response {
    let live = state.import_status.lock().expect("import").clone();
    (
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::json!({
            "active": live.active,
            "label": live.label,
            "message": live.message,
            "percent": live.percent,
            "done": live.done,
            "ok": live.ok,
        })
        .to_string(),
    )
        .into_response()
}

fn external_url(raw: &str) -> Option<String> {
    let url = raw.trim();
    if url.starts_with("https://") || url.starts_with("http://") {
        Some(url.to_string())
    } else {
        None
    }
}

fn open_external(url: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .creation_flags(0x0800_0000)
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

fn json_msg(ok: bool, message: &str) -> Response {
    (
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::json!({ "ok": ok, "error": if ok { "" } else { message }, "message": message }).to_string(),
    )
        .into_response()
}

async fn import_path(State(state): State<Arc<AppState>>, Form(form): Form<ActForm>) -> Redirect {
    if let Some(path) = form.path.or(form.value) {
        let mut store = state.store.lock().expect("store");
        store.import_path(std::path::Path::new(&path));
        save(&state, &store);
    }
    Redirect::to("/?view=all")
}

async fn cover_file(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Response {
    let path = {
        let store = state.store.lock().expect("store");
        store.song(&id).map(|song| song.cover_path.clone()).unwrap_or_default()
    };
    if path.is_empty() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let kind = if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".webp") {
        "image/webp"
    } else {
        "image/jpeg"
    };
    ([(header::CONTENT_TYPE, kind)], bytes).into_response()
}

#[derive(Deserialize)]
struct TrackQuery {
    id: Option<String>,
    video: Option<String>,
}

async fn track_search(State(state): State<Arc<AppState>>, Query(query): Query<TrackQuery>) -> Response {
    let id = query.id.unwrap_or_default();
    let (title, artist, configured, proxy) = {
        let store = state.store.lock().expect("store");
        let Some(song) = store.song(&id) else {
            return json_msg(false, "Трек не найден");
        };
        (
            song.title.clone(),
            song.artist.clone(),
            store.settings.ytdlp_path.clone(),
            store.settings.ytdlp_proxy.clone(),
        )
    };
    let found = tokio::task::spawn_blocking(move || ytdlp::list_search(&title, &artist, &configured, &proxy)).await;
    let hits = match found {
        Ok(Ok(hits)) => hits,
        Ok(Err(err)) => return json_msg(false, &err),
        Err(_) => return json_msg(false, "Поиск прервался"),
    };
    let tracks: Vec<_> = hits
        .into_iter()
        .map(|hit| {
            serde_json::json!({
                "id": hit.id,
                "title": hit.title,
                "artist": hit.channel,
                "duration": hit.duration,
            })
        })
        .collect();
    (
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::json!({ "ok": true, "tracks": tracks }).to_string(),
    )
        .into_response()
}

async fn track_preview(State(state): State<Arc<AppState>>, Query(query): Query<TrackQuery>) -> Response {
    let video = query.video.unwrap_or_default();
    let (configured, proxy) = {
        let store = state.store.lock().expect("store");
        (store.settings.ytdlp_path.clone(), store.settings.ytdlp_proxy.clone())
    };
    let found = tokio::task::spawn_blocking(move || ytdlp::preview_url(&video, &configured, &proxy)).await;
    match found {
        Ok(Ok(url)) => (
            [(header::CONTENT_TYPE, "application/json")],
            serde_json::json!({ "ok": true, "url": url }).to_string(),
        )
            .into_response(),
        Ok(Err(err)) => json_msg(false, &err),
        Err(_) => json_msg(false, "Не удалось включить"),
    }
}

async fn track_replace(State(state): State<Arc<AppState>>, Form(form): Form<ActForm>) -> Response {
    let id = form.id.unwrap_or_default();
    let video = form.video.unwrap_or_default();
    let (label, configured, proxy, dest) = {
        let store = state.store.lock().expect("store");
        let Some(song) = store.song(&id) else {
            return json_msg(false, "Трек не найден");
        };
        let label = if song.artist.is_empty() {
            song.title.clone()
        } else {
            format!("{} — {}", song.artist, song.title)
        };
        let dest = std::path::Path::new(&song.path)
            .parent()
            .map(|dir| dir.to_path_buf())
            .unwrap_or_else(|| {
                state
                    .data_path
                    .parent()
                    .unwrap_or_else(|| std::path::Path::new("."))
                    .join("downloads")
            });
        (label, store.settings.ytdlp_path.clone(), store.settings.ytdlp_proxy.clone(), dest)
    };
    let _ = std::fs::create_dir_all(&dest);
    let fetched = tokio::task::spawn_blocking(move || ytdlp::download_id(&video, &label, &configured, &proxy, &dest)).await;
    let path = match fetched {
        Ok(Ok(path)) => path,
        Ok(Err(err)) => return json_msg(false, &err),
        Err(_) => return json_msg(false, "Скачивание прервалось"),
    };
    let mut store = state.store.lock().expect("store");
    match store.replace_song_file(&id, &path) {
        Ok(()) => {
            save(&state, &store);
            json_msg(true, "Файл заменён")
        }
        Err(err) => json_msg(false, &err),
    }
}

async fn archive_fetch(State(state): State<Arc<AppState>>, Form(form): Form<ActForm>) -> Response {
    let title = form.title.unwrap_or_default();
    let artist = form.artist.unwrap_or_default();
    let cover = form.cover.unwrap_or_default();
    if title.trim().is_empty() && artist.trim().is_empty() {
        return json_msg(false, "Пустой трек");
    }
    let key = format!("{}|{}", title.trim().to_lowercase(), artist.trim().to_lowercase());
    {
        let store = state.store.lock().expect("store");
        if store.archive_has(&title, &artist) {
            return json_msg(true, "Уже сохранено");
        }
    }
    {
        let mut inflight = state.archive_inflight.lock().expect("archive");
        if !inflight.insert(key.clone()) {
            return json_msg(true, "Уже качается");
        }
    }
    let state = Arc::clone(&state);
    let title_job = title.clone();
    let artist_job = artist.clone();
    let mix_id = form.id.unwrap_or_default();
    let mix_title = form.name.unwrap_or_default();
    tokio::spawn(async move {
        let (configured, proxy, dest, covers) = {
            let store = state.store.lock().expect("store");
            let root = state.data_path.parent().unwrap_or_else(|| std::path::Path::new(".")).to_path_buf();
            (
                store.settings.ytdlp_path.clone(),
                store.settings.ytdlp_proxy.clone(),
                root.join("archive"),
                root.join("covers"),
            )
        };
        let _ = std::fs::create_dir_all(&dest);
        let fetched = tokio::task::spawn_blocking(move || {
            ytdlp::download_search(&title_job, &artist_job, &configured, &proxy, &dest, &mut |_, _| {})
        })
        .await;
        if let Ok(Ok(path)) = fetched {
            let cover_path = ytdlp::save_cover(&cover, &covers, &format!("{artist}-{title}"))
                .map(|path| path.to_string_lossy().into_owned())
                .unwrap_or_default();
            let mut store = state.store.lock().expect("store");
            store.push_archive(&title, &artist, &path, &cover_path);
            store.tag_latest_archive(&title, &artist, &mix_id, &mix_title);
            let mut doomed = store.trim_archive();
            doomed.extend(store.trim_mix_albums());
            save(&state, &store);
            drop(store);
            for path in doomed {
                let _ = std::fs::remove_file(path);
            }
        }
        state.archive_inflight.lock().expect("archive").remove(&key);
    });
    json_msg(true, "Качается в архив")
}

#[derive(Deserialize)]
struct ArchiveMatchQuery {
    title: Option<String>,
    artist: Option<String>,
}

async fn archive_match(State(state): State<Arc<AppState>>, Query(query): Query<ArchiveMatchQuery>) -> Response {
    let store = state.store.lock().expect("store");
    let title = query.title.unwrap_or_default();
    let artist = query.artist.unwrap_or_default();
    let hit = store.archive_match(&title, &artist);
    let body = if let Some(item) = hit {
        serde_json::json!({ "ok": true, "id": item.id, "title": item.title, "artist": item.artist })
    } else {
        serde_json::json!({ "ok": false })
    };
    ([(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

async fn audio(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let path = {
        let store = state.store.lock().expect("store");
        store
            .song(&id)
            .map(|song| song.path.clone())
            .or_else(|| store.archive.iter().find(|item| item.id == id).map(|item| item.path.clone()))
    };
    let Some(path) = path else {
        return (StatusCode::NOT_FOUND, "missing").into_response();
    };
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" | "mp4" => "audio/mp4",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    };
    let bytes = match tokio::fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(_) => return (StatusCode::NOT_FOUND, "missing").into_response(),
    };
    let total = bytes.len() as u64;
    let range = headers.get(header::RANGE).and_then(|value| value.to_str().ok()).unwrap_or("");
    if let Some(spec) = range.strip_prefix("bytes=") {
        let (start_text, end_text) = spec.split_once('-').unwrap_or((spec, ""));
        let start: u64 = start_text.parse().unwrap_or(0);
        let end: u64 = end_text.parse().unwrap_or(total.saturating_sub(1));
        let end = end.min(total.saturating_sub(1));
        if start >= total || start > end {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{total}"))
                .body(axum::body::Body::empty())
                .unwrap();
        }
        let slice = bytes[start as usize..=end as usize].to_vec();
        return Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, mime)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{total}"))
            .body(axum::body::Body::from(slice))
            .unwrap();
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .body(axum::body::Body::from(bytes))
        .unwrap()
}

#[derive(Deserialize)]
struct WavesQuery {
    artist: Option<String>,
    id: Option<String>,
}

async fn waves_pool(State(state): State<Arc<AppState>>, Query(query): Query<WavesQuery>) -> Response {
    if let Some(name) = query.artist.as_deref().map(str::trim).filter(|name| !name.is_empty()) {
        let id = query.id.as_deref().and_then(|value| value.parse::<u64>().ok());
        let name = name.to_string();
        let built = tokio::task::spawn_blocking(move || waves::build_artist_wave(&name, id)).await;
        let items = built.unwrap_or_default();
        return (
            [(header::CONTENT_TYPE, "application/json")],
            serde_json::json!({ "ok": true, "items": items }).to_string(),
        )
            .into_response();
    }
    let snapshot = {
        let mut store = state.store.lock().expect("store");
        store.settings.waves.spin = store.settings.waves.spin.wrapping_add(1).max(1);
        let snapshot = store.clone();
        save(&state, &store);
        snapshot
    };
    let built = tokio::task::spawn_blocking(move || waves::build_pool(&snapshot)).await;
    let items = built.unwrap_or_default();
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        serde_json::json!({ "ok": true, "items": items }).to_string(),
    )
        .into_response()
}

async fn api_state(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let store = state.store.lock().expect("store");
    let body = serde_json::json!({
        "current": store.player.current_id,
        "playing": store.player.playing,
        "volume": store.settings.volume,
        "songs": store.songs.len(),
    });
    ([(header::CONTENT_TYPE, "application/json")], body.to_string())
}

async fn css(State(state): State<Arc<AppState>>) -> Response {
    file_response(&state.static_dir.join("index.css"), "text/css; charset=utf-8").await
}

async fn player_js(State(state): State<Arc<AppState>>) -> Response {
    file_response(&state.static_dir.join("player.js"), "text/javascript; charset=utf-8").await
}

async fn favicon(State(state): State<Arc<AppState>>) -> Response {
    file_response(&state.static_dir.join("favicon.png"), "image/png").await
}

fn app_dirs() -> (PathBuf, PathBuf) {
    if let (Ok(static_dir), Ok(data_dir)) = (
        std::env::var("IME_RS_STATIC").map(PathBuf::from),
        std::env::var("IME_RS_DATA").map(PathBuf::from),
    ) {
        return (static_dir, data_dir);
    }
    let dev_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_static = dev_root.join("static");
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|dir| dir.to_path_buf()));
    if dev_static.join("index.css").is_file() {
        let data_dir = std::env::var("IME_RS_DATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| dev_root.join("data"));
        return (dev_static, data_dir);
    }
    let root = exe_dir.unwrap_or_else(|| PathBuf::from("."));
    let data_dir = std::env::var("IME_RS_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| root.join("data"));
    let static_dir = std::env::var("IME_RS_STATIC")
        .map(PathBuf::from)
        .unwrap_or_else(|_| root.join("static"));
    (static_dir, data_dir)
}

fn safe_upload_name(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            out.push('_');
        } else {
            out.push(c);
        }
    }
    let out = out.trim().trim_matches('.').to_string();
    if out.is_empty() { "track.bin".into() } else { out }
}

fn json_response(value: serde_json::Value) -> Response {
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        value.to_string(),
    )
        .into_response()
}

async fn api_queue(State(state): State<Arc<AppState>>) -> Response {
    let store = state.store.lock().expect("store");
    let items: Vec<_> = store
        .player
        .queue
        .iter()
        .filter_map(|id| store.song(id))
        .map(|song| {
            serde_json::json!({
                "id": song.id,
                "title": song.title,
                "artist": song.artist,
                "album": song.album,
            })
        })
        .collect();
    let playlists: Vec<_> = store
        .playlists
        .iter()
        .map(|pl| serde_json::json!({ "id": pl.id, "name": pl.name }))
        .collect();
    json_response(serde_json::json!({
        "current": store.player.current_id,
        "items": items,
        "playlists": playlists,
    }))
}

async fn api_updates() -> Response {
    let fetched = tokio::task::spawn_blocking(|| {
        ureq::get("https://api.github.com/repos/snepi/ime-music/releases/latest")
            .set("User-Agent", "IMe-Music")
            .set("Accept", "application/vnd.github+json")
            .timeout(std::time::Duration::from_secs(12))
            .call()
            .map_err(|err| err.to_string())
            .and_then(|response| response.into_string().map_err(|err| err.to_string()))
    })
    .await;
    let current = "1.2.0";
    let body = match fetched {
        Ok(Ok(text)) => text,
        _ => {
            return json_response(serde_json::json!({
                "ok": false,
                "current": current,
                "message": "Не удалось проверить обновления",
            }));
        }
    };
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    let tag = parsed.get("tag_name").and_then(|v| v.as_str()).unwrap_or("").trim_start_matches('v').to_string();
    let update = !tag.is_empty() && tag != current;
    let message = if tag.is_empty() {
        "Не удалось проверить обновления".to_string()
    } else if update {
        format!("Доступна версия {tag}")
    } else {
        "У вас последняя версия".to_string()
    };
    json_response(serde_json::json!({
        "ok": true,
        "current": current,
        "latest": tag,
        "update": update,
        "htmlUrl": parsed.get("html_url").and_then(|v| v.as_str()).unwrap_or("https://github.com/snepi/ime-music/releases"),
        "message": message,
    }))
}

async fn backup_download(State(state): State<Arc<AppState>>) -> Response {
    let store = state.store.lock().expect("store");
    let body = serde_json::to_vec_pretty(&store.backup_value()).unwrap_or_else(|_| b"{}".to_vec());
    (
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (header::CONTENT_DISPOSITION, "attachment; filename=\"ime-music-backup.json\""),
        ],
        body,
    )
        .into_response()
}

async fn import_backup(State(state): State<Arc<AppState>>, body: String) -> Response {
    let value: serde_json::Value = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(_) => return json_response(serde_json::json!({ "ok": false, "message": "Файл бэкапа не читается" })),
    };
    let mut store = state.store.lock().expect("store");
    let (liked, playlists, wishlist) = store.import_backup(&value);
    save(&state, &store);
    json_response(serde_json::json!({
        "ok": true,
        "liked": liked,
        "playlists": playlists,
        "wishlist": wishlist,
        "message": format!("Импортировано: лайков {liked}, плейлистов {playlists}, wishlist {wishlist}"),
    }))
}

#[derive(Deserialize, Default)]
struct PlaylistForm {
    url: Option<String>,
    text: Option<String>,
}

async fn import_playlist(State(state): State<Arc<AppState>>, Form(form): Form<PlaylistForm>) -> Response {
    let (lines, playlist_name) = if let Some(url) = form.url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let owned = url.to_string();
        let ytdlp = {
            let store = state.store.lock().expect("store");
            (store.settings.ytdlp_path.clone(), store.settings.ytdlp_proxy.clone())
        };
        match tokio::task::spawn_blocking(move || resolve_playlist_link(&owned, &ytdlp.0, &ytdlp.1)).await {
            Ok(Ok((name, entries))) => (entries, name),
            Ok(Err(message)) => return json_response(serde_json::json!({ "ok": false, "message": message })),
            Err(_) => return json_response(serde_json::json!({ "ok": false, "message": "Не удалось открыть ссылку" })),
        }
    } else {
        (parse_playlist_text(&form.text.unwrap_or_default()), "Импорт плейлиста".into())
    };
    let lines = lines;
    if lines.is_empty() {
        return json_response(serde_json::json!({
            "ok": false,
            "message": "В ссылке или файле нет строк «Артист - Название», M3U или CSV",
        }));
    }
    let mut store = state.store.lock().expect("store");
    let (matched, unmatched, wishlist) = store.import_track_lines(&playlist_name, &lines);
    save(&state, &store);
    json_response(serde_json::json!({
        "ok": true,
        "matched": matched,
        "unmatched": unmatched,
        "wishlist": wishlist,
        "message": format!("Импорт «{playlist_name}»: найдено {matched}, не найдено {unmatched} (в wishlist: {wishlist})"),
    }))
}

fn resolve_playlist_link(url: &str, ytdlp: &str, proxy: &str) -> Result<(String, Vec<(String, String)>), String> {
    let lower = url.to_ascii_lowercase();
    if lower.contains("music.yandex.") || lower.contains("ya.ru/music") {
        return fetch_yandex_playlist(url);
    }
    if lower.contains("open.spotify.com") || lower.contains("spotify.com/playlist") {
        return fetch_spotify_playlist(url);
    }
    if lower.contains("music.apple.com") || lower.contains("itunes.apple.com") {
        return fetch_apple_playlist(url);
    }
    if lower.contains("music.youtube.com")
        || ((lower.contains("youtube.com") || lower.contains("youtu.be")) && (lower.contains("list=") || lower.contains("/playlist")))
    {
        return fetch_youtube_playlist(url, ytdlp, proxy);
    }
    let text = http_text(url)?;
    let lines = parse_playlist_text(&text);
    if lines.is_empty() {
        return Err("Не удалось прочитать плейлист. Нужна открытая ссылка Яндекс.Музыки, Spotify, Apple Music или YouTube Music, либо файл M3U/CSV.".into());
    }
    Ok(("Плейлист".into(), lines))
}

fn http_text(url: &str) -> Result<String, String> {
    ureq::get(url)
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .set("Accept", "text/html,application/json,*/*")
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|err| err.to_string())
        .and_then(|response| response.into_string().map_err(|err| err.to_string()))
}

fn fetch_yandex_playlist(url: &str) -> Result<(String, Vec<(String, String)>), String> {
    let (owner, kind) = if let Some(rest) = url.split("iframe/playlist/").nth(1) {
        let mut parts = rest.split('/');
        (parts.next().unwrap_or("").to_string(), parts.next().unwrap_or("").trim_end_matches(|c: char| !c.is_ascii_digit() && c != '-').to_string())
    } else if let Some(rest) = url.split("/users/").nth(1) {
        let mut parts = rest.split('/');
        let owner = parts.next().unwrap_or("").to_string();
        let kind = parts.nth(1).unwrap_or("").chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
        (owner, kind)
    } else {
        return Err("Не распознана ссылка Яндекс.Музыки".into());
    };
    if owner.is_empty() || kind.is_empty() {
        return Err("Не распознана ссылка Яндекс.Музыки".into());
    }
    let api = format!(
        "https://music.yandex.ru/handlers/playlist.jsx?owner={}&kinds={}&light=true",
        urlencoding::encode(&owner),
        urlencoding::encode(&kind)
    );
    let text = ureq::get(&api)
        .set("Referer", "https://music.yandex.ru/")
        .set("Accept", "application/json")
        .set("X-Requested-With", "XMLHttpRequest")
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|_| "Яндекс.Музыка не ответила".to_string())
        .and_then(|response| response.into_string().map_err(|err| err.to_string()))?;
    let data: serde_json::Value = serde_json::from_str(&text).map_err(|_| "Яндекс.Музыка вернула неожиданный ответ".to_string())?;
    let playlist = data.get("playlist").ok_or("Плейлист Яндекс.Музыки не найден или закрыт")?;
    let mut lines = Vec::new();
    if let Some(tracks) = playlist.get("tracks").and_then(|v| v.as_array()) {
        for track in tracks {
            let node = track.get("track").unwrap_or(track);
            let title = node.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let artist = node
                .get("artists")
                .and_then(|v| v.as_array())
                .map(|artists| {
                    artists.iter().filter_map(|a| a.get("name").and_then(|v| v.as_str())).collect::<Vec<_>>().join(", ")
                })
                .unwrap_or_default();
            if !title.is_empty() {
                lines.push((artist, title));
            }
        }
    }
    if lines.is_empty() {
        return Err("В плейлисте Яндекс.Музыки нет треков".into());
    }
    let name = playlist.get("title").and_then(|v| v.as_str()).unwrap_or("Яндекс.Музыка").to_string();
    Ok((name, lines))
}

fn fetch_spotify_playlist(url: &str) -> Result<(String, Vec<(String, String)>), String> {
    let id = url.split("playlist/").nth(1).unwrap_or("").chars().take_while(|c| c.is_ascii_alphanumeric()).collect::<String>();
    if id.is_empty() {
        return Err("Не распознана ссылка Spotify (нужен playlist/...)".into());
    }
    let text = http_text(&format!("https://open.spotify.com/embed/playlist/{id}"))?;
    let mut lines = Vec::new();
    for chunk in text.split("\"name\":\"").skip(1) {
        let title = chunk.split('"').next().unwrap_or("").replace("\\u0026", "&");
        if title.is_empty() || title.len() > 180 {
            continue;
        }
        lines.push((String::new(), title));
        if lines.len() >= 100 {
            break;
        }
    }
    if lines.is_empty() {
        return Err("Не удалось прочитать плейлист Spotify. Сделайте его открытым или вставьте CSV.".into());
    }
    Ok(("Spotify".into(), lines))
}

fn fetch_apple_playlist(url: &str) -> Result<(String, Vec<(String, String)>), String> {
    let text = http_text(url)?;
    let mut lines = Vec::new();
    for block in text.split("type=\"application/ld+json\">").skip(1) {
        let json = block.split("</script>").next().unwrap_or("");
        let Ok(data) = serde_json::from_str::<serde_json::Value>(json) else { continue };
        let nodes = if data.is_array() { data.as_array().cloned().unwrap_or_default() } else { vec![data] };
        for node in nodes {
            let items = node.get("track").or_else(|| node.get("itemListElement")).and_then(|v| v.as_array());
            let Some(items) = items else { continue };
            for item in items {
                let song = item.get("item").unwrap_or(item);
                let title = song.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let artist = song.get("byArtist").and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                if !title.is_empty() {
                    lines.push((artist, title));
                }
            }
        }
    }
    if lines.is_empty() {
        return Err("Не удалось прочитать плейлист Apple Music. Ссылка должна быть публичной.".into());
    }
    Ok(("Apple Music".into(), lines))
}

fn fetch_youtube_playlist(url: &str, configured: &str, proxy: &str) -> Result<(String, Vec<(String, String)>), String> {
    let bin = if !configured.trim().is_empty() && std::path::Path::new(configured.trim()).exists() {
        configured.trim().to_string()
    } else if std::process::Command::new("yt-dlp").arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
        "yt-dlp".into()
    } else {
        return Err("Для YouTube Music нужен yt-dlp. Укажите путь в Настройки → Инструменты.".into());
    };
    let mut args: Vec<String> = vec!["--ignore-config".into(), "--flat-playlist".into(), "--no-download".into(), "-J".into()];
    if !proxy.trim().is_empty() {
        args.push("--proxy".into());
        args.push(proxy.trim().into());
    }
    args.push(url.into());
    let output = std::process::Command::new(bin).args(args).output().map_err(|err| err.to_string())?;
    if !output.status.success() {
        return Err("yt-dlp не смог прочитать плейлист. Аудио при этом не скачивается.".into());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value = serde_json::from_str(&text).map_err(|_| "yt-dlp вернул не JSON".to_string())?;
    let mut lines = Vec::new();
    if let Some(entries) = data.get("entries").and_then(|v| v.as_array()) {
        for entry in entries {
            let title = entry.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
            let artist = entry.get("artist").or_else(|| entry.get("uploader")).and_then(|v| v.as_str()).unwrap_or("").trim();
            if !title.is_empty() {
                lines.push((artist.to_string(), title.to_string()));
            }
        }
    }
    if lines.is_empty() {
        return Err("В плейлисте YouTube Music нет треков".into());
    }
    let name = data.get("title").and_then(|v| v.as_str()).unwrap_or("YouTube Music").to_string();
    Ok((name, lines))
}

fn parse_playlist_text(raw: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') && !line.starts_with("#EXTINF") {
            continue;
        }
        let payload = if let Some(rest) = line.strip_prefix("#EXTINF:") {
            rest.split_once(',').map(|(_, title)| title.trim()).unwrap_or("")
        } else if line.starts_with('#') || line.starts_with("http://") || line.starts_with("https://") {
            continue;
        } else {
            line
        };
        if payload.is_empty() {
            continue;
        }
        let (artist, title) = if let Some((a, t)) = payload.split_once(" - ") {
            (a.trim().to_string(), t.trim().to_string())
        } else if let Some((t, a)) = payload.split_once(',') {
            let t = t.trim().trim_matches('"');
            let a = a.trim().trim_matches('"');
            if t.eq_ignore_ascii_case("title") {
                continue;
            }
            (a.to_string(), t.to_string())
        } else {
            (String::new(), payload.to_string())
        };
        if !title.is_empty() {
            out.push((artist, title));
        }
    }
    out
}

async fn meta_sync(State(state): State<Arc<AppState>>) -> Response {
    let jobs: Vec<(String, String, String, String, bool)> = {
        let store = state.store.lock().expect("store");
        store
            .songs
            .iter()
            .map(|song| {
                (
                    song.id.clone(),
                    song.path.clone(),
                    song.title.clone(),
                    song.artist.clone(),
                    song.cover_path.is_empty(),
                )
            })
            .collect()
    };
    let covers = state.data_path.parent().unwrap_or_else(|| std::path::Path::new(".")).join("covers");
    let _ = std::fs::create_dir_all(&covers);
    let mut updated = 0;
    let mut skipped = 0;
    let mut failed = 0;
    for (id, path, title, artist, needs_cover) in jobs {
        if !std::path::Path::new(&path).exists() {
            failed += 1;
            continue;
        }
        let read = tokio::task::spawn_blocking({
            let path = path.clone();
            move || model::embedded_tags(std::path::Path::new(&path))
        })
        .await;
        let (tag_title, tag_artist, mut tag_album, mut year, picture) = match read {
            Ok(Some(tags)) => tags,
            Ok(None) => (String::new(), String::new(), String::new(), None, None),
            Err(_) => {
                failed += 1;
                continue;
            }
        };
        let mut cover_file = None;
        if let Some(bytes) = picture {
            let ext = if bytes.starts_with(b"\x89PNG") { "png" } else { "jpg" };
            let file = covers.join(format!("{id}.{ext}"));
            if std::fs::write(&file, bytes).is_ok() {
                cover_file = Some(file.to_string_lossy().into_owned());
            }
        } else if needs_cover {
            if let Some((bytes, found_album, found_year)) = deezer_cover(&artist, &title).await {
                let file = covers.join(format!("{id}.jpg"));
                if std::fs::write(&file, bytes).is_ok() {
                    cover_file = Some(file.to_string_lossy().into_owned());
                }
                if tag_album.is_empty() {
                    tag_album = found_album;
                }
                if year.is_none() {
                    year = found_year;
                }
            }
        }
        let mut store = state.store.lock().expect("store");
        if store.apply_synced(&id, &tag_title, &tag_artist, &tag_album, year, cover_file.as_deref()) {
            updated += 1;
        } else {
            skipped += 1;
        }
        save(&state, &store);
    }
    json_response(serde_json::json!({
        "ok": true,
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "message": format!("Синхронизация: обновлено {updated}, без изменений {skipped}, ошибок {failed}"),
    }))
}

async fn deezer_cover(artist: &str, title: &str) -> Option<(Vec<u8>, String, Option<i32>)> {
    let query = format!("{artist} {title}").trim().to_string();
    if query.is_empty() {
        return None;
    }
    let path = format!("/search/track?q={}&limit=1", urlencoding::encode(&query));
    let found = tokio::task::spawn_blocking(move || {
        ureq::get(&format!("https://api.deezer.com{path}"))
            .timeout(std::time::Duration::from_secs(8))
            .call()
            .ok()
            .and_then(|response| response.into_string().ok())
    })
    .await
    .ok()
    .flatten()?;
    let parsed: serde_json::Value = serde_json::from_str(&found).ok()?;
    let album_node = parsed.get("data")?.as_array()?.first()?.get("album")?;
    let url = album_node.get("cover_medium")?.as_str()?.to_string();
    let album = album_node.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let year = album_node
        .get("release_date")
        .and_then(|v| v.as_str())
        .and_then(|date| date.get(..4))
        .and_then(|year| year.parse().ok());
    let bytes = tokio::task::spawn_blocking(move || {
        ureq::get(&url)
            .timeout(std::time::Duration::from_secs(8))
            .call()
            .ok()
            .and_then(|response| {
                let mut bytes = Vec::new();
                std::io::Read::read_to_end(&mut response.into_reader(), &mut bytes).ok()?;
                Some(bytes)
            })
    })
    .await
    .ok()
    .flatten()
    .filter(|bytes| bytes.len() > 32)?;
    Some((bytes, album, year))
}

fn lan_addresses() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_to_string("/proc/net/fib_trie") {
        for line in entries.lines() {
            let line = line.trim();
            if let Some(ip) = line.strip_prefix("|-- ") {
                if ip.starts_with("127.") || ip.contains(':') || !ip.split('.').all(|part| part.parse::<u8>().is_ok()) {
                    continue;
                }
                if !out.iter().any(|have: &String| have == ip) {
                    out.push(ip.to_string());
                }
            }
        }
    }
    out
}

fn sync_public(session: &SyncSession) -> serde_json::Value {
    let lan = lan_addresses();
    let _host = lan.first().cloned().unwrap_or_else(|| "127.0.0.1".into());
    serde_json::json!({
        "active": true,
        "token": session.token,
        "expiresAt": session.expires_at,
        "transferredFiles": session.files,
        "transferredBytes": session.bytes,
        "lanAddresses": lan,
        "joinUrl": format!("/sync/join?t={}", session.token),
    })
}

async fn phone_start(State(state): State<Arc<AppState>>) -> Response {
    let mut sync = state.sync.lock().expect("sync");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    if sync.as_ref().map(|session| session.expires_at > now).unwrap_or(false) {
        return json_response(serde_json::json!({ "ok": true, "status": sync_public(sync.as_ref().unwrap()) }));
    }
    let token = format!("{:x}{:x}", now, now.wrapping_mul(17));
    let session = SyncSession {
        token,
        expires_at: now + 30 * 60 * 1000,
        files: 0,
        bytes: 0,
    };
    let body = sync_public(&session);
    *sync = Some(session);
    json_response(serde_json::json!({ "ok": true, "status": body }))
}

async fn phone_stop(State(state): State<Arc<AppState>>) -> Response {
    *state.sync.lock().expect("sync") = None;
    json_response(serde_json::json!({ "ok": true, "status": { "active": false } }))
}

fn bearer_token(headers: &axum::http::HeaderMap, query_token: Option<&str>) -> String {
    if let Some(token) = query_token.filter(|s| !s.is_empty()) {
        return token.to_string();
    }
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
        .to_string()
}

fn session_ok(state: &AppState, token: &str) -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    state
        .sync
        .lock()
        .expect("sync")
        .as_ref()
        .map(|session| session.token == token && session.expires_at > now)
        .unwrap_or(false)
}

#[derive(Deserialize, Default)]
struct TokenQuery {
    t: Option<String>,
}

async fn sync_info(State(state): State<Arc<AppState>>) -> Response {
    let active = state.sync.lock().expect("sync").is_some();
    json_response(serde_json::json!({
        "ok": true,
        "app": "IMe Music",
        "protocol": 1,
        "active": active,
    }))
}

async fn sync_join(State(state): State<Arc<AppState>>, Query(query): Query<TokenQuery>) -> Response {
    let ok = session_ok(&state, query.t.as_deref().unwrap_or(""));
    let body = format!(
        r#"<!doctype html><html lang="ru"><meta charset="utf-8"/><title>IMe Sync</title><body style="font-family:system-ui;background:#111;color:#eee;padding:24px"><h1>IMe Music — синхронизация</h1><p>{}</p><p style="opacity:.7;font-size:13px">Протокол v1 · только новые файлы</p></body></html>"#,
        if ok {
            "Сессия активна. Откройте приложение IMe на телефоне и продолжите приём."
        } else {
            "Сессия недействительна или истекла. Запустите синк заново на ПК."
        }
    );
    (
        StatusCode::from_u16(if ok { 200 } else { 410 }).unwrap_or(StatusCode::OK),
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        body,
    )
        .into_response()
}

#[derive(Deserialize, Default)]
struct OfferBody {
    fingerprints: Option<Vec<String>>,
    token: Option<String>,
}

async fn sync_offer(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<TokenQuery>,
    Json(body): Json<OfferBody>,
) -> Response {
    let token = {
        let from_body = body.token.clone().unwrap_or_default();
        if !from_body.is_empty() {
            from_body
        } else {
            bearer_token(&headers, query.t.as_deref())
        }
    };
    if !session_ok(&state, &token) {
        return json_response(serde_json::json!({ "ok": false, "error": "unauthorized" }));
    }
    let known: std::collections::HashSet<String> = body.fingerprints.unwrap_or_default().into_iter().collect();
    let store = state.store.lock().expect("store");
    let mut missing = Vec::new();
    for song in &store.songs {
        if !std::path::Path::new(&song.path).exists() {
            continue;
        }
        let fp = format!(
            "{}::{}::{}::{}",
            song.artist.to_lowercase(),
            song.title.to_lowercase(),
            song.duration.round() as i64,
            song.file_size
        );
        if known.contains(&fp) {
            continue;
        }
        let format = std::path::Path::new(&song.path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("mp3");
        missing.push(serde_json::json!({
            "id": song.id,
            "fingerprint": fp,
            "title": song.title,
            "artist": song.artist,
            "album": song.album,
            "duration": song.duration,
            "fileSize": song.file_size,
            "format": format,
            "liked": song.liked,
        }));
    }
    json_response(serde_json::json!({
        "ok": true,
        "missing": missing,
        "trackCount": store.songs.len(),
    }))
}

async fn sync_file(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<TokenQuery>,
    Path(id): Path<String>,
) -> Response {
    let token = bearer_token(&headers, query.t.as_deref());
    if !session_ok(&state, &token) {
        return json_response(serde_json::json!({ "ok": false, "error": "unauthorized" }));
    }
    let path = {
        let store = state.store.lock().expect("store");
        store.song(&id).map(|song| song.path.clone())
    };
    let Some(path) = path else {
        return StatusCode::NOT_FOUND.into_response();
    };
    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            if let Some(session) = state.sync.lock().expect("sync").as_mut() {
                session.files = session.files.saturating_add(1);
                session.bytes = session.bytes.saturating_add(bytes.len() as u64);
            }
            (
                [
                    (header::CONTENT_TYPE, "application/octet-stream"),
                    (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
                ],
                bytes,
            )
                .into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn sync_done(State(state): State<Arc<AppState>>, headers: axum::http::HeaderMap, Query(query): Query<TokenQuery>) -> Response {
    let token = bearer_token(&headers, query.t.as_deref());
    if !session_ok(&state, &token) {
        return json_response(serde_json::json!({ "ok": false, "error": "unauthorized" }));
    }
    json_response(serde_json::json!({ "ok": true }))
}

async fn file_response(path: &std::path::Path, mime: &'static str) -> Response {
    match tokio::fs::read(path).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, mime)], bytes).into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
