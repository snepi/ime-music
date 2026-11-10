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
            r#"<style>:root,[data-theme="dark"]{{--bg-main:{bg};--bg-sidebar:{side};--accent:{accent};--accent-hover:{accent};--button-accent:{accent};--progress:{accent};}}</style>"#,
            bg = esc(bg),
            side = esc(side),
            accent = esc(accent)
        ));
    }
    html.push_str("</head><body");
    html.push_str(&format!(
        r#" data-volume="{}" data-current="{}">"#,
        store.settings.volume,
        esc(store.player.current_id.as_deref().unwrap_or(""))
    ));
    html.push_str(r#"<div id="root"><div class=""#);
    html.push_str(&app_class);
    html.push_str(r#"">"#);
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
    html.push_str(
        r#"<input id="pick-files" data-upload="1" type="file" multiple accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac,.opus,.wma" hidden>
<input id="pick-folder" data-upload="1" type="file" webkitdirectory directory multiple hidden>
<script src="/player.js"></script></body></html>"#,
    );
    html
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
        r#"<div class="titlebar"><div class="titlebar-left"><img class="titlebar-app-icon" src="/brand/icon.png" alt="" width="22" height="22" draggable="false"><img class="titlebar-wordmark" src="/brand/wordmark.png" alt="IMe Music" draggable="false"></div><div class="titlebar-controls"><div class="titlebar-notifications-wrap"><button type="button" class="titlebar-btn" aria-label="{bell}" title="{bell_hint}"><span class="titlebar-btn-icon">{bell_icon}</span></button></div>{settings_btn}<button type="button" class="titlebar-btn" data-win="minimize" aria-label="{min}" title="{min}">{min_icon}</button><button type="button" class="titlebar-btn" data-win="maximize" aria-label="{max}" title="{max}">{max_icon}</button><button type="button" class="titlebar-btn close" data-win="close" aria-label="{close}" title="{close}">{close_icon}</button></div></div>"#,
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
                r#"<div class="sidebar-now-playing"><div class="sidebar-cover sidebar-cover-fallback">{}</div><div class="sidebar-song-info"><div class="sidebar-song-title" title="{}">{}</div><button type="button" class="artist-link sidebar-song-artist">{}</button></div><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="like"><input type="hidden" name="id" value="{}"><input type="hidden" name="back" value="{}"><button type="submit" class="like-btn {}" aria-label="{}">{}</button></form></div>"#,
                icon("disc", 20),
                esc(&song.title),
                esc(&song.title),
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
        "recommendations" => recommendations_view(i18n, screen),
        _ => home_view(i18n),
    }
}

fn home_view(i18n: &I18n) -> String {
    format!(
        r#"<div class="home-view"><div class="view-header"><div class="view-info"><h1>{}</h1><p>{}</p></div><button type="button" class="btn btn-primary" data-pick="pick-folder">{}{}</button></div><section class="home-discovery-search"><div class="search-field home-discovery-search-field">{}<input type="search" class="search-input" placeholder="{}" aria-label="{}"></div><p class="home-discovery-search-hint">{}</p></section><section class="home-waves"><div class="home-waves-card"><button type="button" class="home-waves-main" data-act="waves" aria-label="{}"><div class="home-waves-visual" aria-hidden="true"><span class="home-waves-bar"></span><span class="home-waves-bar"></span><span class="home-waves-bar"></span><span class="home-waves-bar"></span><span class="home-waves-bar"></span></div><div class="home-waves-text"><div class="home-waves-brand">IMe Waves</div><div class="home-waves-title">{}</div><div class="home-waves-meta">{}</div></div><span class="home-waves-play" aria-hidden="true">{}</span></button><div class="home-waves-actions"><button type="button" class="btn btn-ghost" data-act="waves-settings" title="{}" aria-expanded="false">{}</button></div></div></section></div>"#,
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
        r#"<form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="sort"><input type="hidden" name="back" value="{}"><select class="sort-select" name="value" aria-label="{}" onchange="this.form.submit()">{}</select></form>"#,
        esc(&screen.path()),
        esc(&i18n.t("lib.sort")),
        sort_options(i18n, &sort)
    ));
    html.push_str("</div></div>");
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
            let artist = if song.artist.is_empty() {
                i18n.t("lib.unknownArtist")
            } else {
                song.artist.clone()
            };
            html.push_str(&format!(
                r#"<div class="song-row{cur}" data-play="{id}"><div class="song-index"><span class="index-num">{n}</span><span class="index-play">{play}</span></div><div class="song-cover-cell"><div class="song-cover song-cover-fallback">{disc}</div></div><div class="song-title-cell"><div class="song-text"><button type="button" class="song-name copyable-label">{title}</button><button type="button" class="artist-link song-artist">{artist}</button></div><button type="button" class="song-menu-btn" aria-label="{menu}">{more}</button></div><div class="song-album">{album}</div><div class="song-duration">{dur}</div><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="like"><input type="hidden" name="id" value="{id}"><input type="hidden" name="back" value="{back}"><button type="submit" class="like-btn {liked}" aria-label="{like_label}">{heart}</button></form></div>"#,
                cur = if current { " current" } else { "" },
                id = esc(&song.id),
                n = i + 1,
                play = icon(if playing { "pause" } else { "play" }, 14),
                disc = icon("music", 16),
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
        r#"<div class="wishlist-view"><div class="view-header"><div class="view-info"><h1>{}</h1><p>{}</p></div></div>"#,
        esc(&i18n.t("wish.title")),
        esc(&i18n.t("wish.subtitle"))
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
    } else {
        html.push_str(r#"<ul class="wishlist-list">"#);
        for item in &store.settings.wishlist {
            html.push_str(&format!(
                r#"<li class="wishlist-row"><button type="button" class="wishlist-play">{}</button><div class="wishlist-meta"><div class="wishlist-title">{}</div><button type="button" class="artist-link wishlist-artist">{}</button></div></li>"#,
                icon("disc", 22),
                esc(&item.title),
                esc(&item.artist)
            ));
        }
        html.push_str("</ul>");
    }
    html.push_str("</div>");
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
                    r#"<li class="history-row"><button type="button" class="history-row-main" data-play="{}"><div class="history-cover">{}</div><div class="history-row-text"><div class="history-row-title">{}</div><span class="artist-link history-row-artist">{}</span></div><div class="history-row-meta"><span>{}</span><span>{}</span></div></button></li>"#,
                    esc(&song.id),
                    icon("music", 18),
                    esc(&song.title),
                    esc(&song.artist),
                    esc(&i18n.t("history.today")),
                    fmt_time(song.duration)
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
    for (i, key) in [
        "rec.filter.all",
        "rec.filter.liked",
        "rec.filter.current",
        "rec.filter.wishlist",
        "rec.filter.chart",
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
            r#"<button type="button" role="tab" class="{class}" aria-selected="{}">{}</button>"#,
            if i == 0 { "true" } else { "false" },
            esc(&i18n.t(key))
        ));
    }
    html.push_str(&format!(
        r#"<button type="button" role="tab" class="rec-filter-chip" disabled>{}</button></div>"#,
        esc(&i18n.t("rec.blocked"))
    ));
    html.push_str(&empty_state(
        "disc",
        &i18n.t("rec.empty"),
        &i18n.t("rec.emptyHintLong"),
        &format!(
            r#"<button type="button" class="btn btn-secondary">{}</button>"#,
            esc(&i18n.t("rec.refresh"))
        ),
    ));
    let _ = screen;
    html.push_str("</div>");
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
            r#"<div class="player-cover player-cover-fallback">{}</div><div class="player-track-text"><button type="button" class="player-track-title copyable-label">{}</button><button type="button" class="artist-link player-track-artist">{}</button></div>"#,
            icon("disc", 20),
            esc(&song.title),
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
        r#"<div class="player-bar-wrap player-variant-standard"><div class="player-bar"><div class="player-track-info">{track}</div><div class="player-center"><div class="player-controls"><button type="button" class="player-btn{shuffle}" data-act="shuffle" aria-label="{shuffle_l}" title="{shuffle_l}">{shuffle_i}</button><button type="button" class="player-btn" data-act="prev" aria-label="{prev}" title="{prev}">{prev_i}</button><button type="button" class="player-btn play-pause" data-act="toggle" aria-label="{play}" title="{play}">{play_i}</button><button type="button" class="player-btn" data-act="next" aria-label="{next}" title="{next}">{next_i}</button><button type="button" class="player-btn{repeat}" data-act="repeat" aria-label="{repeat_l}" title="{repeat_l}">{repeat_i}</button><button type="button" class="player-btn" data-act="similar" aria-label="{similar}" title="{similar}" disabled>{similar_i}</button><div class="player-sleep-wrap"><button type="button" class="player-btn" data-act="sleep" aria-label="{sleep}" title="{sleep}">{sleep_i}</button></div></div><div class="player-progress"><span class="player-time">00:00</span><div class="progress-bar"><div class="progress-fill" style="width:0%"></div><div class="progress-thumb" style="left:0%"></div></div><span class="player-time">00:00</span></div></div><div class="player-right"><div class="player-volume"><button type="button" class="player-btn" data-act="mute" aria-label="{mute}" title="{mute}">{vol_i}</button><div class="volume-bar"><div class="volume-fill" style="width:{vol_pct}%"></div><div class="volume-thumb" style="left:{vol_pct}%"></div></div></div><button type="button" class="player-btn queue-toggle" data-act="queue" aria-label="{queue}" title="{queue}">{queue_i}{queue_badge}</button><button type="button" class="player-btn" aria-label="{lyrics}" title="{lyrics}" disabled>{lyrics_i}</button><button type="button" class="player-btn" data-act="mini" aria-label="{mini}" title="{mini}">{mini_i}</button></div></div></div>"#,
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
        body.push_str(r#"<div class="settings-panel-scroll"><div class="settings-panel"><div class="settings-section"><p class="field-hint">"#);
        body.push_str(&esc(&i18n.t("settings.hotkeys")));
        body.push_str("</p></div></div></div>");
    } else {
        body.push_str(r#"<div class="settings-panel-scroll">"#);
        body.push_str(&tools_panel(store, i18n, screen));
        body.push_str("</div>");
    }
    format!(
        r#"<div class="modal-overlay" role="presentation"><a class="modal-overlay-dismiss" href="{close_href}" style="position:absolute;inset:0"></a><div class="modal settings-modal-wide" style="max-width:{width}px;position:relative" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><div class="modal-header"><h2 id="modal-title">{title}</h2>{close_btn}</div><div class="modal-body"><div class="settings-shell"><nav class="settings-tabs" aria-label="{tabs_aria}">{tabs}</nav>{body}</div></div><div class="modal-footer">{footer}</div></div></div>"#,
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
        "theme-editor" => theme_editor(i18n, screen),
        "wallpaper" => wallpaper_panel(i18n, screen),
        "presets" => presets_panel(i18n, screen),
        "general" => general_panel(store, i18n, screen),
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
        r#"<div class="settings-section"><form method="post" action="/act"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="{field}"><input type="hidden" name="value" value="{}"><input type="hidden" name="back" value="{}"><label class="ui-toggle" for="{id}"><input id="{id}" type="checkbox" class="ui-toggle-input" {} onchange="this.form.value.value=this.checked?'1':'0';this.form.submit()"><span class="ui-toggle-track" aria-hidden="true"><span class="ui-toggle-thumb"></span></span><span class="ui-toggle-label">{}</span></label></form></div>"#,
        if checked { "1" } else { "0" },
        esc(&screen.path()),
        if checked { "checked" } else { "" },
        esc(label)
    )
}

fn theme_editor(i18n: &I18n, screen: &Screen) -> String {
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
            r#"<div class="theme-color-row"><div class="theme-color-meta"><div class="theme-color-title">{}</div><code class="theme-color-key">{key}</code><p class="theme-color-desc">{}</p></div><div class="theme-color-controls"><span class="theme-color-preview" style="background:{hex}"></span><input type="color" class="ui-color-swatch" value="{hex}" aria-label="{}"><input class="field-input theme-color-hex" value="{hex}" spellcheck="false"><button type="button" class="btn btn-ghost" title="{}">↺</button></div></div>"#,
            esc(&i18n.t(label)),
            esc(&i18n.t(desc)),
            esc(&i18n.t(label)),
            esc(&i18n.t("settings.theme.restore"))
        ));
    }
    format!(
        r#"<div class="theme-editor"><div class="theme-editor-toolbar">{select}<div class="settings-actions-row">{actions}</div><p class="field-hint">{hint}</p></div><div class="theme-editor-controls">{live}{dirty}<input class="field-input" placeholder="{search_ph}"><button type="button" class="btn btn-ghost">{expand}</button><button type="button" class="btn btn-ghost">{collapse}</button>{palette}</div><div class="theme-editor-grid"><div class="theme-editor-groups"><section class="theme-group"><header class="theme-group-header"><button type="button" class="theme-group-toggle"><strong>{}</strong><span>{}</span></button><div class="theme-group-actions"><button type="button" class="btn btn-ghost">{}</button><button type="button" class="btn btn-ghost">{}</button></div></header>{rows}</section></div><aside class="theme-editor-preview-pane"><div class="settings-actions-row">{win}{page}</div>{preview}<div class="settings-actions-row"><button type="button" class="btn btn-primary">{}</button><button type="button" class="btn btn-secondary">{}</button><button type="button" class="btn btn-ghost">{}</button></div></aside></div></div>"#,
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
            "default",
            sv(&[
                ("default", "Default ✓"),
                ("graphite", "Graphite"),
                ("midnight", "Midnight"),
                ("ocean", "Ocean"),
                ("forest", "Forest"),
                ("rose", "Rose"),
                ("amber", "Amber"),
                ("violet", "Violet"),
            ]),
            "preset",
            screen
        ),
        rows = rows,
        win = select_field("pv-mode", &i18n.t("settings.preview.window"), "standard", sv(&[("small", &i18n.t("settings.preview.small")), ("standard", &i18n.t("settings.preview.standard")), ("wide", &i18n.t("settings.preview.wide"))]), "preview_mode", screen),
        page = select_field("pv-page", &i18n.t("settings.preview.page"), "library", sv(&[("library", &i18n.t("settings.preview.library")), ("playlist", &i18n.t("settings.preview.playlist")), ("metadata", &i18n.t("settings.preview.metadata"))]), "preview_page", screen),
        preview = theme_preview(i18n),
        actions = format!(
            r#"<button type="button" class="btn btn-secondary">{}</button><button type="button" class="btn btn-secondary">{}</button><button type="button" class="btn btn-ghost">{}</button><button type="button" class="btn btn-danger">{}</button><button type="button" class="btn btn-ghost">{}</button><button type="button" class="btn btn-ghost">{}</button><button type="button" class="btn btn-secondary">{}</button>"#,
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

fn theme_preview(i18n: &I18n) -> String {
    format!(
        r#"<div class="theme-preview theme-preview-standard" style="--pv-bg:#111315;--pv-sidebar:#181b1f;--pv-panel:#20242a;--pv-text:#f2f4f7;--pv-muted:#9da5af;--pv-accent:#6ea8fe;--pv-border:rgba(255,255,255,0.08);--pv-hover:#2a3037;--pv-active:#303842;--pv-progress:#6ea8fe;--pv-titlebar:#0d0f11;--pv-danger:#ef6b73;--pv-play-bg:#f2f4f7;--pv-play-fg:#111315"><div class="tp-titlebar">IMe Music</div><div class="tp-body"><aside class="tp-sidebar"><div class="tp-nav active">{}</div><div class="tp-nav">{}</div><div class="tp-nav">{}</div></aside><section class="tp-main"><h3>{}</h3><ul class="tp-list"><li><span class="tp-cover"></span><span><strong>Track One</strong><small>Artist</small></span></li><li class="active"><span class="tp-cover"></span><span><strong>Track Two</strong><small>Artist</small></span></li><li><span class="tp-cover"></span><span><strong>Track Three</strong><small>Artist</small></span></li></ul><div class="tp-menu"><div>{}</div><div>{}</div><div class="danger">{}</div></div></section></div><div class="tp-player"><span class="tp-cover sm"></span><div class="tp-player-meta"><strong>Now Playing</strong><small>Artist</small></div><button type="button" class="tp-play" aria-label="Play"></button><div class="tp-progress"><div class="tp-progress-fill"></div></div><div class="tp-volume"><div class="tp-volume-fill"></div></div></div></div>"#,
        esc(&i18n.t("settings.preview.library")),
        esc(&i18n.t("settings.preview.favorites")),
        esc(&i18n.t("settings.preview.playlist")),
        esc(&i18n.t("settings.preview.allMusic")),
        esc(&i18n.t("settings.preview.addToQueue")),
        esc(&i18n.t("settings.preview.edit")),
        esc(&i18n.t("settings.preview.delete")),
    )
}

fn wallpaper_panel(i18n: &I18n, screen: &Screen) -> String {
    format!(
        r#"<div class="settings-panel wallpaper-mei">{reset}<div class="wp-mode-row"><span class="field-label">{}</span><div class="wp-segment"><button type="button" class="wp-segment-btn active">{}</button><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="wallpaper"><input type="hidden" name="value" value="fitBlur"><input type="hidden" name="back" value="{back}"><button type="submit" class="wp-segment-btn">{}</button></form></div></div><div class="wp-stage is-off"><div class="wp-stage-canvas"><div class="wp-stage-empty">{}</div></div><div class="wp-stage-footer"><div class="wp-stage-meta"><strong>{}</strong><span>{}: {}</span></div><div class="wp-stage-actions"><button type="button" class="btn btn-primary" data-pick="pick-wallpaper">{}</button><button type="button" class="btn btn-danger" aria-label="{}" title="{}">⌫</button></div></div></div></div>"#,
        esc(&i18n.t("settings.wallpaper.mode")),
        esc(&i18n.t("settings.wallpaper.none")),
        esc(&i18n.t("settings.wallpaper.fitBlur")),
        esc(&i18n.t("settings.wallpaper.noImage")),
        esc(&i18n.t("settings.wallpaper.noneSelected")),
        esc(&i18n.t("settings.wallpaper.mode")),
        esc(&i18n.t("settings.wallpaper.none")),
        esc(&i18n.t("settings.wallpaper.chooseImage")),
        esc(&i18n.t("settings.wallpaper.delete")),
        esc(&i18n.t("settings.wallpaper.deleteReset")),
        reset = reset_row(i18n, screen, "reset-wallpaper", &i18n.t("settings.wallpaper.resetWallpaper")),
        back = esc(&screen.path()),
    )
}

fn presets_panel(i18n: &I18n, screen: &Screen) -> String {
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
        grid.push_str(&format!(
            r#"<div class="preset-card"><div class="preset-swatches" style="background:linear-gradient(135deg,{bg},{accent})"></div><strong>{name}</strong><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="preset"><input type="hidden" name="value" value="{id}"><input type="hidden" name="back" value="{}"><button type="submit" class="btn btn-secondary">{}</button></form></div>"#,
            esc(&screen.path()),
            esc(&i18n.t("settings.presets.apply"))
        ));
    }
    format!(
        r#"<div class="settings-panel">{reset}<div class="settings-section settings-actions-row"><button type="button" class="btn btn-secondary">{}</button></div><div class="field-label">{}</div><div class="preset-grid">{grid}</div><div class="settings-section"><div class="field-label">{}</div><div class="field-row"><input class="field-input" placeholder="{}"><button type="button" class="btn btn-primary">{}</button></div></div></div>"#,
        esc(&i18n.t("settings.presets.importJson")),
        esc(&i18n.t("settings.presets.builtin")),
        esc(&i18n.t("settings.presets.saveCurrent")),
        esc(&i18n.t("settings.presets.namePlaceholder")),
        esc(&i18n.t("common.save")),
        reset = reset_row(i18n, screen, "reset-preset", &i18n.t("settings.presets.resetDefault")),
        grid = grid,
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
        r#"<div class="settings-panel" style="margin-top:16px"><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><div class="settings-toggles">{}{}<label class="eq-slider"><span class="field-label">{}: {}</span><input type="range" min="0" max="12" step="1" value="{}"></label>{}{}{}</div></div></div>"#,
        esc(&i18n.t("playback.title")),
        esc(&i18n.t("playback.hint")),
        toggle_row(screen, "shuffle", "pb-shuffle", p.shuffle, &i18n.t("playback.shuffle")),
        select_field("repeat-mode", &i18n.t("playback.repeat"), &p.repeat, sv(&[("off", &i18n.t("playback.repeatOff")), ("one", &i18n.t("playback.repeatOne")), ("all", &i18n.t("playback.repeatAll"))]), "repeat", screen),
        esc(&i18n.t("playback.crossfade")),
        esc(&cross),
        p.crossfade_seconds,
        toggle_row(screen, "gapless", "pb-gapless", p.gapless_enabled, &i18n.t("playback.gapless")),
        toggle_row(screen, "eq", "pb-eq", p.eq_enabled, &i18n.t("playback.eq")),
        toggle_row(screen, "tray", "pb-tray", p.close_to_tray, &i18n.t("playback.tray")),
    )
}

fn tools_panel(store: &Store, i18n: &I18n, screen: &Screen) -> String {
    let back = esc(&screen.path());
    format!(
        r#"<div class="settings-panel"><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:8px">{}</p><p class="field-hint" style="margin-bottom:12px">{}</p><div class="settings-inline-actions"><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="check-updates"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-secondary">{}</button></form><button type="button" class="btn btn-ghost">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><div class="settings-inline-actions"><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="export-backup"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-secondary">{}</button></form><button type="button" class="btn btn-primary">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><label class="field-label" for="playlist-url">{}</label><input id="playlist-url" class="field-input" type="url" placeholder="{}"><div class="settings-inline-actions" style="margin-top:10px"><button type="button" class="btn btn-primary">{}</button><button type="button" class="btn btn-ghost">{}</button></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><button type="button" class="btn btn-primary">{}</button></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><button type="button" class="btn btn-secondary">{}</button><div style="margin-top:12px"><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="rebuild-autos"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-ghost">{}</button></form></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><div class="settings-inline-actions"><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="find-dupes"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-secondary">{}</button></form><form method="post" action="/act" style="display:contents"><input type="hidden" name="action" value="merge-dupes"><input type="hidden" name="back" value="{back}"><button type="submit" class="btn btn-primary">{}</button></form></div></div><div class="settings-section"><h3 style="margin-bottom:8px">{}</h3><p class="field-hint" style="margin-bottom:12px">{}</p><form method="post" action="/act"><input type="hidden" name="action" value="set"><input type="hidden" name="field" value="listenbrainz"><input type="hidden" name="value" value="{lb}"><input type="hidden" name="back" value="{back}"><label class="ui-toggle"><input type="checkbox" class="ui-toggle-input" {checked} onchange="this.form.value.value=this.checked?'1':'0';this.form.submit()"><span class="ui-toggle-track" aria-hidden="true"><span class="ui-toggle-thumb"></span></span><span class="ui-toggle-label">ListenBrainz</span></label></form></div></div>"#,
        esc(&i18n.t("tools.updates")),
        esc(&i18n.t("tools.updatesHint")),
        esc(&i18n.tf("tools.currentVersion", &[("version", "1.2.0")])),
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
