//! UI files compiled into the binary so a portable exe can run alone.

const FILES: &[(&str, &[u8])] = &[
    ("index.css", include_bytes!("../static/index.css")),
    ("player.js", include_bytes!("../static/player.js")),
    ("favicon.png", include_bytes!("../static/favicon.png")),
    ("brand/icon.png", include_bytes!("../static/brand/icon.png")),
    ("brand/wordmark.png", include_bytes!("../static/brand/wordmark.png")),
    ("brand/favicon.png", include_bytes!("../static/brand/favicon.png")),
    ("i18n/en.json", include_bytes!("../static/i18n/en.json")),
    ("i18n/es.json", include_bytes!("../static/i18n/es.json")),
    ("i18n/fr.json", include_bytes!("../static/i18n/fr.json")),
    ("i18n/hi.json", include_bytes!("../static/i18n/hi.json")),
    ("i18n/ru.json", include_bytes!("../static/i18n/ru.json")),
    ("i18n/uk.json", include_bytes!("../static/i18n/uk.json")),
    ("i18n/zh.json", include_bytes!("../static/i18n/zh.json")),
];

/// Write bundled UI files next to the exe. Always refresh them so an updated
/// exe does not keep a stale player.js from the previous version.
pub fn ensure_static(dir: &std::path::Path) {
    for (rel, bytes) in FILES {
        let path = dir.join(rel);
        if path.is_file() && std::fs::read(&path).ok().as_deref() == Some(*bytes) {
            continue;
        }
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, bytes);
    }
}
