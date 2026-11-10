#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod bundle;
#[cfg(target_os = "windows")]
mod window;
mod i18n;
mod icons;
mod model;
mod render;
mod waves;

use axum::extract::{DefaultBodyLimit, Multipart, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Form, Router};
use model::{data_file, Store};
use render::{render, Screen};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tower_http::services::ServeDir;

struct AppState {
    store: Mutex<Store>,
    data_path: PathBuf,
    static_dir: PathBuf,
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
    });
    let port: u16 = std::env::var("IME_RS_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4173);

    let app = Router::new()
        .route("/", get(index))
        .route("/act", post(act))
        .route("/import", post(import_files))
        .route("/import-path", post(import_path))
        .route("/audio/:id", get(audio))
        .route("/api/state", get(api_state))
        .route("/api/deezer", get(deezer_proxy))
        .route("/api/waves", get(waves_pool))
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
        || path.starts_with("/album/");
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

async fn act(State(state): State<Arc<AppState>>, Form(form): Form<ActForm>) -> Response {
    let back = form.back.clone().unwrap_or_else(|| "/".into());
    let ajax = form.ajax.as_deref() == Some("1");
    let action = form.action.clone().unwrap_or_default();
    let mut store = state.store.lock().expect("store");
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
        "reset-wallpaper" => {}
        "reset-preset" | "reset-section" => store.apply_preset("default"),
        "wallpaper" => {}
        "import-path" => {
            if let Some(path) = form.path.or(form.value) {
                store.import_path(std::path::Path::new(&path));
            }
        }
        "find-dupes" | "merge-dupes" => {
            store.merge_duplicates();
        }
        "refresh" | "rebuild-autos" | "check-updates" | "export-backup" | "youtube" | "enrich" => {}
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
        "preset" => store.apply_preset(value),
        _ => {}
    }
}

async fn import_files(State(state): State<Arc<AppState>>, mut multipart: Multipart) -> Redirect {
    let dir = state.data_path.parent().unwrap().join("media");
    let _ = std::fs::create_dir_all(&dir);
    let mut saved = Vec::new();
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.file_name().unwrap_or("track.bin").to_string();
        let name = name.rsplit(['/', '\\']).next().unwrap_or("track.bin");
        let safe: String = name
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
            .collect();
        let dest = dir.join(format!("{}-{}", model_nid(), safe));
        if let Ok(bytes) = field.bytes().await {
            if std::fs::write(&dest, &bytes).is_ok() {
                saved.push(dest);
            }
        }
    }
    let mut store = state.store.lock().expect("store");
    for path in saved {
        store.add_file(&path);
    }
    save(&state, &store);
    Redirect::to("/?view=all")
}

fn model_nid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

async fn import_path(State(state): State<Arc<AppState>>, Form(form): Form<ActForm>) -> Redirect {
    if let Some(path) = form.path.or(form.value) {
        let mut store = state.store.lock().expect("store");
        store.import_path(std::path::Path::new(&path));
        save(&state, &store);
    }
    Redirect::to("/?view=all")
}

async fn audio(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> impl IntoResponse {
    let path = {
        let store = state.store.lock().expect("store");
        store.song(&id).map(|song| song.path.clone())
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
        "m4a" => "audio/mp4",
        _ => "application/octet-stream",
    };
    match tokio::fs::read(&path).await {
        Ok(bytes) => (StatusCode::OK, [(header::CONTENT_TYPE, mime)], bytes).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "missing").into_response(),
    }
}

async fn waves_pool(State(state): State<Arc<AppState>>) -> Response {
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

async fn file_response(path: &std::path::Path, mime: &'static str) -> Response {
    match tokio::fs::read(path).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, mime)], bytes).into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
