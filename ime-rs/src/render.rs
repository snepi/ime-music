use crate::i18n::{esc, I18n};
use crate::icons::{icon, icon_class};
use crate::model::Store;

#[derive(Clone)]
pub struct Screen {
    pub view: String,
    pub playlist: String,
    pub settings: String,
    pub section: String,
    pub search: String,
    pub modal: String,
}

impl Screen {
    pub fn path(&self) -> String {
        let mut parts = vec![format!("view={}", urlencoding::encode(&self.view))];
        if !self.playlist.is_empty() {
            parts.push(format!("playlist={}", urlencoding::encode(&self.playlist)));
        }
        if !self.settings.is_empty() {
            parts.push(format!("settings={}", urlencoding::encode(&self.settings)));
        }
        if !self.section.is_empty() {
            parts.push(format!("section={}", urlencoding::encode(&self.section)));
        }
        if !self.search.is_empty() {
            parts.push(format!("q={}", urlencoding::encode(&self.search)));
        }
        if !self.modal.is_empty() {
            parts.push(format!("modal={}", urlencoding::encode(&self.modal)));
        }
        format!("/?{}", parts.join("&"))
    }

    fn with_view(&self, view: &str) -> String {
        let mut next = self.clone();
        next.view = view.into();
        if view != "playlist" {
            next.playlist.clear();
        }
        next.path()
    }
}

pub fn render(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let theme = if store.settings.theme == "light" {
        "light"
    } else {
        "dark"
    };
    let show_sidebar = store.settings.show_sidebar;
    let mut app_class = String::from("app");
    if !show_sidebar {
        app_class.push_str(" app-no-sidebar");
    }
    let mut html = String::new();
    html.push_str(&format!(
        r#"<!doctype html><html lang="{}" data-theme="{}"><head><meta charset="UTF-8"><link rel="icon" type="image/png" href="/brand/icon.png"><link rel="shortcut icon" type="image/png" href="/favicon.png"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>IMe Music</title><link rel="stylesheet" href="/index.css">"#,
        esc(&store.settings.locale),
        theme
    ));
    if let (Some(bg), Some(side), Some(accent)) = (
        store.settings.bg_main.as_ref(),
        store.settings.bg_sidebar.as_ref(),
        store.settings.accent.as_ref(),
    ) {
        html.push_str(&format!(
            r#"<style data-appearance="preset">:root,[data-theme="dark"]{{--bg-main:{bg};--bg-sidebar:{side};--accent:{accent};--accent-hover:{accent};--button-accent:{accent};--progress:{accent};}}</style>"#,
            bg = esc(bg),
            side = esc(side),
            accent = esc(accent)
        ));
    }
    html.push_str(&appearance_style(store));
    if !store.settings.colors.is_empty() {
        let mut css = String::from(r#"<style data-appearance="colors">:root{"#);
        for (key, value) in &store.settings.colors {
            let Some(var_name) = color_var(key) else { continue };
            if value.starts_with('#') || value.starts_with("rgb") {
                css.push_str(var_name);
                css.push(':');
                css.push_str(value);
                css.push(';');
            }
        }
        css.push_str("}</style>");
        html.push_str(&css);
    }
    html.push_str("</head><body");
    html.push_str(&body_attrs(store));
    html.push_str(r#"><div id="root"><div class=""#);
    html.push_str(&app_class);
    html.push_str(r#"">"#);
    if store.settings.wallpaper_mode != "none" && !store.settings.wallpaper_path.is_empty() {
        html.push_str(r#"<div class="app-wallpaper"><img class="app-wallpaper-photo" src="/wallpaper-image" alt=""></div>"#);
    }
    html.push_str(&titlebar(i18n, screen));
    html.push_str(r#"<div class="app-body">"#);
    if show_sidebar {
        html.push_str(&sidebar(store, i18n, screen));
    }
    html.push_str(r#"<main class="main-content">"#);
    html.push_str(&main_view(store, i18n, screen));
    html.push_str("</main></div>");
    html.push_str(&player_bar(store, i18n));
    if !screen.settings.is_empty() {
        html.push_str(&settings_modal(store, i18n, screen));
    }
    if !store.settings.onboarding_done && store.songs.is_empty() {
        html.push_str(&onboarding(i18n));
    }
    if screen.modal == "create" {
        html.push_str(&create_playlist_modal(i18n, screen));
    }
    if screen.modal == "youtube" {
        html.push_str(&youtube_modal(i18n, screen));
    }
    html.push_str("</div></div>");
    html.push_str(&format!(
        r#"<input id="pick-files" data-upload="1" type="file" multiple accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac,.opus,.wma" hidden>
<input id="pick-folder" data-upload="1" type="file" webkitdirectory directory multiple hidden>
<input id="pick-backup" type="file" accept="application/json,.json" hidden>
<input id="pick-playlist" type="file" accept=".m3u,.m3u8,.csv,.txt,text/plain" hidden>
<input id="pick-wallpaper" type="file" accept="image/*" hidden>
<input id="pick-preset" type="file" accept="application/json,.json" hidden>
<script type="application/json" id="hotkeys-seed">{}</script>
<script type="application/json" id="wishlist-seed">{}</script>
<script type="application/json" id="favorite-artists-seed">{}</script>
<script type="application/json" id="library-seed">{}</script>
<script src="/player.js"></script></body></html>"#,
        hotkeys_seed(store),
        wishlist_seed(store),
        favorite_seed(store),
        library_seed(store),
    ));
    html
}

fn color_var(key: &str) -> Option<&'static str> {
    match key {
        "bgMain" => Some("--bg-main"),
        "bgSidebar" => Some("--bg-sidebar"),
        "bgElevated" => Some("--bg-elevated"),
        "bgPanel" => Some("--bg-panel"),
        "bgHover" => Some("--bg-hover"),
        "bgActive" => Some("--bg-active"),
        "textPrimary" => Some("--text-primary"),
        "textSecondary" => Some("--text-secondary"),
        "textMuted" => Some("--text-muted"),
        "accent" => Some("--accent"),
        "accentHover" => Some("--accent-hover"),
        "button" => Some("--button-accent"),
        "progress" => Some("--progress"),
        "like" => Some("--like"),
        "danger" => Some("--danger"),
        "success" => Some("--success"),
        "warning" => Some("--warning"),
        "border" => Some("--border"),
        _ => None,
    }
}

fn ui_str<'a>(store: &'a Store, key: &str, default: &'a str) -> &'a str {
    store
        .settings
        .ui
        .get(key)
        .map(String::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(default)
}

fn ui_on(store: &Store, key: &str, default: bool) -> bool {
    match store.settings.ui.get(key).map(String::as_str) {
        Some("1") | Some("true") => true,
        Some("0") | Some("false") => false,
        _ => default,
    }
}

fn flag(on: bool) -> &'static str {
    if on { "1" } else { "0" }
}

fn body_attrs(store: &Store) -> String {
    let wallpaper = store.settings.wallpaper_mode != "none" && !store.settings.wallpaper_path.is_empty();
    format!(
        r#" data-volume="{volume}" data-current="{current}" data-density="{density}" data-sidebar-pos="{side}" data-reduced-motion="{motion}" data-wallpaper="{wallpaper}" data-confirm-delete="{confirm_delete}" data-confirm-queue="{confirm_queue}" data-space="{space}" data-focus-search="{focus}" data-auto-resume="{resume}" data-double-click="{dbl}" data-player-art="{art}" data-player-title="{title}" data-player-artist="{artist}" data-player-prev="{prev}" data-player-next="{next}" data-player-play="{play}" data-player-volume="{vol}" data-player-progress="{progress}" data-player-time="{time}" data-player-queue="{queue}" data-player-like="{like}" data-list-art="{list_art}" data-list-index="{list_index}" data-animations="{anim}" data-show-search="{search}" data-show-queue="{queue_btn}" data-gapless="{gapless}" data-crossfade="{crossfade}" data-eq="{eq}" data-normalize="{normalize}" data-eq-bass="{bass}" data-eq-mid="{mid}" data-eq-treble="{treble}" data-archive-ahead="{ahead}" data-archive-keep="{keep}""#,
        volume = store.settings.volume,
        current = esc(store.player.current_id.as_deref().unwrap_or("")),
        density = esc(ui_str(store, "layout.density", "standard")),
        side = esc(ui_str(store, "layout.sidebarPosition", "left")),
        motion = flag(ui_on(store, "animations.reducedMotion", false)),
        wallpaper = if wallpaper { "on" } else { "off" },
        confirm_delete = flag(store.settings.behavior.confirm_delete),
        confirm_queue = flag(store.settings.behavior.confirm_clear_queue),
        space = flag(store.settings.behavior.space_toggles_playback),
        focus = flag(store.settings.behavior.focus_search_on_open),
        resume = flag(store.settings.behavior.auto_resume_on_launch),
        dbl = esc(ui_str(store, "library.doubleClick", "playNow")),
        art = flag(ui_on(store, "player.showArtwork", true)),
        title = flag(ui_on(store, "player.showTitle", true)),
        artist = flag(ui_on(store, "player.showArtist", true)),
        prev = flag(ui_on(store, "player.showPrevNext", true)),
        next = flag(ui_on(store, "player.showPrevNext", true)),
        play = flag(ui_on(store, "player.showPlayPause", true)),
        vol = flag(ui_on(store, "player.showVolume", true)),
        progress = flag(ui_on(store, "player.showProgress", true)),
        time = flag(ui_on(store, "player.showTime", true)),
        queue = flag(ui_on(store, "player.showQueueButton", true)),
        like = flag(ui_on(store, "player.showLike", true)),
        list_art = flag(ui_on(store, "layout.showArtworkInList", true) && ui_on(store, "covers.show", true)),
        list_index = flag(ui_on(store, "layout.showTrackNumbers", true)),
        anim = flag(ui_on(store, "animations.enabled", true)),
        search = flag(store.settings.show_search),
        queue_btn = flag(store.settings.show_queue),
        gapless = flag(store.settings.playback.gapless_enabled),
        crossfade = store.settings.playback.crossfade_seconds,
        eq = flag(store.settings.playback.eq_enabled),
        normalize = flag(store.settings.playback.normalize_volume),
        bass = store.settings.playback.eq_bass,
        mid = store.settings.playback.eq_mid,
        treble = store.settings.playback.eq_treble,
        ahead = store.settings.archive_ahead.clamp(2, 20),
        keep = store.settings.archive_keep.clamp(10, 250),
    )
}

fn appearance_style(store: &Store) -> String {
    format!(
        r#"<style data-appearance="vars">:root{{--ui-zoom:{scale}%;--ui-font:{font}px;--sidebar-width:{side}px;--player-height:{player}px;--radius:{radius}px;--player-cover-size:{cover}px;--list-cover-size:{list}px;--cover-radius:{cover_radius}px;--cover-fit:{fit};--content-max:{content}px;--title-size:{title}px;}}</style>"#,
        scale = esc(ui_str(store, "layout.uiScale", "100")),
        font = esc(ui_str(store, "layout.fontSize", "14")),
        side = esc(ui_str(store, "layout.sidebarWidth", "260")),
        player = esc(ui_str(store, "layout.playerHeight", "96")),
        radius = esc(ui_str(store, "layout.borderRadius", "10")),
        cover = esc(ui_str(store, "player.coverSize", "56")),
        list = esc(ui_str(store, "library.coverSize", "40")),
        cover_radius = esc(ui_str(store, "covers.radius", "8")),
        fit = esc(ui_str(store, "covers.objectFit", "cover")),
        content = esc(ui_str(store, "components.contentMaxWidth", "1200")),
        title = esc(ui_str(store, "components.titleSize", "28")),
    )
}

fn hotkey_defaults() -> &'static [(&'static str, &'static str, &'static str)] {
    &[
        ("playPause", "Space", "settings.hotkeys.playPause"),
        ("next", "MediaTrackNext", "settings.hotkeys.next"),
        ("previous", "MediaTrackPrevious", "settings.hotkeys.previous"),
        ("volumeUp", "ArrowUp", "settings.hotkeys.volumeUp"),
        ("volumeDown", "ArrowDown", "settings.hotkeys.volumeDown"),
        ("mute", "KeyM", "settings.hotkeys.mute"),
        ("like", "KeyL", "settings.hotkeys.like"),
        ("addToQueue", "", "settings.hotkeys.addToQueue"),
        ("search", "KeyF", "settings.hotkeys.search"),
        ("settings", "Comma", "settings.hotkeys.settings"),
        ("queue", "KeyQ", "settings.hotkeys.queue"),
        ("toggleTheme", "KeyT", "settings.hotkeys.toggleTheme"),
        ("editMetadata", "KeyI", "settings.hotkeys.editMetadata"),
    ]
}

fn hotkey_value(store: &Store, action: &str, default: &str) -> String {
    store.settings.hotkeys.get(action).cloned().unwrap_or_else(|| default.to_string())
}

fn hotkeys_seed(store: &Store) -> String {
    let parts: Vec<String> = hotkey_defaults()
        .iter()
        .map(|(action, default, _)| {
            format!(
                r#""{}":"{}""#,
                action,
                json_escape(&hotkey_value(store, action, default))
            )
        })
        .collect();
    format!("{{{}}}", parts.join(","))
}

fn library_seed(store: &Store) -> String {
    let mut parts = Vec::new();
    for song in &store.songs {
        parts.push(format!(
            r#"{{"id":"{}","title":"{}","artist":"{}","liked":{}}}"#,
            json_escape(&song.id),
            json_escape(&song.title),
            json_escape(&song.artist),
            if song.liked { "true" } else { "false" },
        ));
    }
    format!("[{}]", parts.join(","))
}

fn favorite_seed(store: &Store) -> String {
    let mut parts = Vec::new();
    for artist in &store.settings.favorite_artists {
        parts.push(format!(
            r#"{{"name":"{}","deezerId":"{}","picture":"{}"}}"#,
            json_escape(&artist.name),
            json_escape(&artist.deezer_id),
            json_escape(&artist.picture),
        ));
    }
    format!("[{}]", parts.join(","))
}

fn wishlist_seed(store: &Store) -> String {
    let mut parts = Vec::new();
    for wish in &store.settings.wishlist {
        parts.push(format!(
            r#"{{"title":"{}","artist":"{}"}}"#,
            json_escape(&wish.title),
            json_escape(&wish.artist)
        ));
    }
    format!("[{}]", parts.join(","))
}

fn json_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn history_when(i18n: &I18n, played_at: i64) -> String {
    let played = (played_at.max(0) as u64) / 1000;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let clock = format!("{:02}:{:02}", (played % 86400) / 3600, (played % 3600) / 60);
    if played / 86400 == now / 86400 {
        return i18n.tf("history.today", &[("time", &clock)]);
    }
    let (year, month, day) = civil_date(played / 86400);
    format!("{day:02}.{month:02}.{year} {clock}")
}

fn civil_date(days_since_epoch: u64) -> (i32, u32, u32) {
    let z = days_since_epoch as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year as i32, month as u32, day as u32)
}

fn go_button(class: &str, href_screen: &Screen, inner: &str) -> String {
    format!(
        r#"<form method="get" action="/" style="display:contents">{hidden}<button type="submit" class="{class}">{inner}</button></form>"#,
        hidden = hidden_query(href_screen),
        class = class,
        inner = inner
    )
}

fn hidden_query(screen: &Screen) -> String {
    let mut s = format!(
        r#"<input type="hidden" name="view" value="{}">"#,
        esc(&screen.view)
    );
    if !screen.playlist.is_empty() {
        s.push_str(&format!(
            r#"<input type="hidden" name="playlist" value="{}">"#,
            esc(&screen.playlist)
        ));
    }
    if !screen.settings.is_empty() {
        s.push_str(&format!(
            r#"<input type="hidden" name="settings" value="{}">"#,
            esc(&screen.settings)
        ));
    }
    if !screen.section.is_empty() {
        s.push_str(&format!(
            r#"<input type="hidden" name="section" value="{}">"#,
            esc(&screen.section)
        ));
    }
    if !screen.search.is_empty() {
        s.push_str(&format!(
            r#"<input type="hidden" name="q" value="{}">"#,
            esc(&screen.search)
        ));
    }
    if !screen.modal.is_empty() {
        s.push_str(&format!(
            r#"<input type="hidden" name="modal" value="{}">"#,
            esc(&screen.modal)
        ));
    }
    let _ = path_unused(&screen.path());
    s
}

fn path_unused(s: &str) -> &str {
    s
}

fn titlebar(i18n: &I18n, screen: &Screen) -> String {
    let mut settings = screen.clone();
    settings.settings = "appearance".into();
    settings.section = "general".into();
    settings.modal.clear();
    format!(
        r#"<div class="titlebar"><div class="titlebar-left"><img class="titlebar-app-icon" src="/brand/icon.png" alt="" width="22" height="22" draggable="false"><img class="titlebar-wordmark" src="/brand/wordmark.png" alt="IMe Music" draggable="false"></div><div class="titlebar-controls"><div class="titlebar-notifications-wrap"><button type="button" class="titlebar-btn" data-bell="1" aria-label="{bell}" title="{bell_hint}"><span class="titlebar-btn-icon">{bell_icon}</span></button></div>{settings_btn}<button type="button" class="titlebar-btn" data-win="minimize" aria-label="{min}" title="{min}">{min_icon}</button><button type="button" class="titlebar-btn" data-win="maximize" aria-label="{max}" title="{max}">{max_icon}</button><button type="button" class="titlebar-btn close" data-win="close" aria-label="{close}" title="{close}">{close_icon}</button></div></div>"#,
        bell = esc(&i18n.t("import.notifications")),
        bell_hint = esc(&i18n.t("import.notificationsHint")),
        bell_icon = icon("bell", 14),
        settings_btn = go_button(
            "titlebar-btn",
            &settings,
            &icon("settings", 14)
        ),
        min = esc(&i18n.t("window.minimize")),
        max = esc(&i18n.t("window.maximize")),
        close = esc(&i18n.t("window.close")),
        min_icon = icon("minimize", 14),
        max_icon = icon("maximize", 14),
        close_icon = icon("close", 14),
    )
}

fn nav_button(screen: &Screen, view: &str, active: bool, icon_name: &str, label: &str, count: Option<usize>) -> String {
    let mut next = screen.clone();
    next.view = view.into();
    next.playlist.clear();
    next.modal.clear();
    let class = if active { "nav-item active" } else { "nav-item" };
    let mut inner = format!(r#"{}<span class="nav-label">{}</span>"#, icon(icon_name, 18), esc(label));
    if let Some(n) = count {
        inner.push_str(&format!(r#"<span class="nav-count">{n}</span>"#));
    }
    go_button(class, &next, &inner)
}

fn sidebar(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let liked = store.songs.iter().filter(|s| s.liked).count();
    let wish = store.settings.wishlist.len();
    let mut html = String::from(r#"<aside class="sidebar" style="opacity:1"><div class="sidebar-top">"#);
    html.push_str(&format!(
        r#"<form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="collapse"><input type="hidden" name="back" value="{}"><button type="submit" class="sidebar-collapse-btn" aria-label="{}" title="{}">{}</button></form></div>"#,
        esc(&screen.path()),
        esc(&i18n.t("nav.collapse")),
        esc(&i18n.t("nav.collapse")),
        icon("panelLeft", 16)
    ));
    html.push_str(&format!(
        r#"<nav class="sidebar-nav" aria-label="{}"><div class="sidebar-section-label">{}</div>"#,
        esc(&i18n.t("nav.library")),
        esc(&i18n.t("nav.library"))
    ));
    let view = screen.view.as_str();
    html.push_str(&nav_button(screen, "home", view == "home", "sun", &i18n.t("nav.home"), None));
    html.push_str(&nav_button(screen, "all", view == "all", "music", &i18n.t("nav.all"), Some(store.songs.len())));
    html.push_str(&nav_button(screen, "liked", view == "liked", "heartOutline", &i18n.t("nav.liked"), Some(liked)));
    html.push_str(&nav_button(screen, "recommendations", view == "recommendations", "disc", &i18n.t("nav.recommendations"), None));
    let wish_count = if wish > 0 { Some(wish) } else { None };
    html.push_str(&nav_button(screen, "wishlist", view == "wishlist", "heartOutline", &i18n.t("nav.wishlist"), wish_count));
    html.push_str(&nav_button(screen, "history", view == "history", "history", &i18n.t("nav.history"), None));
    let archive_count = if store.archive.is_empty() { None } else { Some(store.archive.len()) };
    html.push_str(&nav_button(screen, "archive", view == "archive", "folder", "Архив", archive_count));
    html.push_str("</nav>");
    let mut create = screen.clone();
    create.modal = "create".into();
    html.push_str(&format!(
        r#"<div class="playlists-header"><button type="button" class="playlists-toggle" aria-expanded="true">{}<span>{}</span></button>{}</div><div class="playlists-list">"#,
        icon("chevronDown", 14),
        esc(&i18n.t("nav.playlists")),
        go_button("btn btn-icon icon-btn", &create, &icon("add", 16))
    ));
    for pl in &store.playlists {
        let active = view == "playlist" && screen.playlist == pl.id;
        let mut next = screen.clone();
        next.view = "playlist".into();
        next.playlist = pl.id.clone();
        next.modal.clear();
        let class = if active { "nav-item active" } else { "nav-item" };
        let inner = format!(
            r#"{}<span class="nav-label">{}</span><span class="nav-count">{}</span>"#,
            icon("playlist", 18),
            esc(&pl.name),
            pl.song_ids.len()
        );
        html.push_str(&go_button(class, &next, &inner));
    }
    html.push_str("</div>");
    if let Some(id) = &store.player.current_id {
        if let Some(song) = store.song(id) {
            let heart = if song.liked { "heart" } else { "heartOutline" };
            let artist_label = if song.artist.is_empty() {
                i18n.t("lib.unknownArtist")
            } else {
                song.artist.clone()
            };
            html.push_str(&format!(
                r#"<div class="sidebar-now-playing"><div class="sidebar-cover sidebar-cover-fallback">{}</div><div class="sidebar-song-info"><div class="sidebar-song-title" title="{}">{}</div><button type="button" class="artist-link sidebar-song-artist" data-open-artist="1" data-artist-name="{}">{}</button></div><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="like"><input type="hidden" name="id" value="{}"><input type="hidden" name="back" value="{}"><button type="submit" class="like-btn {}" aria-label="{}">{}</button></form></div>"#,
                icon("disc", 20),
                esc(&song.title),
                esc(&song.title),
                esc(&artist_label),
                esc(&artist_label),
                esc(&song.id),
                esc(&screen.path()),
                if song.liked { "liked" } else { "" },
                esc(&i18n.t(if song.liked { "player.unlike" } else { "player.like" })),
                icon(heart, 16)
            ));
        }
    }
    html.push_str("</aside>");
    html
}

fn main_view(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    match screen.view.as_str() {
        "all" | "liked" | "playlist" => library_view(store, i18n, screen),
        "wishlist" => wishlist_view(store, i18n, screen),
        "history" => history_view(store, i18n),
        "archive" => archive_view(store, screen),
        "recommendations" => recommendations_view(i18n, screen),
        _ => home_view(store, i18n),
    }
}

fn archive_view(store: &Store, _screen: &Screen) -> String {
    let ahead = store.settings.archive_ahead.clamp(2, 20);
    let keep = store.settings.archive_keep.clamp(10, 250);
    let mut rows = String::new();
    if store.archive.is_empty() {
        rows.push_str(r#"<p class="artist-view-empty">Архив пуст. Включите IMe Waves — следующие треки скачаются сюда и не попадут в библиотеку.</p>"#);
    }
    for (index, item) in store.archive.iter().rev().enumerate() {
        rows.push_str(&format!(
            r#"<li class="song-row" data-archive-id="{id}"><span class="song-index"><span class="index-num">{n}</span></span><div class="song-cover-cell"><div class="song-cover song-cover-fallback">{disc}</div></div><div class="song-title-cell"><div class="song-text"><button type="button" class="song-name" data-archive-play="1" data-id="{id}" data-title="{title}" data-artist="{artist}">{title}</button><span class="song-artist">{artist}</span></div></div><button type="button" class="btn btn-secondary archive-move" data-archive-library="1" data-id="{id}">В библиотеку</button></li>"#,
            n = index + 1,
            id = esc(&item.id),
            title = esc(&item.title),
            artist = esc(&item.artist),
            disc = crate::icons::icon("disc", 18),
        ));
    }
    let mix_keep = store.settings.archive_mix_keep.clamp(4, 20);
    let mut seen = Vec::new();
    let mut mix_cards = String::new();
    for item in &store.archive {
        if item.mix_id.is_empty() || seen.iter().any(|id: &String| id == &item.mix_id) {
            continue;
        }
        seen.push(item.mix_id.clone());
        let count = store.archive.iter().filter(|row| row.mix_id == item.mix_id).count();
        mix_cards.push_str(&format!(
            r#"<li class="archive-mix-card"><div><strong>{title}</strong><span>{count} треков</span></div><button type="button" class="btn btn-ghost" data-delete-mix="{id}">Удалить</button></li>"#,
            title = esc(&item.mix_title),
            count = count,
            id = esc(&item.mix_id),
        ));
    }
    if mix_cards.is_empty() {
        mix_cards.push_str(r#"<li class="archive-mix-empty">Скачанных миксов пока нет.</li>"#);
    }
    format!(
        r#"<div class="archive-view"><div class="view-header"><div class="view-info"><h1>Архив</h1><p>Полные файлы волны и скачанные миксы. Они не лежат в библиотеке, пока вы сами их туда не перенесёте.</p></div></div><div class="archive-settings"><label class="archive-field"><span class="field-label" for="archive-ahead">Сколько следующих треков качать</span><input id="archive-ahead" class="field-input" type="number" min="2" max="20" step="1" value="{ahead}" data-archive-setting="archive_ahead"><span class="field-hint">От 2 до 20. Столько ближайших треков волна качает вперёд.</span></label><label class="archive-field"><span class="field-label" for="archive-keep">Сколько треков хранить</span><input id="archive-keep" class="field-input" type="number" min="10" max="250" step="1" value="{keep}" data-archive-setting="archive_keep"><span class="field-hint">От 10 до 250. Следующий сверх лимита заменяет самый старый.</span></label><label class="archive-field"><span class="field-label" for="archive-mix-keep">Сколько миксов хранить</span><input id="archive-mix-keep" class="field-input" type="number" min="4" max="20" step="1" value="{mix_keep}" data-archive-setting="archive_mix_keep"><span class="field-hint">От 4 до 20 скачанных микс-альбомов.</span></label></div><section class="archive-mixes"><h2>Скачанные миксы</h2><ul class="archive-mix-list">{mix_cards}</ul></section><ul class="song-list archive-list">{rows}</ul></div>"#,
        ahead = ahead,
        keep = keep,
        mix_keep = mix_keep,
        mix_cards = mix_cards,
        rows = rows,
    )
}

fn waves_chip_row(i18n: &I18n, field: &str, current: &str, options: &[(&str, &str)]) -> String {
    let mut html = String::new();
    for (value, key) in options {
        let active = *value == current;
        html.push_str(&format!(
            r#"<button type="button" class="waves-chip{}" data-waves-field="{}" data-waves-value="{}" aria-pressed="{}">{}</button>"#,
            if active { " is-active" } else { "" },
            esc(field),
            esc(value),
            if active { "true" } else { "false" },
            esc(&i18n.t(key)),
        ));
    }
    html
}

fn waves_settings(store: &Store, i18n: &I18n) -> String {
    let waves = &store.settings.waves;
    let block = |label: &str, row: String| {
        format!(
            r#"<div class="home-waves-settings-block"><div class="home-waves-settings-label">{}</div><div class="waves-chip-row">{}</div></div>"#,
            esc(&i18n.t(label)),
            row
        )
    };
    format!(
        r#"<div class="home-waves-settings" id="waves-settings" hidden>{}{}{}{}{}<label class="home-waves-toggle"><input type="checkbox" data-waves-field="skipKnown"{}><span>{}</span></label><div class="home-waves-settings-actions"><button type="button" class="btn btn-primary" data-act="waves-save">{}</button><button type="button" class="btn btn-secondary" data-act="waves-reset">{}</button><button type="button" class="btn btn-secondary" data-act="waves-refresh">{}</button></div><p class="home-waves-settings-hint">{}</p></div>"#,
        block(
            "waves.genre",
            waves_chip_row(
                i18n,
                "genre",
                &waves.genre,
                &[
                    ("all", "waves.genre.all"),
                    ("rock", "waves.genre.rock"),
                    ("pop", "waves.genre.pop"),
                    ("rap", "waves.genre.rap"),
                    ("ruRap", "waves.genre.ruRap"),
                    ("electronic", "waves.genre.electronic"),
                    ("rnb", "waves.genre.rnb"),
                    ("indie", "waves.genre.indie"),
                    ("metal", "waves.genre.metal"),
                    ("dance", "waves.genre.dance"),
                    ("jazz", "waves.genre.jazz"),
                ],
            )
        ),
        block(
            "waves.language",
            waves_chip_row(
                i18n,
                "language",
                &waves.language,
                &[
                    ("any", "waves.language.any"),
                    ("ru", "waves.language.ru"),
                    ("en", "waves.language.en"),
                ],
            )
        ),
        block(
            "waves.mood",
            waves_chip_row(
                i18n,
                "mood",
                &waves.mood,
                &[
                    ("any", "waves.mood.any"),
                    ("energetic", "waves.mood.energetic"),
                    ("chill", "waves.mood.chill"),
                    ("dark", "waves.mood.dark"),
                    ("happy", "waves.mood.happy"),
                ],
            )
        ),
        block(
            "waves.seed",
            waves_chip_row(
                i18n,
                "seed",
                &waves.seed,
                &[
                    ("taste", "waves.seed.taste"),
                    ("chart", "waves.seed.chart"),
                    ("liked", "waves.seed.liked"),
                    ("wishlist", "waves.seed.wishlist"),
                ],
            )
        ),
        block(
            "waves.diversity",
            waves_chip_row(
                i18n,
                "diversity",
                &waves.diversity,
                &[
                    ("normal", "waves.diversity.normal"),
                    ("high", "waves.diversity.high"),
                ],
            )
        ),
        if waves.skip_known { " checked" } else { "" },
        esc(&i18n.t("waves.skipKnown")),
        esc(&i18n.t("common.save")),
        esc(&i18n.t("common.reset")),
        esc(&i18n.t("rec.refresh")),
        esc(&i18n.t("waves.settingsHint")),
    )
}

fn home_view(store: &Store, i18n: &I18n) -> String {
    let mut html = format!(
        r#"<div class="home-view"><div class="view-header"><div class="view-info"><h1>{}</h1><p>{}</p></div><button type="button" class="btn btn-primary" data-pick="pick-folder">{}{}</button></div><section class="home-discovery-search"><div class="search-field home-discovery-search-field">{}<input type="search" class="search-input" placeholder="{}" aria-label="{}"></div><p class="home-discovery-search-hint">{}</p><div id="discovery-results"></div></section><section class="home-waves"><div class="home-waves-card"><button type="button" class="home-waves-main" data-act="waves" aria-label="{}"><div class="home-waves-visual" aria-hidden="true"><span class="home-waves-bar"></span><span class="home-waves-bar"></span><span class="home-waves-bar"></span><span class="home-waves-bar"></span><span class="home-waves-bar"></span></div><div class="home-waves-text"><div class="home-waves-brand">IMe Waves</div><div class="home-waves-title">{}</div><div class="home-waves-meta">{}</div></div><span class="home-waves-play" aria-hidden="true">{}</span></button><div class="home-waves-actions"><button type="button" class="btn btn-ghost" data-act="waves-settings" title="{}" aria-expanded="false" aria-controls="waves-settings">{}</button></div></div>{}</section>"#,
        esc(&i18n.t("home.title")),
        esc(&i18n.t("home.welcomeHint")),
        icon("import", 16),
        esc(&i18n.t("home.importFolder")),
        icon_class("search", 16, "search-icon"),
        esc(&i18n.t("home.searchPlaceholder")),
        esc(&i18n.t("home.searchLabel")),
        esc(&i18n.t("home.searchHint")),
        esc(&i18n.t("waves.play")),
        esc(&i18n.t("waves.headline")),
        esc(&i18n.t("waves.subtitle")),
        icon("play", 22),
        esc(&i18n.t("waves.settings")),
        icon("settings", 16),
        waves_settings(store, i18n),
    );
    html.push_str(&home_continue(store));
    html.push_str(&home_library_mixes(store));
    html.push_str(&home_created_mixes(store));
    html.push_str("</div>");
    html
}

fn home_continue(store: &Store) -> String {
    let Some(song) = store.continue_song() else {
        return r#"<section class="home-continue"><h2 class="home-section-title">Продолжить</h2><p class="home-section-empty">Здесь появится то, что вы слушали в последний раз.</p></section>"#.into();
    };
    let cover = if song.cover_path.is_empty() {
        icon("disc", 22)
    } else {
        format!(r#"<img src="/cover/{}" alt="">"#, esc(&song.id))
    };
    format!(
        r#"<section class="home-continue"><h2 class="home-section-title">Продолжить</h2><div class="home-continue-card"><button type="button" class="home-continue-main" data-play="{id}" data-title="{title}" data-artist="{artist}"><span class="home-continue-cover">{cover}</span><span class="home-continue-text"><span class="home-continue-label">Последнее</span><span class="home-continue-title">{title}</span><span class="home-continue-meta">{artist}</span></span></button><button type="button" class="home-continue-play" data-play="{id}" data-title="{title}" data-artist="{artist}" aria-label="Слушать">{play}</button></div></section>"#,
        id = esc(&song.id),
        title = esc(&song.title),
        artist = esc(&song.artist),
        cover = cover,
        play = icon("play", 20),
    )
}

fn home_library_mixes(store: &Store) -> String {
    let mixes = store.library_mixes();
    let mut cards = String::new();
    if mixes.is_empty() {
        cards.push_str(r#"<p class="home-section-empty">Добавьте треки в библиотеку — миксы соберутся из них.</p>"#);
    }
    for mix in mixes {
        let ids = mix.song_ids.iter().cloned().collect::<Vec<_>>().join(",");
        cards.push_str(&format!(
            r#"<li><button type="button" class="home-card" data-library-mix="1" data-ids="{ids}" data-title="{title}"><span class="home-card-cover">{cover}<span class="home-card-play">{play}</span></span><span class="home-card-title">{title}</span><span class="home-card-artist">{count} треков</span></button></li>"#,
            ids = esc(&ids),
            title = esc(&mix.title),
            cover = mix_cover(&mix.title),
            play = icon("play", 14),
            count = mix.song_ids.len(),
        ));
    }
    format!(
        r#"<section class="home-section"><h2 class="home-section-title">Смиксовали для вас</h2><p class="home-section-hint">Из вашей библиотеки. Набор сам меняется каждые 5 часов.</p><ul class="home-rail">{cards}</ul></section>"#,
        cards = cards,
    )
}

fn home_created_mixes(store: &Store) -> String {
    if store.created_mixes.is_empty() {
        return r#"<section class="home-section"><h2 class="home-section-title">Миксы не из библиотеки</h2><p class="home-section-hint">Треки скачаются как в IMe Waves и попадут в архив.</p><form method="post" action="/act"><input type="hidden" name="action" value="create-mixes"><input type="hidden" name="back" value="/?view=home"><button type="submit" class="btn btn-primary">Создать миксы</button></form></section>"#.into();
    }
    let wait = store.mix_refresh_wait_ms();
    let refresh = if wait <= 0 {
        r#"<form method="post" action="/act"><input type="hidden" name="action" value="create-mixes"><input type="hidden" name="back" value="/?view=home"><button type="submit" class="btn btn-secondary">Обновить миксы</button></form>"#.to_string()
    } else {
        format!(r#"<button type="button" class="btn btn-secondary" disabled>Обновить через {} ч</button>"#, ((wait as f64) / 3_600_000.0).ceil() as i64)
    };
    let mut cards = String::new();
    let mut seed = String::from("[");
    for (index, mix) in store.created_mixes.iter().enumerate() {
        if index > 0 {
            seed.push(',');
        }
        let tracks = mix
            .tracks
            .iter()
            .map(|track| format!(r#"{{"title":"{}","artist":"{}"}}"#, json_escape(&track.title), json_escape(&track.artist)))
            .collect::<Vec<_>>()
            .join(",");
        seed.push_str(&format!(r#"{{"id":"{}","title":"{}","tracks":[{}]}}"#, json_escape(&mix.id), json_escape(&mix.title), tracks));
        cards.push_str(&format!(
            r#"<li class="home-mix-card"><div class="home-card-cover">{cover}</div><div class="home-card-title">{title}</div><div class="home-card-artist">{count} треков</div><button type="button" class="btn btn-secondary" data-download-mix="{id}">Скачать</button></li>"#,
            cover = mix_cover(&mix.title),
            title = esc(&mix.title),
            count = mix.tracks.len(),
            id = esc(&mix.id),
        ));
    }
    seed.push(']');
    format!(
        r#"<section class="home-section"><div class="home-section-head"><h2 class="home-section-title">Миксы не из библиотеки</h2>{refresh}</div><p class="home-section-hint">Их можно скачать по одному или все сразу. Обновление доступно раз в 3 часа. Файлы лягут в архив.</p><ul class="home-rail home-mix-rail">{cards}</ul><button type="button" class="btn btn-primary" data-download-all-mixes="1">Скачать все</button><script type="application/json" id="created-mixes-seed">{seed}</script></section>"#,
        refresh = refresh,
        cards = cards,
        seed = seed,
    )
}

fn mix_cover(title: &str) -> String {
    let looks: &[(&str, &str, &str, usize)] = &[
        ("Смиксовали ваши треки в стиле рок", "рок", "#ff3b30", 0),
        ("Смиксовали ваши треки в жанре рэп", "рэп", "#7c4dff", 1),
        ("Смиксовали ваши треки в стиле поп", "поп", "#ff2d95", 2),
        ("Смиксовали ваши треки в стиле электро", "электро", "#00e5ff", 3),
        ("Смиксовали ваши треки в стиле джаз", "джаз", "#ffb300", 4),
        ("Смиксовали ваши треки в стиле инди", "инди", "#69f0ae", 5),
        ("Смиксовали ваши русские треки", "русские", "#2979ff", 6),
        ("Смиксовали ваши зарубежные треки", "зарубежные", "#ff6d00", 7),
        ("Смиксовали ваши любимые треки", "любимые", "#ff1744", 0),
        ("Смиксовали то, что вы часто слушаете", "часто", "#00e676", 1),
        ("Смиксовали ваши новые треки", "новые", "#18ffff", 2),
        ("Смиксовали ваши спокойные треки", "спокойные", "#b388ff", 3),
        ("Смиксовали ваши танцевальные треки", "танцы", "#ffea00", 4),
        ("Смиксовали ваши саундтреки", "саундтрек", "#ff4081", 5),
        ("Смиксовали ваши треки в стиле соул", "соул", "#ff9100", 6),
        ("Микс в стиле рок", "рок", "#e53935", 1),
        ("Микс в жанре рэп", "рэп", "#651fff", 2),
        ("Микс в стиле поп", "поп", "#f50057", 3),
        ("Микс в стиле электро", "электро", "#00b0ff", 4),
        ("Микс в стиле джаз", "джаз", "#ffd600", 5),
        ("Микс в стиле инди", "инди", "#00c853", 6),
        ("Микс в стиле соул", "соул", "#ff6f00", 7),
        ("Микс в стиле метал", "метал", "#d50000", 0),
        ("Микс в стиле фолк", "фолк", "#64dd17", 1),
        ("Микс в стиле латина", "латина", "#ffab00", 2),
        ("Микс в стиле k-pop", "k-pop", "#ea80fc", 3),
        ("Микс в стиле классика", "классика", "#40c4ff", 4),
        ("Микс из саундтреков", "саундтрек", "#ff5252", 5),
        ("Микс в стиле лоуфай", "лоуфай", "#b2ff59", 6),
        ("Микс в стиле диско", "диско", "#ffd740", 7),
    ];
    let found = looks.iter().find(|(name, _, _, _)| *name == title);
    let label = found.map(|(_, label, _, _)| *label).unwrap_or("микс");
    let color = found.map(|(_, _, color, _)| *color).unwrap_or("#ff4081");
    let shape = found.map(|(_, _, _, shape)| *shape).unwrap_or(0);
    let ink = if matches!(shape, 3 | 4) { "#102018" } else { "#ffffff" };
    let mark = 28 + (title.len() % 12) * 12;
    let drawing = match shape {
        0 => r##"<line x1="16" y1="36" x2="184" y2="36" stroke="#ffffff" stroke-width="8"/><line x1="16" y1="58" x2="150" y2="58" stroke="#ffffff" stroke-width="8"/><line x1="16" y1="80" x2="120" y2="80" stroke="#ffffff" stroke-width="8"/>"##,
        1 => r##"<circle cx="58" cy="58" r="28" fill="none" stroke="#ffffff" stroke-width="8"/><circle cx="128" cy="48" r="16" fill="#ffffff"/><circle cx="150" cy="92" r="10" fill="none" stroke="#ffffff" stroke-width="6"/>"##,
        2 => r##"<line x1="20" y1="100" x2="100" y2="20" stroke="#ffffff" stroke-width="8"/><line x1="50" y1="110" x2="140" y2="20" stroke="#ffffff" stroke-width="8"/><line x1="90" y1="110" x2="180" y2="20" stroke="#ffffff" stroke-width="8"/>"##,
        3 => r##"<circle cx="40" cy="40" r="8" fill="#102018"/><circle cx="80" cy="40" r="8" fill="#102018"/><circle cx="120" cy="40" r="8" fill="#102018"/><circle cx="60" cy="76" r="8" fill="#102018"/><circle cx="100" cy="76" r="8" fill="#102018"/>"##,
        4 => r##"<polygon points="100,18 160,96 40,96" fill="none" stroke="#102018" stroke-width="8"/><polygon points="70,70 110,70 90,104" fill="#102018"/>"##,
        5 => r##"<path d="M20 90 A50 50 0 0 1 120 40" fill="none" stroke="#ffffff" stroke-width="8"/><path d="M40 110 A70 70 0 0 1 170 50" fill="none" stroke="#ffffff" stroke-width="8"/>"##,
        6 => r##"<rect x="28" y="28" width="48" height="48" fill="none" stroke="#ffffff" stroke-width="8"/><rect x="96" y="40" width="36" height="36" fill="#ffffff"/><rect x="146" y="28" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="6"/>"##,
        _ => r##"<line x1="24" y1="30" x2="176" y2="30" stroke="#ffffff" stroke-width="6"/><line x1="100" y1="18" x2="100" y2="100" stroke="#ffffff" stroke-width="8"/><circle cx="100" cy="78" r="18" fill="none" stroke="#ffffff" stroke-width="6"/>"##,
    };
    format!(
        r#"<svg class="mix-cover" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="200" height="200" fill="{color}"/>{drawing}<circle cx="{mark}" cy="22" r="8" fill="{ink}"/><text x="16" y="148" fill="{ink}" font-size="18" font-family="sans-serif">Микс для вас</text><text x="16" y="176" fill="{ink}" font-size="22" font-weight="700" font-family="sans-serif">{label}</text></svg>"#,
        color = color,
        drawing = drawing,
        mark = mark,
        ink = ink,
        label = esc(label),
    )
}

fn track_count(i18n: &I18n, count: usize) -> String {
    let n = count as i64;
    let mod10 = n.abs() % 10;
    let mod100 = n.abs() % 100;
    let key = if mod10 == 1 && mod100 != 11 {
        "lib.trackOne"
    } else if (2..=4).contains(&mod10) && !(10..20).contains(&mod100) {
        "lib.trackFew"
    } else {
        "lib.trackMany"
    };
    let n = count.to_string();
    i18n.tf(key, &[("count", &n)])
}

fn library_view(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let (title, subtitle) = match screen.view.as_str() {
        "liked" => (i18n.t("nav.liked"), i18n.t("lib.likedSubtitle")),
        "playlist" => {
            let name = store
                .playlists
                .iter()
                .find(|p| p.id == screen.playlist)
                .map(|p| p.name.clone())
                .unwrap_or_else(|| i18n.t("lib.playlist"));
            (name, i18n.t("lib.playlist"))
        }
        _ => (i18n.t("nav.all"), i18n.t("lib.allSubtitle")),
    };
    let playlist = if screen.playlist.is_empty() {
        None
    } else {
        Some(screen.playlist.as_str())
    };
    let songs = store.visible(&screen.view, playlist);
    let filtered: Vec<_> = if screen.search.trim().is_empty() {
        songs.clone()
    } else {
        let q = screen.search.to_lowercase();
        songs
            .iter()
            .filter(|s| {
                s.title.to_lowercase().contains(&q)
                    || s.artist.to_lowercase().contains(&q)
                    || s.album.to_lowercase().contains(&q)
            })
            .cloned()
            .collect()
    };
    let count_label = track_count(i18n, filtered.len());
    let mut html = format!(
        r#"<div class="view-header" style="max-width:1400px;padding-inline:24px"><div class="view-info"><h1 style="font-size:28px">{}</h1><p style="font-size:14px">{} · {}</p></div></div>"#,
        esc(&title),
        esc(&subtitle),
        esc(&count_label)
    );
    html.push_str(r#"<div class="view-toolbar">"#);
    html.push_str(&format!(
        r#"<form method="get" action="/" class="search-field"><input type="hidden" name="view" value="{}"><input type="hidden" name="playlist" value="{}">{}<input type="search" class="search-input" name="q" value="{}" placeholder="{}" aria-label="{}"></form>"#,
        esc(&screen.view),
        esc(&screen.playlist),
        icon_class("search", 16, "search-icon"),
        esc(&screen.search),
        esc(&i18n.t("lib.searchPlaceholder")),
        esc(&i18n.t("common.search"))
    ));
    let sort = format!("{}:{}", store.settings.sort_by, store.settings.sort_order);
    html.push_str(r#"<div class="view-toolbar-actions">"#);
    html.push_str(&format!(
        r#"<button type="button" class="btn btn-primary" data-pick="pick-files" aria-label="{}">{}<span>{}</span></button>"#,
        esc(&i18n.t("lib.importFiles")),
        icon("import", 16),
        esc(&i18n.t("lib.files"))
    ));
    html.push_str(&format!(
        r#"<button type="button" class="btn btn-secondary" data-pick="pick-folder" aria-label="{}">{}<span>{}</span></button>"#,
        esc(&i18n.t("lib.importFolders")),
        icon("folder", 16),
        esc(&i18n.t("lib.folders"))
    ));
    let mut yt = screen.clone();
    yt.modal = "youtube".into();
    html.push_str(&go_button(
        "btn btn-secondary",
        &yt,
        &format!(r#"{}<span>YouTube</span>"#, icon("link", 16)),
    ));
    html.push_str(&format!(
        r#"<form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="refresh"><input type="hidden" name="back" value="{}"><button type="submit" class="btn btn-secondary" aria-label="{}">{}<span>{}</span></button></form>"#,
        esc(&screen.path()),
        esc(&i18n.t("lib.refreshLib")),
        icon("refresh", 16),
        esc(&i18n.t("common.refresh"))
    ));
    if screen.view != "liked" || true {
        html.push_str(&format!(
            r#"<button type="button" class="btn btn-secondary" data-act="enrich" aria-label="{}" title="{}"><span class="btn-icon">{}</span><span>{}</span></button>"#,
            esc(&i18n.t("lib.enrichMeta")),
            esc(&i18n.t("lib.enrichMetaHint")),
            icon("refresh", 16),
            esc(&i18n.t("lib.enrichMeta"))
        ));
    }
    html.push_str(&format!(
        r#"<form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="sort"><input type="hidden" name="back" value="{}"><select class="sort-select" name="value" aria-label="{}" onchange="this.form.requestSubmit()">{}</select></form>"#,
        esc(&screen.path()),
        esc(&i18n.t("lib.sort")),
        sort_options(i18n, &sort)
    ));
    html.push_str("</div></div>");
    if screen.view == "liked" && !store.settings.favorite_artists.is_empty() {
        html.push_str(r#"<section class="favorite-artists"><h2>Избранные артисты</h2><ul class="artist-chip-grid">"#);
        for artist in &store.settings.favorite_artists {
            let avatar = if artist.picture.is_empty() {
                icon("disc", 18)
            } else {
                format!(r#"<img class="artist-chip-avatar" src="{}" alt="">"#, esc(&artist.picture))
            };
            html.push_str(&format!(
                r#"<li><button type="button" class="artist-chip" data-open-artist="1" data-artist-id="{id}" data-artist-name="{name}">{avatar}<span class="artist-chip-name">{name}</span></button></li>"#,
                id = esc(&artist.deezer_id),
                name = esc(&artist.name),
                avatar = avatar,
            ));
        }
        html.push_str("</ul></section>");
    }
    if store.songs.is_empty() {
        html.push_str(&empty_state(
            "music",
            &i18n.t("lib.emptyTitle"),
            &i18n.t("lib.emptyHint"),
            &format!(
                r#"<button type="button" class="btn btn-primary" data-pick="pick-files">{}{}</button><button type="button" class="btn btn-secondary" data-pick="pick-folder">{}{}</button>"#,
                icon("import", 16),
                esc(&i18n.t("lib.importMusic")),
                icon("folder", 16),
                esc(&i18n.t("lib.pickFolder"))
            ),
        ));
    } else if filtered.is_empty() {
        html.push_str(&empty_state("search", &i18n.t("lib.searchEmpty"), "", ""));
    } else {
        html.push_str(r#"<div class="song-list">"#);
        for (i, song) in filtered.iter().enumerate() {
            let current = store.player.current_id.as_deref() == Some(song.id.as_str());
            let playing = current && store.player.playing;
            let cover_cell = if song.cover_path.is_empty() {
                format!(
                    r#"<div class="song-cover song-cover-fallback">{}</div>"#,
                    icon("music", 16)
                )
            } else {
                format!(r#"<img class="song-cover" src="/cover/{}" alt="">"#, esc(&song.id))
            };
            let artist = if song.artist.is_empty() {
                i18n.t("lib.unknownArtist")
            } else {
                song.artist.clone()
            };
            html.push_str(&format!(
                r#"<div class="song-row{cur}" data-play="{id}" data-title="{title}" data-artist="{artist}" data-album="{album}"><div class="song-index"><span class="index-num">{n}</span><span class="index-play">{play}</span></div><div class="song-cover-cell">{disc}</div><div class="song-title-cell"><div class="song-text"><button type="button" class="song-name copyable-label">{title}</button><button type="button" class="artist-link song-artist" data-open-artist="1" data-artist-name="{artist}">{artist}</button></div><button type="button" class="song-menu-btn" data-menu="{id}" data-title="{title}" data-artist="{artist}" data-album="{album}" aria-label="{menu}">{more}</button></div><div class="song-album">{album}</div><div class="song-duration">{dur}</div><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="like"><input type="hidden" name="id" value="{id}"><input type="hidden" name="back" value="{back}"><button type="submit" class="like-btn {liked}" aria-label="{like_label}">{heart}</button></form></div>"#,
                cur = if current { " current" } else { "" },
                id = esc(&song.id),
                n = i + 1,
                play = icon(if playing { "pause" } else { "play" }, 14),
                disc = cover_cell,
                title = esc(&song.title),
                artist = esc(&artist),
                menu = esc(&i18n.t("lib.trackMenu")),
                more = icon("more", 16),
                album = esc(&song.album),
                dur = fmt_time(song.duration),
                back = esc(&screen.path()),
                liked = if song.liked { "liked" } else { "" },
                like_label = esc(&i18n.t(if song.liked { "player.unlike" } else { "player.like" })),
                heart = icon(if song.liked { "heart" } else { "heartOutline" }, 16),
            ));
        }
        html.push_str("</div>");
    }
    html
}

fn sort_options(i18n: &I18n, current: &str) -> String {
    let opts = [
        ("title:asc", "lib.sortTitleAsc"),
        ("title:desc", "lib.sortTitleDesc"),
        ("dateModified:desc", "lib.sortModNew"),
        ("dateModified:asc", "lib.sortModOld"),
        ("dateAdded:desc", "lib.sortAddNew"),
        ("dateAdded:asc", "lib.sortAddOld"),
    ];
    opts.iter()
        .map(|(v, k)| {
            format!(
                r#"<option value="{v}"{}>{}</option>"#,
                if *v == current { " selected" } else { "" },
                esc(&i18n.t(k))
            )
        })
        .collect()
}

fn fmt_time(seconds: f64) -> String {
    let s = seconds.max(0.0) as u64;
    format!("{:02}:{:02}", s / 60, s % 60)
}

fn empty_state(icon_name: &str, title: &str, desc: &str, actions: &str) -> String {
    let desc_html = if desc.is_empty() {
        String::new()
    } else {
        format!(r#"<p class="empty-state-desc">{}</p>"#, esc(desc))
    };
    let actions_html = if actions.is_empty() {
        String::new()
    } else {
        format!(r#"<div class="empty-state-actions">{actions}</div>"#)
    };
    format!(
        r#"<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">{}</div><h3 class="empty-state-title">{}</h3>{}{}</div>"#,
        icon(icon_name, 40),
        esc(title),
        desc_html,
        actions_html
    )
}

fn wishlist_view(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = format!(
        r#"<div class="wishlist-view"><div class="view-header"><div class="view-info"><h1>{}</h1><p>{}</p></div>{}</div><p class="wishlist-download-status field-hint"></p><div class="wishlist-download-panel" hidden><div class="import-bar import-bar-indeterminate"><div class="import-bar-fill"></div></div></div>"#,
        esc(&i18n.t("wish.title")),
        esc(&i18n.t("wish.subtitle")),
        if store.settings.wishlist.is_empty() {
            String::new()
        } else {
            let pending = store.settings.wishlist.iter().any(|item| {
                !store.songs.iter().any(|song| {
                    song.title.eq_ignore_ascii_case(&item.title) && song.artist.eq_ignore_ascii_case(&item.artist)
                })
            });
            format!(
                r#"<div class="view-actions"><button type="button" class="btn btn-secondary" data-download-all="1" {} title="{}"><span class="btn-icon">{}</span>{}</button></div>"#,
                if pending { "" } else { "disabled" },
                esc(&i18n.t("wish.downloadAll")),
                icon("import", 16),
                esc(&i18n.t("wish.downloadAll")),
            )
        }
    );
    if store.settings.wishlist.is_empty() {
        let mut rec = screen.clone();
        rec.view = "recommendations".into();
        rec.modal.clear();
        html.push_str(&empty_state(
            "heartOutline",
            &i18n.t("wish.empty"),
            &i18n.t("wish.emptyHint"),
            &go_button("btn btn-secondary", &rec, &esc(&i18n.t("wish.toRecs"))),
        ));
        html.push_str("</div>");
        return html;
    }
    html.push_str(&format!(
        r#"<div class="wishlist-toolbar"><div class="search-field">{}<input type="search" class="search-input" placeholder="{}" aria-label="{}"></div><select class="sort-select wish-sort" aria-label="{}"><option value="added:desc">{}</option><option value="added:asc">{}</option><option value="title:asc">{}</option><option value="title:desc">{}</option><option value="artist:asc">{}</option><option value="album:asc">{}</option></select><span class="wishlist-search-count" hidden></span></div>"#,
        icon("search", 16),
        esc(&i18n.t("wish.searchPlaceholder")),
        esc(&i18n.t("common.search")),
        esc(&i18n.t("lib.sort")),
        esc(&i18n.t("lib.sortAddNew")),
        esc(&i18n.t("lib.sortAddOld")),
        esc(&i18n.t("lib.sortTitleAsc")),
        esc(&i18n.t("lib.sortTitleDesc")),
        esc(&i18n.t("lib.col.artist")),
        esc(&i18n.t("lib.col.album")),
    ));
    html.push_str(r#"<div id="wishlist-body"><ul class="wishlist-list">"#);
    for (index, item) in store.settings.wishlist.iter().enumerate() {
        let local = store.songs.iter().find(|song| {
            song.title.eq_ignore_ascii_case(&item.title) && song.artist.eq_ignore_ascii_case(&item.artist)
        });
        let play_attr = if let Some(song) = local {
            format!(r#" data-play="{}""#, esc(&song.id))
        } else if item.preview_url.is_empty() {
            r#" data-play-query="1""#.to_string()
        } else {
            format!(r#" data-preview="{}""#, esc(&item.preview_url))
        };
        let cover = if item.cover_url.is_empty() {
            icon("disc", 22)
        } else {
            format!(r#"<img src="{}" alt="">"#, esc(&item.cover_url))
        };
        let owned = if local.is_some() {
            format!(r#"<span class="owned-badge">{}</span>"#, esc(&i18n.t("rec.inLibraryShort")))
        } else {
            String::new()
        };
        let album = if item.album.is_empty() {
            String::new()
        } else {
            format!(
                r#"<button type="button" class="artist-link wishlist-album" data-open-album-query="1" data-album-title="{album}" data-artist-name="{artist}">{album}</button>"#,
                album = esc(&item.album),
                artist = esc(&item.artist),
            )
        };
        let query_text = format!("{} {}", item.title, item.artist);
        let query = urlencoding::encode(&query_text);
        let links = [
            ("Deezer", format!("https://www.deezer.com/search/{query}")),
            ("Spotify", format!("https://open.spotify.com/search/{query}")),
            ("Яндекс Музыка", format!("https://music.yandex.ru/search?text={query}")),
        ]
        .iter()
        .map(|(label, url)| {
            format!(
                r#"<button type="button" class="wishlist-link-btn" data-platform="{url}">{label}</button>"#,
                url = esc(url),
                label = esc(label),
            )
        })
        .collect::<String>();
        let local_play = if local.is_some() {
            format!(
                r#"<button type="button" class="btn btn-secondary"{play} title="{label}"><span class="btn-icon">{icon}</span>{label}</button>"#,
                play = play_attr,
                label = esc(&i18n.t("rec.playLocal")),
                icon = icon("play", 16),
            )
        } else {
            format!(
                r#"<button type="button" class="btn btn-secondary wishlist-download-btn" data-download-wish="1" data-title="{title}" data-artist="{artist}" data-album="{album}" data-cover="{cover}" title="{label}"><span class="btn-icon">{icon}</span>{label}</button>"#,
                title = esc(&item.title),
                artist = esc(&item.artist),
                album = esc(&item.album),
                cover = esc(&item.cover_url),
                label = esc(&i18n.t("wish.download")),
                icon = icon("import", 16),
            )
        };
        html.push_str(&format!(
            r#"<li class="wishlist-row" data-title="{title}" data-artist="{artist}" data-album="{album}" data-order="{order}"><button type="button" class="wishlist-play" data-title="{title}" data-artist="{artist}"{play}>{cover}<span class="wishlist-play-icon">{play_icon}</span></button><div class="wishlist-meta"><div class="wishlist-title">{title}{owned}</div><button type="button" class="artist-link wishlist-artist" data-open-artist="1" data-artist-name="{artist}" title="{card}">{artist}</button>{album_btn}<div class="wishlist-links">{links}</div></div><div class="wishlist-actions">{local_play}<button type="button" class="like-btn wish-heart liked" data-wish="1" data-title="{title}" data-artist="{artist}" data-album="{album}" data-url="{url}" data-cover="{cover_url}" aria-label="{remove}" title="{remove}">{heart}</button><button type="button" class="btn btn-ghost" data-wish="1" data-title="{title}" data-artist="{artist}" data-album="{album}" data-url="{url}" data-cover="{cover_url}" title="{remove}" aria-label="{remove}">{del}</button></div></li>"#,
            title = esc(&item.title),
            artist = esc(&item.artist),
            album = esc(&item.album),
            order = format!("{index:04}"),
            play = play_attr,
            cover = cover,
            play_icon = icon("play", 16),
            owned = owned,
            album_btn = album,
            links = links,
            local_play = local_play,
            url = esc(&item.preview_url),
            cover_url = esc(&item.cover_url),
            remove = esc(&i18n.t("wish.remove")),
            heart = icon("heart", 16),
            del = icon("delete", 16),
            card = esc(&i18n.t("artist.openCardMenu")),
        ));
    }
    html.push_str("</ul>");
    html.push_str(&empty_state(
        "search",
        &i18n.t("wish.searchEmpty"),
        &i18n.t("wish.searchEmptyHint"),
        "",
    ).replace("<div class=\"empty-state\">", "<div class=\"empty-state wishlist-search-empty\" hidden>"));
    html.push_str("</div></div>");
    html
}

fn history_view(store: &Store, i18n: &I18n) -> String {
    let (week, month, total) = store.history_stats();
    let mut html = format!(
        r#"<div class="history-view"><div class="view-header"><div class="view-info"><h1>{}</h1><p>{}</p></div><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="refresh"><input type="hidden" name="back" value="/?view=history"><button type="submit" class="btn btn-secondary" title="{}">{}{}</button></form></div><div class="history-stats"><div class="history-stat"><div class="history-stat-value">{week}</div><div class="history-stat-label">{}</div></div><div class="history-stat"><div class="history-stat-value">{month}</div><div class="history-stat-label">{}</div></div><div class="history-stat"><div class="history-stat-value">{total}</div><div class="history-stat-label">{}</div></div></div><section class="history-section"><h2 class="history-section-title">{}</h2>"#,
        esc(&i18n.t("history.title")),
        esc(&i18n.t("history.subtitle")),
        esc(&i18n.t("common.refresh")),
        icon("refresh", 16),
        esc(&i18n.t("common.refresh")),
        esc(&i18n.t("history.week")),
        esc(&i18n.t("history.month")),
        esc(&i18n.t("history.total")),
        esc(&i18n.t("history.recent"))
    );
    if store.history.is_empty() {
        html.push_str(&empty_state(
            "music",
            &i18n.t("history.empty"),
            &i18n.t("history.emptyHint"),
            "",
        ));
    } else {
        html.push_str(r#"<ul class="history-list">"#);
        for item in &store.history {
            if let Some(song) = store.song(&item.song_id) {
                html.push_str(&format!(
                    r#"<li class="history-row" data-title="{title}" data-artist="{artist}" data-play="{id}"><div class="history-row-main"><div class="history-cover">{icon}</div><div class="history-row-text"><div class="history-row-title">{title}</div><button type="button" class="artist-link history-row-artist" data-open-artist="1" data-artist-name="{artist}">{artist}</button></div><div class="history-row-meta"><span>{when}</span><span>{dur}</span></div></div></li>"#,
                    id = esc(&song.id),
                    title = esc(&song.title),
                    artist = esc(&song.artist),
                    icon = icon("music", 18),
                    when = esc(&history_when(i18n, item.played_at)),
                    dur = fmt_time(song.duration)
                ));
            }
        }
        html.push_str("</ul>");
    }
    html.push_str("</section></div>");
    html
}

fn recommendations_view(i18n: &I18n, screen: &Screen) -> String {
    let mut html = format!(
        r#"<div class="recommendations-view"><div class="view-header"><div class="view-info"><h1>{}</h1><p>{}</p></div><button type="button" class="btn btn-secondary" data-act="refresh-rec" aria-label="{}">{}{}</button></div><div class="recommendations-filters" role="tablist" aria-label="{}">"#,
        esc(&i18n.t("rec.title")),
        esc(&i18n.t("rec.subtitle")),
        esc(&i18n.t("rec.refresh")),
        icon("refresh", 16),
        esc(&i18n.t("rec.refresh")),
        esc(&i18n.t("rec.filterAria"))
    );
    for (i, (filter, key)) in [
        ("all", "rec.filter.all"),
        ("liked", "rec.filter.liked"),
        ("current", "rec.filter.current"),
        ("wishlist", "rec.filter.wishlist"),
        ("chart", "rec.filter.chart"),
    ]
    .iter()
    .enumerate()
    {
        let class = if i == 0 {
            "rec-filter-chip active"
        } else {
            "rec-filter-chip"
        };
        html.push_str(&format!(
            r#"<button type="button" role="tab" class="{class}" data-rec-filter="{filter}" aria-selected="{}">{}</button>"#,
            if i == 0 { "true" } else { "false" },
            esc(&i18n.t(key))
        ));
    }
    html.push_str("</div><div id=\"recommendations-root\" class=\"recommendations-sections\"></div></div>");
    let _ = screen;
    html
}

fn player_bar(store: &Store, i18n: &I18n) -> String {
    let vol = if store.settings.muted {
        0.0
    } else {
        store.settings.volume.clamp(0.0, 1.0)
    };
    let vol_icon = if store.settings.muted || vol == 0.0 {
        "volumeMute"
    } else {
        "volume"
    };
    let repeat_icon = if store.settings.playback.repeat == "one" {
        "repeatOne"
    } else {
        "repeat"
    };
    let current = store
        .player
        .current_id
        .as_ref()
        .and_then(|id| store.song(id));
    let track = if let Some(song) = current {
        format!(
            r#"<div class="player-cover player-cover-fallback">{}</div><div class="player-track-text"><button type="button" class="player-track-title copyable-label">{}</button><button type="button" class="artist-link player-track-artist" data-open-artist="1" data-artist-name="{}">{}</button></div>"#,
            icon("disc", 20),
            esc(&song.title),
            esc(&song.artist),
            esc(&song.artist)
        )
    } else {
        format!(
            r#"<div class="player-track-text muted"><div class="player-track-title">{}</div></div>"#,
            esc(&i18n.t("player.nothing"))
        )
    };
    let queue_len = store.player.queue.len();
    let queue_badge = if queue_len > 0 {
        format!(r#"<span class="queue-badge">{queue_len}</span>"#)
    } else {
        String::new()
    };
    format!(
        r#"<div class="player-bar-wrap player-variant-{variant}"><div class="player-bar"><div class="player-track-info">{track}</div><div class="player-center"><div class="player-controls"><button type="button" class="player-btn{shuffle}" data-act="shuffle" aria-label="{shuffle_l}" title="{shuffle_l}">{shuffle_i}</button><button type="button" class="player-btn" data-act="prev" aria-label="{prev}" title="{prev}">{prev_i}</button><button type="button" class="player-btn play-pause" data-act="toggle" aria-label="{play}" title="{play}">{play_i}</button><button type="button" class="player-btn" data-act="next" aria-label="{next}" title="{next}">{next_i}</button><button type="button" class="player-btn{repeat}" data-act="repeat" aria-label="{repeat_l}" title="{repeat_l}">{repeat_i}</button><button type="button" class="player-btn" data-act="similar" aria-label="{similar}" title="{similar}" disabled>{similar_i}</button><div class="player-sleep-wrap"><button type="button" class="player-btn" data-act="sleep" aria-label="{sleep}" title="{sleep}">{sleep_i}</button></div></div><div class="player-progress"><span class="player-time">00:00</span><div class="progress-bar"><div class="progress-fill" style="width:0%"></div><div class="progress-thumb" style="left:0%"></div></div><span class="player-time">00:00</span></div></div><div class="player-right"><div class="player-volume"><button type="button" class="player-btn" data-act="mute" aria-label="{mute}" title="{mute}">{vol_i}</button><div class="volume-bar"><div class="volume-fill" style="width:{vol_pct}%"></div><div class="volume-thumb" style="left:{vol_pct}%"></div></div></div><button type="button" class="player-btn queue-toggle" data-act="queue" aria-label="{queue}" title="{queue}">{queue_i}{queue_badge}</button><button type="button" class="player-btn" aria-label="{lyrics}" title="{lyrics}" disabled>{lyrics_i}</button><button type="button" class="player-btn" data-act="mini" aria-label="{mini}" title="{mini}">{mini_i}</button></div></div></div>"#,
        shuffle = if store.settings.playback.shuffle { " active" } else { "" },
        shuffle_l = esc(&i18n.t("player.shuffle")),
        shuffle_i = icon("shuffle", 16),
        prev = esc(&i18n.t("player.prev")),
        prev_i = icon("previous", 20),
        play = esc(&i18n.t(if store.player.playing { "player.pause" } else { "player.play" })),
        play_i = icon(if store.player.playing { "pause" } else { "play" }, 22),
        next = esc(&i18n.t("player.next")),
        next_i = icon("next", 20),
        repeat = if store.settings.playback.repeat != "off" { " active" } else { "" },
        repeat_l = esc(&i18n.t("player.repeat")),
        repeat_i = icon(repeat_icon, 16),
        similar = esc(&i18n.t("player.similar")),
        similar_i = icon("similar", 16),
        sleep = esc(&i18n.t("player.sleep")),
        sleep_i = icon("timer", 16),
        mute = esc(&i18n.t(if store.settings.muted { "player.unmute" } else { "player.mute" })),
        vol_i = icon(vol_icon, 18),
        vol_pct = (vol * 100.0).round(),
        queue = esc(&i18n.t("player.queue")),
        queue_i = icon("queue", 18),
        lyrics = esc(&i18n.t("lyrics.title")),
        lyrics_i = icon("music", 18),
        mini = esc(&i18n.t("player.mini")),
        mini_i = icon("pictureInPicture", 18),
        track = track,
        queue_badge = queue_badge,
        variant = {
            let value = ui_str(store, "player.variant", "standard");
            if matches!(value, "compact" | "standard" | "expanded") { value } else { "standard" }
        },
    )
}

fn settings_modal(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let width = if screen.section == "theme-editor" { 1100 } else { 920 };
    let mut close = screen.clone();
    close.settings.clear();
    close.section.clear();
    close.modal.clear();
    let tabs = [
        ("appearance", "settings.appearance"),
        ("behavior", "settings.behavior"),
        ("hotkeys", "settings.hotkeys"),
        ("tools", "settings.tools"),
    ];
    let mut tabs_html = String::new();
    for (id, key) in tabs {
        let mut next = screen.clone();
        next.settings = id.into();
        next.modal.clear();
        if id == "appearance" && next.section.is_empty() {
            next.section = "general".into();
        }
        if id != "appearance" {
            next.section.clear();
        }
        let class = if screen.settings == id {
            "settings-tab active"
        } else {
            "settings-tab"
        };
        tabs_html.push_str(&go_button(class, &next, &esc(&i18n.t(key))));
    }
    let mut body = String::new();
    if screen.settings == "appearance" {
        body.push_str(r#"<div class="settings-appearance-layout"><aside class="settings-subnav">"#);
        let sections = [
            ("general", "settings.general"),
            ("theme-editor", "settings.themeEditor"),
            ("colors", "settings.colors"),
            ("wallpaper", "settings.wallpaper"),
            ("dynamic", "settings.dynamic"),
            ("components", "settings.components"),
            ("layout", "settings.layout"),
            ("player", "settings.player"),
            ("library", "settings.library"),
            ("navigation", "settings.navigation"),
            ("covers", "settings.covers"),
            ("animations", "settings.animations"),
            ("presets", "settings.presets"),
            ("extras", "settings.extras"),
        ];
        let section = if screen.section.is_empty() {
            "general"
        } else {
            screen.section.as_str()
        };
        for (id, key) in sections {
            let mut next = screen.clone();
            next.settings = "appearance".into();
            next.section = id.into();
            next.modal.clear();
            let class = if section == id {
                "settings-subnav-item active"
            } else {
                "settings-subnav-item"
            };
            body.push_str(&go_button(class, &next, &esc(&i18n.t(key))));
        }
        body.push_str(r#"</aside><div class="settings-panel-scroll">"#);
        body.push_str(&appearance_panel(store, i18n, screen, section));
        body.push_str("</div></div>");
    } else if screen.settings == "behavior" {
        body.push_str(r#"<div class="settings-panel-scroll">"#);
        body.push_str(&behavior_panel(store, i18n, screen));
        body.push_str(&playback_panel(store, i18n, screen));
        body.push_str("</div>");
    } else if screen.settings == "hotkeys" {
        body.push_str(r#"<div class="settings-panel-scroll">"#);
        body.push_str(&hotkeys_panel(store, i18n, screen));
        body.push_str("</div>");
    } else {
        body.push_str(r#"<div class="settings-panel-scroll">"#);
        body.push_str(&tools_panel(store, i18n, screen));
        body.push_str("</div>");
    }
    format!(
        r#"<div class="modal-overlay" role="presentation"><button type="button" class="modal-overlay-dismiss" data-href="{close_href}" style="position:absolute;inset:0;border:0;padding:0;background:transparent"></button><div class="modal settings-modal-wide" style="max-width:{width}px;position:relative" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-header"><h2 id="modal-title">{title}</h2>{close_btn}</div><div class="modal-body"><div class="settings-shell"><nav class="settings-tabs" aria-label="{tabs_aria}">{tabs}</nav>{body}</div></div><div class="modal-footer">{footer}</div></div></div>"#,
        close_href = close.path(),
        width = width,
        title = esc(&i18n.t("settings.title")),
        close_btn = go_button("icon-btn", &close, &icon("close", 16)),
        tabs_aria = esc(&i18n.t("settings.tabsAria")),
        tabs = tabs_html,
        body = body,
        footer = go_button("btn btn-primary", &close, &esc(&i18n.t("settings.close"))),
    )
}

fn appearance_panel(store: &Store, i18n: &I18n, screen: &Screen, section: &str) -> String {
    match section {
        "theme-editor" => theme_editor(store, i18n, screen),
        "wallpaper" => wallpaper_panel(store, i18n, screen),
        "presets" => presets_panel(store, i18n, screen),
        "general" => general_panel(store, i18n, screen),
        "colors" => colors_panel(store, i18n, screen),
        "layout" => layout_panel(store, i18n, screen),
        "player" => player_settings_panel(store, i18n, screen),
        "library" => library_settings_panel(store, i18n, screen),
        "navigation" => behavior_panel(store, i18n, screen),
        "covers" => covers_panel(store, i18n, screen),
        "animations" => animations_panel(store, i18n, screen),
        "dynamic" => dynamic_panel(store, i18n, screen),
        "components" => components_panel(store, i18n, screen),
        "extras" => extras_panel(i18n, screen),
        _ => format!(
            r#"<div class="settings-panel">{}<div class="settings-section"><p class="field-hint">{}</p></div></div>"#,
            reset_row(i18n, screen, "reset-section", &i18n.t("settings.resetSection")),
            esc(&i18n.t("settings.appearance"))
        ),
    }
}

fn reset_row(i18n: &I18n, screen: &Screen, action: &str, label: &str) -> String {
    let _ = i18n;
    format!(
        r#"<div class="settings-section settings-actions-row settings-section-reset"><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="{action}"><input type="hidden" name="back" value="{}"><button type="submit" class="btn btn-secondary">{}</button></form></div>"#,
        esc(&screen.path()),
        esc(label)
    )
}

fn general_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&reset_row(i18n, screen, "reset-general", &i18n.t("settings.resetSection")));
    html.push_str(r#"<div class="settings-section">"#);
    html.push_str(&select_field(
        "ui-locale",
        &i18n.t("settings.language"),
        &store.settings.locale,
        sv(&[
            ("ru", "Русский"),
            ("en", "English"),
            ("zh", "中文"),
            ("hi", "हिन्दी"),
            ("es", "Español"),
            ("fr", "Français"),
            ("uk", "Українська"),
        ]),
        "locale",
        screen,
    ));
    html.push_str("</div><div class=\"settings-section\">");
    html.push_str(&select_field(
        "theme-mode",
        &i18n.t("settings.theme"),
        &store.settings.theme,
        sv(&[
            ("dark", &i18n.t("settings.theme.dark")),
            ("light", &i18n.t("settings.theme.light")),
            ("system", &i18n.t("settings.theme.system")),
        ]),
        "theme",
        screen,
    ));
    html.push_str("</div>");
    html.push_str(&toggle_row(screen, "show_sidebar", "show-sidebar", store.settings.show_sidebar, &i18n.t("settings.showSidebar")));
    html.push_str(&toggle_row(screen, "show_queue", "show-queue", store.settings.show_queue, &i18n.t("settings.showQueue")));
    html.push_str(&toggle_row(screen, "show_search", "show-search", store.settings.show_search, &i18n.t("settings.showSearch")));
    html.push_str("</div>");
    html
}

fn sv(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs.iter().map(|(k, v)| ((*k).to_string(), (*v).to_string())).collect()
}

fn select_field(
    id: &str,
    label: &str,
    value: &str,
    options: Vec<(String, String)>,
    field: &str,
    screen: &Screen,
) -> String {
    let current = options
        .iter()
        .find(|(v, _)| v == value)
        .map(|(_, l)| l.as_str())
        .unwrap_or(value);
    let mut menu = String::new();
    for (v, l) in &options {
        let class = if v == value {
            "ui-select-option active"
        } else {
            "ui-select-option"
        };
        menu.push_str(&format!(
            r#"<form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="{field}"><input type="hidden" name="value" value="{}"><input type="hidden" name="back" value="{}"><button type="submit" role="option" class="{class}" aria-selected="{}">{}</button></form>"#,
            esc(v),
            esc(&screen.path()),
            if v == value { "true" } else { "false" },
            esc(l)
        ));
    }
    format!(
        r#"<div class="ui-select"><label class="field-label" for="{id}">{}</label><button id="{id}" type="button" class="field-input ui-select-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="ui-select-value">{}</span>{}</button><div class="ui-select-menu" role="listbox" hidden>{menu}</div></div>"#,
        esc(label),
        esc(current),
        icon_class("chevronDown", 14, "ui-select-chevron")
    )
}

fn toggle_row(screen: &Screen, field: &str, id: &str, checked: bool, label: &str) -> String {
    format!(
        r#"<div class="settings-section"><form method="post" action="/act"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="{field}"><input type="hidden" name="value" value="{}"><input type="hidden" name="back" value="{}"><label class="ui-toggle" for="{id}"><input id="{id}" type="checkbox" class="ui-toggle-input" {} onchange="this.form.value.value=this.checked?'1':'0';this.form.requestSubmit()"><span class="ui-toggle-track" aria-hidden="true"><span class="ui-toggle-thumb"></span></span><span class="ui-toggle-label">{}</span></label></form></div>"#,
        if checked { "1" } else { "0" },
        esc(&screen.path()),
        if checked { "checked" } else { "" },
        esc(label)
    )
}

fn theme_editor(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let colors = [
        ("bgMain", "#111315", "theme.color.bgMain.label", "theme.color.bgMain.desc"),
        ("bgElevated", "#252a31", "theme.color.bgElevated.label", "theme.color.bgElevated.desc"),
        ("textPrimary", "#f2f4f7", "theme.color.textPrimary.label", "theme.color.textPrimary.desc"),
        ("textSecondary", "#9da5af", "theme.color.textSecondary.label", "theme.color.textSecondary.desc"),
        ("textMuted", "#6f7883", "theme.color.textMuted.label", "theme.color.textMuted.desc"),
        ("accent", "#6ea8fe", "theme.color.accent.label", "theme.color.accent.desc"),
    ];
    let mut rows = String::new();
    for (key, hex, label, desc) in colors {
        rows.push_str(&format!(
            r#"<div class="theme-color-row" data-color-key="{key}"><div class="theme-color-meta"><div class="theme-color-title">{}</div><code class="theme-color-key">{key}</code><p class="theme-color-desc">{}</p></div><div class="theme-color-controls"><span class="theme-color-preview" style="background:{hex}"></span><input type="color" class="ui-color-swatch" value="{hex}" aria-label="{}"><input class="field-input theme-color-hex" value="{hex}" spellcheck="false"><button type="button" class="btn btn-ghost" data-color-reset="{key}" data-color-default="{hex}" title="{}">↺</button></div></div>"#,
            esc(&i18n.t(label)),
            esc(&i18n.t(desc)),
            esc(&i18n.t(label)),
            esc(&i18n.t("settings.theme.restore"))
        ));
    }
    format!(
        r#"<div class="theme-editor"><div class="theme-editor-toolbar">{select}<div class="settings-actions-row">{actions}</div><p class="field-hint">{hint}</p></div><div class="theme-editor-controls">{live}{dirty}<input class="field-input" data-theme-search placeholder="{search_ph}"><button type="button" class="btn btn-ghost" data-theme-act="expand">{expand}</button><button type="button" class="btn btn-ghost" data-theme-act="collapse">{collapse}</button>{palette}</div><div class="theme-editor-grid"><div class="theme-editor-groups"><section class="theme-group"><header class="theme-group-header"><button type="button" class="theme-group-toggle"><strong>{}</strong><span>{}</span></button><div class="theme-group-actions"><button type="button" class="btn btn-ghost" data-color-reset-all="1">{}</button><button type="button" class="btn btn-ghost">{}</button></div></header>{rows}</section></div><aside class="theme-editor-preview-pane"><div class="settings-actions-row">{win}{page}</div>{preview}<div class="settings-actions-row"><button type="button" class="btn btn-primary" data-theme-act="apply">{}</button><button type="button" class="btn btn-secondary" data-theme-act="save">{}</button><button type="button" class="btn btn-ghost" data-theme-act="cancel">{}</button></div></aside></div></div>"#,
        esc(&i18n.t("theme.group.common.title")),
        esc(&i18n.t("theme.group.common.desc")),
        esc(&i18n.t("settings.theme.resetGroup")),
        esc(&i18n.t("settings.theme.restore")),
        esc(&i18n.t("settings.theme.apply")),
        esc(&i18n.t("settings.theme.save")),
        esc(&i18n.t("settings.theme.cancelChanges")),
        select = select_field(
            "theme-select",
            &i18n.t("settings.theme.selectLabel"),
            &store.settings.preset_id,
            theme_options(store),
            "preset",
            screen
        ),
        rows = rows,
        win = select_field("pv-mode", &i18n.t("settings.preview.window"), "standard", sv(&[("small", &i18n.t("settings.preview.small")), ("standard", &i18n.t("settings.preview.standard")), ("wide", &i18n.t("settings.preview.wide"))]), "preview_mode", screen),
        page = select_field("pv-page", &i18n.t("settings.preview.page"), "library", sv(&[("library", &i18n.t("settings.preview.library")), ("playlist", &i18n.t("settings.preview.playlist")), ("metadata", &i18n.t("settings.preview.metadata"))]), "preview_page", screen),
        preview = theme_preview(store, i18n),
        actions = format!(
            r#"<button type="button" class="btn btn-secondary" data-theme-act="add">{}</button><button type="button" class="btn btn-secondary" data-theme-act="duplicate">{}</button><button type="button" class="btn btn-ghost" data-theme-act="rename">{}</button><button type="button" class="btn btn-danger" data-theme-act="delete">{}</button><button type="button" class="btn btn-ghost" data-theme-act="export">{}</button><button type="button" class="btn btn-ghost" data-theme-act="import">{}</button><button type="button" class="btn btn-secondary" data-theme-act="reset">{}</button>"#,
            esc(&i18n.t("settings.theme.add")),
            esc(&i18n.t("settings.theme.duplicate")),
            esc(&i18n.t("settings.theme.rename")),
            esc(&i18n.t("settings.theme.delete")),
            esc(&i18n.t("settings.theme.export")),
            esc(&i18n.t("settings.theme.import")),
            esc(&i18n.t("settings.theme.resetTheme"))
        ),
        hint = esc(&format!(
            "{} · {} — · {} — · {}",
            i18n.t("settings.theme.builtin"),
            i18n.t("settings.theme.createdAt"),
            i18n.t("settings.theme.updatedAt"),
            i18n.t("settings.theme.builtinDescription")
        )),
        live = format!(
            r#"<label class="ui-toggle" for="live-apply"><input id="live-apply" type="checkbox" class="ui-toggle-input" checked><span class="ui-toggle-track" aria-hidden="true"><span class="ui-toggle-thumb"></span></span><span class="ui-toggle-label">{}</span></label>"#,
            esc(&i18n.t("settings.theme.liveApply"))
        ),
        dirty = format!(
            r#"<label class="ui-toggle" for="only-dirty"><input id="only-dirty" type="checkbox" class="ui-toggle-input"><span class="ui-toggle-track" aria-hidden="true"><span class="ui-toggle-thumb"></span></span><span class="ui-toggle-label">{}</span></label>"#,
            esc(&i18n.tf("settings.theme.onlyChanged", &[("count", "0")]))
        ),
        search_ph = esc(&i18n.t("settings.theme.searchPlaceholder")),
        expand = esc(&i18n.t("settings.theme.expandAll")),
        collapse = esc(&i18n.t("settings.theme.collapseAll")),
        palette = select_field(
            "color-mode",
            &i18n.t("settings.theme.palette"),
            "dark",
            sv(&[("dark", &i18n.t("settings.theme.darkPalette")), ("light", &i18n.t("settings.theme.lightPalette"))]),
            "palette",
            screen
        ),
    )
}

fn theme_preview(store: &Store, i18n: &I18n) -> String {
    let mode = ui_str(store, "preview_mode", "standard");
    let mode = if matches!(mode, "small" | "standard" | "wide") { mode } else { "standard" };
    format!(
        r#"<div class="theme-preview theme-preview-{mode}" style="--pv-bg:#111315;--pv-sidebar:#181b1f;--pv-panel:#20242a;--pv-text:#f2f4f7;--pv-muted:#9da5af;--pv-accent:#6ea8fe;--pv-border:rgba(255,255,255,0.08);--pv-hover:#2a3037;--pv-active:#303842;--pv-progress:#6ea8fe;--pv-titlebar:#0d0f11;--pv-danger:#ef6b73;--pv-play-bg:#f2f4f7;--pv-play-fg:#111315"><div class="tp-titlebar">IMe Music</div><div class="tp-body"><aside class="tp-sidebar"><div class="tp-nav active">{}</div><div class="tp-nav">{}</div><div class="tp-nav">{}</div></aside><section class="tp-main"><h3>{}</h3><ul class="tp-list"><li><span class="tp-cover"></span><span><strong>Track One</strong><small>Artist</small></span></li><li class="active"><span class="tp-cover"></span><span><strong>Track Two</strong><small>Artist</small></span></li><li><span class="tp-cover"></span><span><strong>Track Three</strong><small>Artist</small></span></li></ul><div class="tp-menu"><div>{}</div><div>{}</div><div class="danger">{}</div></div></section></div><div class="tp-player"><span class="tp-cover sm"></span><div class="tp-player-meta"><strong>Now Playing</strong><small>Artist</small></div><button type="button" class="tp-play" aria-label="Play"></button><div class="tp-progress"><div class="tp-progress-fill"></div></div><div class="tp-volume"><div class="tp-volume-fill"></div></div></div></div>"#,
        esc(&i18n.t("settings.preview.library")),
        esc(&i18n.t("settings.preview.favorites")),
        esc(&i18n.t("settings.preview.playlist")),
        esc(&i18n.t("settings.preview.allMusic")),
        esc(&i18n.t("settings.preview.addToQueue")),
        esc(&i18n.t("settings.preview.edit")),
        esc(&i18n.t("settings.preview.delete")),
    )
}

fn wallpaper_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mode = if store.settings.wallpaper_mode.is_empty() { "none" } else { store.settings.wallpaper_mode.as_str() };
    let none_class = if mode == "none" { "wp-segment-btn active" } else { "wp-segment-btn" };
    let blur_class = if mode == "fitBlur" { "wp-segment-btn active" } else { "wp-segment-btn" };
    let stage = if store.settings.wallpaper_path.is_empty() { "wp-stage is-off" } else { "wp-stage" };
    let canvas = if store.settings.wallpaper_path.is_empty() {
        format!(r#"<div class="wp-stage-empty">{}</div>"#, esc(&i18n.t("settings.wallpaper.noImage")))
    } else {
        r#"<img class="app-wallpaper-photo" src="/wallpaper-image" alt="">"#.to_string()
    };
    format!(
        r#"<div class="settings-panel wallpaper-mei">{reset}<div class="wp-mode-row"><span class="field-label">{}</span><div class="wp-segment"><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="wallpaper"><input type="hidden" name="value" value="none"><input type="hidden" name="back" value="{back}"><button type="submit" class="{none_class}">{}</button></form><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="wallpaper"><input type="hidden" name="value" value="fitBlur"><input type="hidden" name="back" value="{back}"><button type="submit" class="{blur_class}">{}</button></form></div></div><div class="{stage}"><div class="wp-stage-canvas">{canvas}</div><div class="wp-stage-footer"><div class="wp-stage-meta"><strong>{}</strong><span>{}: {}</span></div><div class="wp-stage-actions"><button type="button" class="btn btn-primary" data-pick="pick-wallpaper">{}</button><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="reset-wallpaper"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-danger" aria-label="{}" title="{}">⌫</button></form></div></div></div></div>"#,
        esc(&i18n.t("settings.wallpaper.mode")),
        esc(&i18n.t("settings.wallpaper.none")),
        esc(&i18n.t("settings.wallpaper.fitBlur")),
        esc(&i18n.t("settings.wallpaper.noneSelected")),
        esc(&i18n.t("settings.wallpaper.mode")),
        esc(&i18n.t("settings.wallpaper.none")),
        esc(&i18n.t("settings.wallpaper.chooseImage")),
        esc(&i18n.t("settings.wallpaper.delete")),
        esc(&i18n.t("settings.wallpaper.deleteReset")),
        reset = reset_row(i18n, screen, "reset-wallpaper", &i18n.t("settings.wallpaper.resetWallpaper")),
        back = esc(&screen.path()),
        none_class = none_class,
        blur_class = blur_class,
        stage = stage,
        canvas = canvas,
    )
}

fn presets_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let presets = [
        ("default", "Default", "#111315", "#6ea8fe"),
        ("graphite", "Graphite", "#121417", "#9aa4b2"),
        ("midnight", "Midnight", "#0b1020", "#7aa2ff"),
        ("ocean", "Ocean", "#0d1518", "#3dbbce"),
        ("forest", "Forest", "#101612", "#6fbf8a"),
        ("rose", "Rose", "#161014", "#e089a8"),
        ("amber", "Amber", "#16130e", "#e0b15a"),
        ("violet", "Violet", "#120f1a", "#a78bfa"),
        ("high-contrast", "High Contrast", "#000000", "#66ddff"),
    ];
    let mut grid = String::new();
    for (id, name, bg, accent) in presets {
        grid.push_str(&preset_card(id, name, bg, accent, screen, i18n, false));
    }
    for (id, name) in theme_options(store).into_iter().skip(9) {
        let snap = store.settings.ui.get(&format!("themeSnap.{id}")).map(String::as_str).unwrap_or("#111315,#181b1f,#6ea8fe");
        let mut parts = snap.split(',');
        let bg = parts.next().unwrap_or("#111315");
        let accent = parts.nth(1).unwrap_or("#6ea8fe");
        grid.push_str(&preset_card(&id, &name, bg, accent, screen, i18n, true));
    }
    format!(
        r#"<div class="settings-panel">{reset}<div class="settings-section settings-actions-row"><button type="button" class="btn btn-secondary" data-theme-act="import">{import}</button></div><div class="field-label">{}</div><div class="preset-grid">{grid}</div><div class="settings-section"><div class="field-label">{}</div><form method="post" action="/act" class="field-row"><input type="hidden" name="action" value="save-preset"><input type="hidden" name="back" value="{back}"><input class="field-input" name="name" placeholder="{}"><button type="submit" class="btn btn-primary">{}</button></form></div></div>"#,
        esc(&i18n.t("settings.presets.builtin")),
        esc(&i18n.t("settings.presets.saveCurrent")),
        esc(&i18n.t("settings.presets.namePlaceholder")),
        esc(&i18n.t("common.save")),
        reset = reset_row(i18n, screen, "reset-preset", &i18n.t("settings.presets.resetDefault")),
        import = esc(&i18n.t("settings.presets.importJson")),
        back = esc(&screen.path()),
        grid = grid,
    )
}

fn theme_options(store: &Store) -> Vec<(String, String)> {
    let mut options = vec![
        ("default".into(), "Default".into()),
        ("graphite".into(), "Graphite".into()),
        ("midnight".into(), "Midnight".into()),
        ("ocean".into(), "Ocean".into()),
        ("forest".into(), "Forest".into()),
        ("rose".into(), "Rose".into()),
        ("amber".into(), "Amber".into()),
        ("violet".into(), "Violet".into()),
        ("high-contrast".into(), "High Contrast".into()),
    ];
    if let Some(raw) = store.settings.ui.get("themeList") {
        for line in raw.lines() {
            if let Some((id, name)) = line.split_once('|') {
                if !id.is_empty() && !options.iter().any(|(item, _)| item == id) {
                    options.push((id.to_string(), name.to_string()));
                }
            }
        }
    }
    options
}

fn preset_card(id: &str, name: &str, bg: &str, accent: &str, screen: &Screen, i18n: &I18n, custom: bool) -> String {
    let remove = if custom {
        format!(
            r#"<form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="delete-preset"><input type="hidden" name="value" value="{id}"><input type="hidden" name="back" value="{}"><button type="submit" class="btn btn-ghost">{}</button></form>"#,
            esc(&screen.path()),
            esc(&i18n.t("settings.theme.delete"))
        )
    } else {
        String::new()
    };
    format!(
        r#"<div class="preset-card"><div class="preset-swatches" style="background:linear-gradient(135deg,{bg},{accent})"></div><strong>{name}</strong><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="preset"><input type="hidden" name="value" value="{id}"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-secondary">{}</button></form>{remove}</div>"#,
        esc(&i18n.t("settings.presets.apply")),
        back = esc(&screen.path()),
    )
}

fn slider_field(label: &str, field: &str, value: &str, min: &str, max: &str, step: &str, unit: &str) -> String {
    format!(
        r#"<div class="settings-section"><label class="eq-slider"><span class="field-label" data-range-label="{label}">{label}: {value}{unit}</span><input type="range" min="{min}" max="{max}" step="{step}" value="{value}" data-set-field="{field}" data-set-unit="{unit}"></label></div>"#,
        label = esc(label),
        value = esc(value),
        unit = esc(unit),
        field = esc(field),
    )
}

fn color_field(store: &Store, key: &str, label: &str, fallback: &str) -> String {
    let value = store.settings.colors.get(key).map(String::as_str).unwrap_or(fallback);
    let value = if value.starts_with('#') && value.len() >= 7 { &value[..7] } else { fallback };
    format!(
        r#"<div class="settings-section theme-color-row" data-color-key="{key}"><div class="theme-color-meta"><div class="theme-color-title">{label}</div></div><div class="theme-color-controls"><span class="theme-color-preview" style="background:{value}"></span><input type="color" class="ui-color-swatch" value="{value}" aria-label="{label}"><input class="field-input theme-color-hex" value="{value}" spellcheck="false"><button type="button" class="btn btn-ghost" data-color-reset="{key}" data-color-default="{fallback}">↺</button></div></div>"#,
        label = esc(label),
    )
}

fn ui_reset(i18n: &I18n, screen: &Screen, prefix: &str) -> String {
    format!(
        r#"<div class="settings-section settings-actions-row settings-section-reset"><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="reset-ui"><input type="hidden" name="value" value="{prefix}"><input type="hidden" name="back" value="{}"><button type="submit" class="btn btn-secondary">{}</button></form></div>"#,
        esc(&screen.path()),
        esc(&i18n.t("settings.resetSection"))
    )
}

fn colors_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let keys = [
        ("accent", "settings.colors.accent", "#6ea8fe"),
        ("accentHover", "settings.colors.accentHover", "#82b5ff"),
        ("button", "settings.colors.button", "#6ea8fe"),
        ("progress", "settings.colors.progress", "#6ea8fe"),
        ("like", "settings.colors.like", "#ef6b73"),
        ("danger", "settings.colors.danger", "#ef6b73"),
        ("warning", "settings.colors.warning", "#e6a23c"),
        ("success", "settings.colors.success", "#5ec992"),
        ("bgMain", "settings.colors.bgMain", "#111315"),
        ("bgSidebar", "settings.colors.bgSidebar", "#181b1f"),
        ("bgElevated", "settings.colors.bgElevated", "#252a31"),
        ("textPrimary", "settings.colors.textPrimary", "#f2f4f7"),
        ("textSecondary", "settings.colors.textSecondary", "#9da5af"),
        ("textMuted", "settings.colors.textMuted", "#6f7883"),
    ];
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&reset_row(i18n, screen, "reset-section", &i18n.t("settings.resetSection")));
    for (key, label, fallback) in keys {
        html.push_str(&color_field(store, key, &i18n.t(label), fallback));
    }
    html.push_str("</div>");
    html
}

fn layout_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&ui_reset(i18n, screen, "layout."));
    html.push_str(&slider_field(&i18n.t("settings.layout.uiScale"), "ui.layout.uiScale", ui_str(store, "layout.uiScale", "100"), "80", "140", "5", "%"));
    html.push_str(&slider_field(&i18n.t("settings.layout.fontSize"), "ui.layout.fontSize", ui_str(store, "layout.fontSize", "14"), "11", "20", "1", "px"));
    html.push_str(&select_field("density", &i18n.t("settings.layout.density"), ui_str(store, "layout.density", "standard"), sv(&[("compact", &i18n.t("settings.layout.density.compact")), ("standard", &i18n.t("settings.layout.density.standard")), ("spacious", &i18n.t("settings.layout.density.spacious"))]), "ui.layout.density", screen));
    html.push_str(&slider_field(&i18n.t("settings.layout.borderRadius"), "ui.layout.borderRadius", ui_str(store, "layout.borderRadius", "10"), "0", "20", "1", "px"));
    html.push_str(&slider_field(&i18n.t("settings.layout.borderWidth"), "ui.layout.borderWidth", ui_str(store, "layout.borderWidth", "1"), "0", "3", "0.5", "px"));
    html.push_str(&slider_field(&i18n.t("settings.layout.iconSize"), "ui.layout.iconSize", ui_str(store, "layout.iconSize", "18"), "14", "24", "1", "px"));
    html.push_str(&slider_field(&i18n.t("settings.layout.sidebarWidth"), "ui.layout.sidebarWidth", ui_str(store, "layout.sidebarWidth", "260"), "180", "360", "10", "px"));
    html.push_str(&slider_field(&i18n.t("settings.layout.playerHeight"), "ui.layout.playerHeight", ui_str(store, "layout.playerHeight", "96"), "72", "140", "4", "px"));
    html.push_str(&select_field("sidebar-pos", &i18n.t("settings.layout.sidebarPosition"), ui_str(store, "layout.sidebarPosition", "left"), sv(&[("left", &i18n.t("settings.layout.sidebarPosition.left")), ("right", &i18n.t("settings.layout.sidebarPosition.right"))]), "ui.layout.sidebarPosition", screen));
    html.push_str(&toggle_row(screen, "ui.layout.showTrackNumbers", "show-numbers", ui_on(store, "layout.showTrackNumbers", true), &i18n.t("settings.layout.showTrackNumbers")));
    html.push_str(&toggle_row(screen, "ui.layout.showArtworkInList", "show-list-art", ui_on(store, "layout.showArtworkInList", true), &i18n.t("settings.layout.showArtworkInList")));
    html.push_str(&toggle_row(screen, "ui.layout.showHoverActions", "show-hover", ui_on(store, "layout.showHoverActions", true), &i18n.t("settings.layout.showHoverActions")));
    html.push_str("</div>");
    html
}

fn player_settings_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&ui_reset(i18n, screen, "player."));
    html.push_str(&select_field("player-variant", &i18n.t("settings.player.variant"), ui_str(store, "player.variant", "standard"), sv(&[("compact", &i18n.t("settings.player.variant.compact")), ("standard", &i18n.t("settings.player.variant.standard")), ("expanded", &i18n.t("settings.player.variant.expanded"))]), "ui.player.variant", screen));
    html.push_str(&slider_field(&i18n.t("settings.player.coverSize"), "ui.player.coverSize", ui_str(store, "player.coverSize", "56"), "40", "96", "4", "px"));
    for (field, key, default) in [
        ("ui.player.showArtwork", "settings.player.showArtwork", true),
        ("ui.player.showTitle", "settings.player.showTitle", true),
        ("ui.player.showArtist", "settings.player.showArtist", true),
        ("ui.player.showPrevNext", "settings.player.showPrevNext", true),
        ("ui.player.showPlayPause", "settings.player.showPlayPause", true),
        ("ui.player.showVolume", "settings.player.showVolume", true),
        ("ui.player.showProgress", "settings.player.showProgress", true),
        ("ui.player.showTime", "settings.player.showTime", true),
        ("ui.player.showRemainingTime", "settings.player.showRemainingTime", false),
        ("ui.player.showSeconds", "settings.player.showSeconds", true),
        ("ui.player.showQueueButton", "settings.player.showQueueButton", true),
        ("ui.player.showLike", "settings.player.showLike", true),
    ] {
        let stored = field.trim_start_matches("ui.");
        html.push_str(&toggle_row(screen, field, field, ui_on(store, stored, default), &i18n.t(key)));
    }
    html.push_str("</div>");
    html
}

fn library_settings_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&ui_reset(i18n, screen, "library."));
    html.push_str(&slider_field(&i18n.t("settings.library.coverSize"), "ui.library.coverSize", ui_str(store, "library.coverSize", "40"), "28", "72", "4", "px"));
    html.push_str(&toggle_row(screen, "ui.library.showSecondaryText", "lib-secondary", ui_on(store, "library.showSecondaryText", true), &i18n.t("settings.library.showSecondaryText")));
    html.push_str(&select_field("double-click", &i18n.t("settings.library.doubleClick"), ui_str(store, "library.doubleClick", "playNow"), sv(&[("playNow", &i18n.t("settings.library.doubleClick.playNow")), ("togglePlay", &i18n.t("settings.library.doubleClick.togglePlay")), ("editMetadata", &i18n.t("settings.library.doubleClick.editMetadata"))]), "ui.library.doubleClick", screen));
    html.push_str(&format!(r#"<div class="settings-section"><div class="field-label">{}</div><p class="field-hint">{}</p>"#, esc(&i18n.t("settings.library.columnsTitle")), esc(&i18n.t("settings.library.columnsHint"))));
    for (id, key) in [
        ("index", "settings.library.column.index"),
        ("cover", "settings.library.column.cover"),
        ("title", "settings.library.column.title"),
        ("artist", "settings.library.column.artist"),
        ("album", "settings.library.column.album"),
        ("duration", "settings.library.column.duration"),
    ] {
        let field = format!("ui.library.column.{id}");
        let stored = format!("library.column.{id}");
        let default = id == "title" || id == "artist" || id == "album" || id == "duration" || id == "cover" || id == "index";
        html.push_str(&toggle_row(screen, &field, &field, ui_on(store, &stored, default), &i18n.t(key)));
    }
    html.push_str("</div></div>");
    html
}

fn covers_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&ui_reset(i18n, screen, "covers."));
    html.push_str(&toggle_row(screen, "ui.covers.show", "covers-show", ui_on(store, "covers.show", true), &i18n.t("settings.covers.show")));
    html.push_str(&select_field("cover-fit", &i18n.t("settings.covers.objectFit"), ui_str(store, "covers.objectFit", "cover"), sv(&[("cover", &i18n.t("settings.covers.objectFit.cover")), ("contain", &i18n.t("settings.covers.objectFit.contain")), ("fill", &i18n.t("settings.covers.objectFit.fill"))]), "ui.covers.objectFit", screen));
    html.push_str(&slider_field(&i18n.t("settings.covers.radius"), "ui.covers.radius", ui_str(store, "covers.radius", "8"), "0", "24", "1", "px"));
    html.push_str(&toggle_row(screen, "ui.covers.blurBackground", "covers-blur", ui_on(store, "covers.blurBackground", false), &i18n.t("settings.covers.blurBackground")));
    html.push_str(&slider_field(&i18n.t("settings.covers.blurAmount"), "ui.covers.blurAmount", ui_str(store, "covers.blurAmount", "24"), "0", "48", "1", "px"));
    html.push_str("</div>");
    html
}

fn animations_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&ui_reset(i18n, screen, "animations."));
    html.push_str(&toggle_row(screen, "ui.animations.enabled", "anim-on", ui_on(store, "animations.enabled", true), &i18n.t("settings.anim.enabled")));
    html.push_str(&slider_field(&i18n.t("settings.anim.speed"), "ui.animations.speed", ui_str(store, "animations.speed", "100"), "50", "200", "10", "%"));
    html.push_str(&toggle_row(screen, "ui.animations.reducedMotion", "anim-reduced", ui_on(store, "animations.reducedMotion", false), &i18n.t("settings.anim.reducedMotion")));
    html.push_str(&toggle_row(screen, "ui.animations.modalTransitions", "anim-modal", ui_on(store, "animations.modalTransitions", true), &i18n.t("settings.anim.modalTransitions")));
    html.push_str(&toggle_row(screen, "ui.animations.listAppear", "anim-list", ui_on(store, "animations.listAppear", false), &i18n.t("settings.anim.listAppear")));
    html.push_str("</div>");
    html
}

fn dynamic_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&ui_reset(i18n, screen, "dynamic."));
    html.push_str(&toggle_row(screen, "ui.dynamic.enabled", "dyn-on", ui_on(store, "dynamic.enabled", false), &i18n.t("settings.dynamic.fromCover")));
    html.push_str(&select_field("dyn-level", &i18n.t("settings.dynamic.level"), ui_str(store, "dynamic.level", "accent"), sv(&[("off", &i18n.t("settings.dynamic.level.off")), ("accent", &i18n.t("settings.dynamic.level.accent")), ("full", &i18n.t("settings.dynamic.level.full"))]), "ui.dynamic.level", screen));
    html.push_str(&slider_field(&i18n.t("settings.dynamic.strength"), "ui.dynamic.strength", ui_str(store, "dynamic.strength", "60"), "0", "100", "5", "%"));
    html.push_str(&toggle_row(screen, "ui.dynamic.autoUpdate", "dyn-auto", ui_on(store, "dynamic.autoUpdate", true), &i18n.t("settings.dynamic.autoUpdate")));
    html.push_str(r#"<div class="settings-section"><button type="button" class="btn btn-secondary" data-theme-act="palette">"#);
    html.push_str(&esc(&i18n.t("settings.dynamic.fromCurrentCover")));
    html.push_str("</button></div></div>");
    html
}

fn components_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&ui_reset(i18n, screen, "components."));
    html.push_str(&format!(r#"<div class="field-label">{}</div>"#, esc(&i18n.t("settings.components.pages"))));
    html.push_str(&slider_field(&i18n.t("settings.components.contentMaxWidth"), "ui.components.contentMaxWidth", ui_str(store, "components.contentMaxWidth", "1200"), "720", "1600", "20", "px"));
    html.push_str(&slider_field(&i18n.t("settings.components.pagePadding"), "ui.components.pagePadding", ui_str(store, "components.pagePadding", "24"), "8", "48", "2", "px"));
    html.push_str(&slider_field(&i18n.t("settings.components.titleSize"), "ui.components.titleSize", ui_str(store, "components.titleSize", "28"), "18", "48", "1", "px"));
    html.push_str(&toggle_row(screen, "ui.components.showTrackCount", "comp-count", ui_on(store, "components.showTrackCount", true), &i18n.t("settings.components.showTrackCount")));
    html.push_str(&toggle_row(screen, "ui.components.showSort", "comp-sort", ui_on(store, "components.showSort", true), &i18n.t("settings.components.showSort")));
    html.push_str(&format!(r#"<div class="field-label">{}</div>"#, esc(&i18n.t("settings.components.sidebar"))));
    html.push_str(&toggle_row(screen, "ui.components.showSectionLabels", "comp-labels", ui_on(store, "components.showSectionLabels", true), &i18n.t("settings.components.showSectionLabels")));
    html.push_str("</div>");
    html
}

fn extras_panel(i18n: &I18n, screen: &Screen) -> String {
    format!(
        r#"<div class="settings-panel"><div class="settings-section"><p class="field-hint">{}</p><form method="post" action="/act"><input type="hidden" name="action" value="reset-all"><input type="hidden" name="back" value="{}"><button type="submit" class="btn btn-danger">{}</button></form></div></div>"#,
        esc(&i18n.tf("settings.extras.resetHint", &[("theme", "dark"), ("count", "13")])),
        esc(&screen.path()),
        esc(&i18n.t("settings.extras.resetAll"))
    )
}

fn hotkey_label(code: &str, i18n: &I18n) -> String {
    if code.is_empty() {
        return i18n.t("settings.hotkeys.unassigned");
    }
    code.trim_start_matches("Key").trim_start_matches("Digit").trim_start_matches("Arrow").to_string()
}

fn hotkeys_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let mut counts = std::collections::BTreeMap::<String, usize>::new();
    for (action, default, _) in hotkey_defaults() {
        let code = hotkey_value(store, action, default);
        if !code.is_empty() {
            *counts.entry(code).or_default() += 1;
        }
    }
    let mut rows = String::new();
    for (action, default, label) in hotkey_defaults() {
        let code = hotkey_value(store, action, default);
        let conflict = counts.get(&code).copied().unwrap_or(0) > 1;
        rows.push_str(&format!(
            r#"<li class="hotkey-row{conflict}"><span>{label}</span><div class="hotkey-actions"><button type="button" class="hotkey-bind" data-hotkey="{action}" data-hotkey-default="{default}">{shown}</button><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="hotkey.{action}"><input type="hidden" name="value" value="{default}"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-ghost">{def}</button></form></div>{warn}</li>"#,
            conflict = if conflict { " conflict" } else { "" },
            label = esc(&i18n.t(label)),
            shown = esc(&hotkey_label(&code, i18n)),
            def = esc(&i18n.t("settings.hotkeys.default")),
            back = esc(&screen.path()),
            warn = if conflict { format!(r#"<span class="hotkey-conflict">{}</span>"#, esc(&i18n.t("settings.hotkeys.conflict"))) } else { String::new() },
        ));
    }
    format!(
        r#"<div class="settings-panel">{reset}<ul class="hotkey-list">{rows}</ul></div>"#,
        reset = reset_row(i18n, screen, "reset-hotkeys", &i18n.t("settings.hotkeys.resetAll")),
    )
}

fn behavior_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let b = &store.settings.behavior;
    let mut html = String::from(r#"<div class="settings-panel">"#);
    html.push_str(&reset_row(i18n, screen, "reset-behavior", &i18n.t("settings.resetSection")));
    html.push_str(r#"<div class="settings-section">"#);
    html.push_str(&select_field(
        "start-view",
        &i18n.t("settings.behavior.startView"),
        &b.start_view,
        sv(&[
            ("home", &i18n.t("nav.home")),
            ("all", &i18n.t("nav.all")),
            ("liked", &i18n.t("nav.liked")),
            ("last", &i18n.t("settings.behavior.startView.last")),
        ]),
        "start_view",
        screen,
    ));
    html.push_str("</div>");
    let toggles = [
        ("restore_last_page", b.restore_last_page, "settings.behavior.restoreLastPage"),
        ("restore_track", b.restore_track, "settings.behavior.restoreTrack"),
        ("restore_queue", b.restore_queue, "settings.behavior.restoreQueue"),
        ("focus_search_on_open", b.focus_search_on_open, "settings.behavior.focusSearchOnOpen"),
        ("confirm_delete", b.confirm_delete, "settings.behavior.confirmDelete"),
        ("confirm_clear_queue", b.confirm_clear_queue, "settings.behavior.confirmClearQueue"),
        ("space_toggles_playback", b.space_toggles_playback, "settings.behavior.spaceTogglesPlayback"),
        ("auto_resume_on_launch", b.auto_resume_on_launch, "settings.behavior.autoResumeOnLaunch"),
    ];
    for (field, on, key) in toggles {
        html.push_str(&toggle_row(screen, field, field, on, &i18n.t(key)));
    }
    html.push_str("</div>");
    html
}

fn playback_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let p = &store.settings.playback;
    let cross = if p.crossfade_seconds > 0 {
        format!("{} {}", p.crossfade_seconds, i18n.t("playback.sec"))
    } else {
        i18n.t("playback.off")
    };
    format!(
        r#"<div class="settings-panel" style="margin-top:16px"><div class="settings-section"><h3 style="margin-bottom:8px">{title}</h3><p class="field-hint" style="margin-bottom:12px">{hint}</p><div class="settings-toggles">{shuffle}{repeat}{normalize}<label class="eq-slider"><span class="field-label" data-range-label="{cross_label}">{cross_label}: {cross}</span><input type="range" min="0" max="12" step="1" value="{seconds}" data-set-field="crossfade" data-set-unit=" {sec}"></label>{gapless}{eq}{bands}{tray}</div></div></div>"#,
        title = esc(&i18n.t("playback.title")),
        hint = esc(&i18n.t("playback.hint")),
        shuffle = toggle_row(screen, "shuffle", "pb-shuffle", p.shuffle, &i18n.t("playback.shuffle")),
        repeat = select_field("repeat-mode", &i18n.t("playback.repeat"), &p.repeat, sv(&[("off", &i18n.t("playback.repeatOff")), ("one", &i18n.t("playback.repeatOne")), ("all", &i18n.t("playback.repeatAll"))]), "repeat", screen),
        normalize = toggle_row(screen, "normalize", "pb-normalize", p.normalize_volume, &i18n.t("playback.normalize")),
        cross_label = esc(&i18n.t("playback.crossfade")),
        cross = esc(&cross),
        seconds = p.crossfade_seconds,
        sec = esc(&i18n.t("playback.sec")),
        gapless = toggle_row(screen, "gapless", "pb-gapless", p.gapless_enabled, &i18n.t("playback.gapless")),
        eq = toggle_row(screen, "eq", "pb-eq", p.eq_enabled, &i18n.t("playback.eq")),
        bands = eq_controls(store, i18n, screen),
        tray = toggle_row(screen, "tray", "pb-tray", p.close_to_tray, &i18n.t("playback.tray")),
    )
}

fn eq_controls(store: &Store, i18n: &I18n, _screen: &Screen) -> String {
    if !store.settings.playback.eq_enabled {
        return String::new();
    }
    let p = &store.settings.playback;
    format!(
        r#"{}{}{}{}"#,
        select_field("eq-preset", &i18n.t("playback.eqPreset"), &p.eq_preset, sv(&[("flat", "Flat"), ("bassBoost", "Bass"), ("vocal", "Vocal"), ("custom", &i18n.t("playback.eqCustom"))]), "eq_preset", _screen),
        band_slider(&i18n.t("playback.eqBass"), "eq_bass", p.eq_bass),
        band_slider(&i18n.t("playback.eqMid"), "eq_mid", p.eq_mid),
        band_slider(&i18n.t("playback.eqTreble"), "eq_treble", p.eq_treble),
    )
}

fn band_slider(label: &str, field: &str, value: i32) -> String {
    format!(
        r#"<label class="eq-slider"><span class="field-label" data-range-label="{label}">{label}: {value} dB</span><input type="range" min="-12" max="12" step="1" value="{value}" data-set-field="{field}" data-set-unit=" dB"></label>"#
    )
}

fn tools_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let back = esc(&screen.path());
    let ytdlp = format!(
        r#"<div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><form method="post" action="/act"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="ytdlp_path"><input type="hidden" name="back" value="{}"><label class="field-label" for="ytdlp-path">{}</label><input id="ytdlp-path" class="field-input" name="value" value="{}" placeholder="D:\yt-dlp\yt-dlp.exe"><div class="settings-inline-actions" style="margin-top:10px"><button type="submit" class="btn btn-secondary">{}</button></div></form><form method="post" action="/act" style="margin-top:12px"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="ytdlp_proxy"><input type="hidden" name="back" value="{}"><label class="field-label" for="ytdlp-proxy">{}</label><p class="field-hint" style="margin-bottom:8px">{}</p><input id="ytdlp-proxy" class="field-input" name="value" value="{}" placeholder="socks5://127.0.0.1:1080"><div class="settings-inline-actions" style="margin-top:10px"><button type="submit" class="btn btn-secondary">{}</button></div></form></div>"#,
        esc(&i18n.t("tools.ytdlpPath")),
        back,
        esc(&i18n.t("tools.ytdlpPath")),
        esc(&store.settings.ytdlp_path),
        esc(&i18n.t("common.save")),
        back,
        esc(&i18n.t("tools.ytdlpProxy")),
        esc(&i18n.t("tools.ytdlpProxyHint")),
        esc(&store.settings.ytdlp_proxy),
        esc(&i18n.t("common.save")),
    );
    format!(
        r#"<div class="settings-panel">{ytdlp}<div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:8px">{}</p><p class="field-hint" style="margin-bottom:12px">{}</p><div class="settings-inline-actions"><button type="button" class="btn btn-secondary" data-tool="updates">{}</button><button type="button" class="btn btn-ghost" data-tool="releases">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><div class="settings-inline-actions"><button type="button" class="btn btn-secondary" data-tool="export-backup">{}</button><button type="button" class="btn btn-primary" data-tool="import-backup">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><label class="field-label" for="playlist-url">{}</label><input id="playlist-url" class="field-input" type="url" placeholder="{}"><div class="settings-inline-actions" style="margin-top:10px"><button type="button" class="btn btn-primary" data-tool="playlist-url">{}</button><button type="button" class="btn btn-ghost" data-tool="playlist-file">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><button type="button" class="btn btn-primary" data-tool="phone">{}</button></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><button type="button" class="btn btn-secondary" data-tool="meta">{}</button><div style="margin-top:12px"><button type="button" class="btn btn-ghost" data-tool="rebuild-autos">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><div class="settings-inline-actions"><button type="button" class="btn btn-secondary" data-tool="find-dupes">{}</button><button type="button" class="btn btn-primary" data-tool="merge-dupes">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><form method="post" action="/act"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="listenbrainz"><input type="hidden" name="value" value="{lb}"><input type="hidden" name="back" value="{back}"><label class="ui-toggle"><input type="checkbox" class="ui-toggle-input" {checked} onchange="this.form.value.value=this.checked?'1':'0';this.form.requestSubmit()"><span class="ui-toggle-track" aria-hidden="true"><span class="ui-toggle-thumb"></span></span><span class="ui-toggle-label">ListenBrainz</span></label></form></div></div>"#,
        esc(&i18n.t("tools.updates")),
        esc(&i18n.t("tools.updatesHint")),
        esc(&i18n.tf("tools.currentVersion", &[("version", "1.3.3")])),
        esc(&i18n.t("tools.updateCheck")),
        esc(&i18n.t("tools.updateOpenPage")),
        esc(&i18n.t("tools.backup")),
        esc(&i18n.t("tools.backupHint")),
        esc(&i18n.t("tools.backupExport")),
        esc(&i18n.t("tools.backupImport")),
        esc(&i18n.t("tools.playlistImport")),
        esc(&i18n.t("tools.playlistImportHint")),
        esc(&i18n.t("tools.playlistUrlLabel")),
        esc(&i18n.t("tools.playlistUrlPh")),
        esc(&i18n.t("tools.playlistUrlBtn")),
        esc(&i18n.t("tools.playlistImportBtn")),
        esc(&i18n.t("tools.phone")),
        esc(&i18n.t("tools.phoneHint")),
        esc(&i18n.t("tools.phoneSync")),
        esc(&i18n.t("tools.meta")),
        esc(&i18n.t("tools.metaHint")),
        esc(&i18n.t("tools.metaSync")),
        esc(&i18n.t("tools.rebuildAutos")),
        esc(&i18n.t("tools.repair")),
        esc(&i18n.t("tools.repairHint")),
        esc(&i18n.t("tools.repairFind")),
        esc(&i18n.t("tools.repairMerge")),
        esc(&i18n.t("tools.scrobble")),
        esc(&i18n.t("tools.scrobbleHint")),
        ytdlp = ytdlp,
        lb = if store.settings.listenbrainz { "1" } else { "0" },
        checked = if store.settings.listenbrainz { "checked" } else { "" },
    )
}

fn onboarding(i18n: &I18n) -> String {
    format!(
        r#"<div class="onboard-overlay" role="dialog" aria-modal="true" aria-label="{}"><div class="onboard-card"><div class="onboard-brand">IMe Music</div><h2 class="onboard-title">{}</h2><p class="onboard-step">{}</p><div class="onboard-dots" aria-hidden="true"><span class="onboard-dot is-active"></span><span class="onboard-dot"></span><span class="onboard-dot"></span><span class="onboard-dot"></span></div><div class="onboard-actions"><button type="button" class="btn btn-secondary" data-pick="pick-folder">{}{}</button><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="onboard-next"><button type="submit" class="btn btn-primary">{}</button></form><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="onboard-done"><button type="submit" class="btn btn-ghost">{}</button></form></div></div></div>"#,
        esc(&i18n.t("onboard.title")),
        esc(&i18n.t("onboard.title")),
        esc(&i18n.t("onboard.step1")),
        icon("import", 16),
        esc(&i18n.t("home.importFolder")),
        esc(&i18n.t("onboard.next")),
        esc(&i18n.t("onboard.skip")),
    )
}

fn create_playlist_modal(i18n: &I18n, screen: &Screen) -> String {
    let mut close = screen.clone();
    close.modal.clear();
    format!(
        r#"<div class="modal-overlay"><a href="{}" style="position:absolute;inset:0"></a><div class="modal" style="max-width:440px;position:relative" role="dialog"><div class="modal-header"><h2>{}</h2></div><form method="post" action="/act" class="modal-body"><input type="hidden" name="action" value="create-playlist"><input type="hidden" name="back" value="{}"><label class="field-label">{}</label><input class="field-input" name="name" required><div class="modal-footer" style="padding:16px 0 0"><button type="submit" class="btn btn-primary">{}</button></div></form></div></div>"#,
        close.path(),
        esc(&i18n.t("nav.createPlaylist")),
        esc(&close.path()),
        esc(&i18n.t("playlist.name")),
        esc(&i18n.t("common.create"))
    )
}

fn youtube_modal(i18n: &I18n, screen: &Screen) -> String {
    let mut close = screen.clone();
    close.modal.clear();
    format!(
        r#"<div class="modal-overlay"><a href="{}" style="position:absolute;inset:0"></a><div class="modal" style="max-width:440px;position:relative" role="dialog"><div class="modal-header"><h2>YouTube</h2></div><form method="post" action="/act" class="modal-body"><input type="hidden" name="action" value="youtube"><input type="hidden" name="back" value="{}"><label class="field-label">{}</label><input class="field-input" name="value" placeholder="https://"><p class="field-hint">{}</p><div class="modal-footer" style="padding:16px 0 0"><button type="submit" class="btn btn-primary">{}</button></div></form></div></div>"#,
        close.path(),
        esc(&close.path()),
        esc(&i18n.t("lib.addYoutube")),
        esc(&i18n.t("yt.hint")),
        esc(&i18n.t("common.add"))
    )
}
