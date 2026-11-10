mod i18n;
mod icons;
mod model;
mod render;

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
}

#[tokio::main]
async fn main() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let static_dir = manifest.join("static");
    let data_dir = std::env::var("IME_RS_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest.join("data"));
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
        .nest_service("/brand", ServeDir::new(static_dir.join("brand")))
        .route("/index.css", get(css))
        .route("/player.js", get(player_js))
        .route("/favicon.png", get(favicon))
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .with_state(state);

    let addr = format!("127.0.0.1:{port}");
    println!("IMe Music (Rust) http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
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
        "mute" => store.settings.muted = !store.settings.muted,
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
    save(&state, &store);
    if ajax {
        return (
            [(header::CONTENT_TYPE, "application/json")],
            serde_json::json!({ "ok": true, "id": current }).to_string(),
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

async fn file_response(path: &std::path::Path, mime: &'static str) -> Response {
    match tokio::fs::read(path).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, mime)], bytes).into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
