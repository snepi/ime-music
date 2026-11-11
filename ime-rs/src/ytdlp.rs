//! The Electron wishlist download: search YouTube with the user's yt-dlp, then save audio.
//! Same program and the same arguments as electron/youtubeImportService.cjs.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

fn hidden(bin: &str) -> Command {
    let mut command = Command::new(bin);
    // Electron's ytDlpSpawnEnv. Without this, a Cyrillic query is mojibake on Windows
    // and yt-dlp returns nothing, which used to be reported as a missing proxy.
    command.env("PYTHONUTF8", "1");
    command.env("PYTHONIOENCODING", "utf-8");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW. Electron spawns yt-dlp with windowsHide so no console appears.
        command.creation_flags(0x0800_0000);
    }
    command
}

const MISSING: &str = "yt-dlp не найден. Откройте Настройки и укажите путь, например: D:\\yt-dlp\\yt-dlp.exe (можно указать и папку D:\\yt-dlp)";

pub fn download_search(
    title: &str,
    artist: &str,
    configured: &str,
    proxy: &str,
    dest_dir: &Path,
    report: &mut dyn FnMut(&str, Option<u8>),
) -> Result<PathBuf, String> {
    let title = title.trim();
    let artist = artist.trim();
    if title.is_empty() && artist.is_empty() {
        return Err("Укажите название и исполнителя".into());
    }
    let label = if artist.is_empty() {
        title.to_string()
    } else if title.is_empty() {
        artist.to_string()
    } else {
        format!("{artist} — {title}")
    };
    if label.chars().count() > 240 {
        return Err("Слишком длинный запрос для поиска".into());
    }
    let bin = resolve_bin(configured).ok_or_else(|| MISSING.to_string())?;
    report(&format!("Поиск: {label}"), None);
    let ids = resolve_videos(&bin, title, artist, proxy, report)?;
    let mut last_error = String::new();
    for video_id in ids {
        let url = format!("https://www.youtube.com/watch?v={video_id}");
        report(&format!("Скачивание: {label}"), Some(0));
        match download_audio(&bin, &url, &video_id, proxy, dest_dir, &label, report) {
            Ok(path) => return Ok(path),
            Err(err) => last_error = err,
        }
    }
    Err(if last_error.is_empty() {
        "yt-dlp завершился без файла".into()
    } else {
        last_error
    })
}

#[derive(Clone, Debug)]
pub struct ListedHit {
    pub id: String,
    pub title: String,
    pub duration: f64,
    pub channel: String,
}

/// The same YouTube search the download uses, returned as a list the listener can play and pick from.
pub fn list_search(title: &str, artist: &str, configured: &str, proxy: &str) -> Result<Vec<ListedHit>, String> {
    let bin = resolve_bin(configured).ok_or_else(|| MISSING.to_string())?;
    let mut hits = Vec::new();
    let mut last_error = String::new();
    for query in search_queries(title, artist) {
        match search_hits(&bin, &query, proxy) {
            Ok(found) => {
                for hit in found {
                    if hits.iter().any(|item: &ListedHit| item.id == hit.id) {
                        continue;
                    }
                    hits.push(ListedHit {
                        id: hit.id,
                        title: hit.title,
                        duration: hit.duration,
                        channel: hit.channel,
                    });
                }
                if hits.len() >= 8 {
                    break;
                }
            }
            Err(err) => last_error = err,
        }
    }
    if hits.is_empty() {
        return Err(if last_error.is_empty() {
            "Не удалось найти видео на YouTube".into()
        } else {
            last_error
        });
    }
    Ok(hits)
}

/// Download one chosen video with the same yt-dlp audio path as a wishlist download.
pub fn download_id(video_id: &str, label: &str, configured: &str, proxy: &str, dest_dir: &Path) -> Result<PathBuf, String> {
    let video_id = video_id.trim();
    if video_id.len() < 6 || !video_id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') {
        return Err("Некорректное видео".into());
    }
    let bin = resolve_bin(configured).ok_or_else(|| MISSING.to_string())?;
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    download_audio(&bin, &url, video_id, proxy, dest_dir, label, &mut |_, _| {})
}

/// A direct audio URL so a search hit can be heard before it replaces the file.
pub fn preview_url(video_id: &str, configured: &str, proxy: &str) -> Result<String, String> {
    let video_id = video_id.trim();
    if video_id.is_empty() {
        return Err("Некорректное видео".into());
    }
    let bin = resolve_bin(configured).ok_or_else(|| MISSING.to_string())?;
    let mut args = vec![
        "--no-playlist".into(),
        "--ignore-config".into(),
        "-g".into(),
        "-f".into(),
        "bestaudio[protocol!*=m3u8]/bestaudio/best".into(),
        "--socket-timeout".into(),
        "20".into(),
        "--no-warnings".into(),
    ];
    if let Some(runtime) = js_runtime() {
        args.push("--js-runtimes".into());
        args.push(runtime);
        args.push("--remote-components".into());
        args.push("ejs:github".into());
    }
    push_proxy(&mut args, proxy);
    args.push("--".into());
    args.push(format!("https://www.youtube.com/watch?v={video_id}"));
    let (stdout, stderr, ok) = run(&bin, &args, None, Duration::from_secs(45), &mut |_, _| {})?;
    if let Some(url) = stdout.lines().map(str::trim).find(|line| line.starts_with("http")) {
        return Ok(url.to_string());
    }
    Err(friendly_error(&stderr, &stdout, !ok))
}

fn resolve_bin(configured: &str) -> Option<String> {
    let mut candidates = Vec::new();
    let trimmed = configured.trim();
    if !trimmed.is_empty() {
        candidates.push(trimmed.to_string());
        let path = Path::new(trimmed);
        if path.is_dir() {
            candidates.push(path.join("yt-dlp.exe").to_string_lossy().into_owned());
            candidates.push(path.join("yt-dlp").to_string_lossy().into_owned());
        } else if path.extension().is_none() {
            candidates.push(format!("{trimmed}.exe"));
        }
    }
    candidates.push("yt-dlp".into());
    candidates.push("yt-dlp.exe".into());
    candidates.into_iter().find(|bin| version_ok(bin))
}

fn version_ok(bin: &str) -> bool {
    hidden(bin)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

struct Hit {
    id: String,
    title: String,
    duration: f64,
    channel: String,
}

fn loosen(text: &str) -> String {
    let mut out = String::new();
    for ch in text.chars() {
        if matches!(ch, '(' | ')' | '[' | ']' | '{' | '}' | '"' | '«' | '»') {
            out.push(' ');
        } else {
            out.push(ch);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn search_queries(title: &str, artist: &str) -> Vec<String> {
    let loose = loosen(title);
    let mut queries = Vec::new();
    if !artist.is_empty() && !loose.is_empty() {
        // Parentheses in "Толпы (Speed Up)" make some yt-dlp builds return no rows.
        queries.push(format!("{artist} - {loose}"));
        queries.push(format!("{artist} {loose}"));
        if loose != title.trim() {
            queries.push(format!("{artist} - {title}"));
        }
        queries.push(format!("{loose} {artist}"));
    } else if !title.is_empty() {
        if loose != title.trim() {
            queries.push(title.trim().to_string());
        }
        queries.push(loose);
    } else if !artist.is_empty() {
        queries.push(artist.to_string());
    }
    let mut unique = Vec::new();
    for query in queries {
        if !unique.iter().any(|item: &String| item == &query) {
            unique.push(query);
        }
    }
    unique
}

fn resolve_videos(
    bin: &str,
    title: &str,
    artist: &str,
    proxy: &str,
    report: &mut dyn FnMut(&str, Option<u8>),
) -> Result<Vec<String>, String> {
    let mut ranked: Vec<(Hit, i32)> = Vec::new();
    let mut last_error = String::new();
    for query in search_queries(title, artist) {
        report(&format!("Поиск: {query}"), None);
        match search_hits(bin, &query, proxy) {
            Ok(hits) => {
                for hit in hits {
                    let score = score_hit(&hit, title, artist);
                    if score < 30 {
                        continue;
                    }
                    if let Some(existing) = ranked.iter_mut().find(|(item, _)| item.id == hit.id) {
                        if score > existing.1 {
                            *existing = (hit, score);
                        }
                    } else {
                        ranked.push((hit, score));
                    }
                }
                if ranked.iter().any(|(_, score)| *score >= 90) {
                    break;
                }
            }
            Err(err) => last_error = err,
        }
    }
    ranked.sort_by(|left, right| right.1.cmp(&left.1));
    // Two ids, not a long list. A burst of player requests is what makes YouTube answer with a bot check.
    let ids: Vec<String> = ranked.into_iter().take(2).map(|(hit, _)| hit.id).collect();
    if !ids.is_empty() {
        return Ok(ids);
    }
    if last_error.is_empty() {
        Err("Не удалось найти видео на YouTube".into())
    } else {
        Err(last_error)
    }
}

fn search_hits(bin: &str, query: &str, proxy: &str) -> Result<Vec<Hit>, String> {
    let runtime = js_runtime();
    // JSON is UTF-8. `--print` on Windows yt-dlp.exe is often cp1251, and a
    // Cyrillic title then looks like an empty result. android,web is Electron's
    // search client; when it prints nothing, the default client still returns rows.
    let mut attempts = vec![search_args(true, None)];
    attempts.push(search_args(false, runtime.as_deref()));
    let mut last_error = String::new();
    for mut args in attempts {
        push_proxy(&mut args, proxy);
        args.push("--".into());
        args.push(format!("ytsearch8:{query}"));
        let (stdout, stderr, ok) = run(bin, &args, None, Duration::from_secs(60), &mut |_, _| {})?;
        let hits = parse_hits(&stdout);
        if !hits.is_empty() {
            return Ok(hits);
        }
        last_error = friendly_error(&stderr, &stdout, !ok);
    }
    Err(if last_error.is_empty() {
        "yt-dlp не вернул данные".into()
    } else {
        last_error
    })
}

fn search_args(android_client: bool, runtime: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "--no-playlist".into(),
        "--ignore-config".into(),
        "--flat-playlist".into(),
        "-J".into(),
        "--socket-timeout".into(),
        "30".into(),
        "--retries".into(),
        "3".into(),
    ];
    if android_client {
        args.push("--extractor-args".into());
        args.push("youtube:player_client=android,web".into());
    } else if let Some(runtime) = runtime {
        args.push("--js-runtimes".into());
        args.push(runtime.into());
        args.push("--remote-components".into());
        args.push("ejs:github".into());
    }
    args
}

fn parse_hits(stdout: &str) -> Vec<Hit> {
    let trimmed = stdout.trim();
    if let Some(start) = trimmed.find('{') {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&trimmed[start..]) {
            let entries = value
                .get("entries")
                .and_then(|entry| entry.as_array())
                .cloned()
                .unwrap_or_else(|| vec![value]);
            let hits: Vec<Hit> = entries.iter().filter_map(hit_from_json).collect();
            if !hits.is_empty() {
                return hits;
            }
        }
    }
    let mut hits = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.trim().split("||").collect();
        let Some(hit) = hit_from_parts(
            parts.first().copied().unwrap_or(""),
            parts.get(1).copied().unwrap_or(""),
            parts.get(2).and_then(|value| value.trim().parse().ok()).unwrap_or(0.0),
            parts.get(3).copied().filter(|value| !value.trim().is_empty()).or_else(|| parts.get(4).copied()).unwrap_or(""),
        ) else {
            continue;
        };
        hits.push(hit);
    }
    hits
}

fn hit_from_json(value: &serde_json::Value) -> Option<Hit> {
    hit_from_parts(
        value.get("id").and_then(|item| item.as_str()).unwrap_or(""),
        value.get("title").and_then(|item| item.as_str()).unwrap_or(""),
        value.get("duration").and_then(|item| item.as_f64()).unwrap_or(0.0),
        value
            .get("channel")
            .and_then(|item| item.as_str())
            .filter(|item| !item.is_empty())
            .or_else(|| value.get("uploader").and_then(|item| item.as_str()))
            .unwrap_or(""),
    )
}

fn hit_from_parts(id: &str, title: &str, duration: f64, channel: &str) -> Option<Hit> {
    let id = id.trim();
    if id.len() < 6 || !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') {
        return None;
    }
    Some(Hit {
        id: id.to_string(),
        title: title.trim().to_string(),
        duration,
        channel: channel.trim().to_string(),
    })
}

fn score_hit(hit: &Hit, title: &str, artist: &str) -> i32 {
    let result = loosen(&hit.title).to_lowercase();
    let channel = loosen(&hit.channel).to_lowercase();
    let title = loosen(title).to_lowercase();
    let artist = loosen(artist).to_lowercase();
    if result.is_empty() {
        return -999;
    }
    let mut score = 18;
    if !title.is_empty() && (result.contains(title.trim()) || channel.contains(title.trim())) {
        score += 48;
    }
    if !artist.is_empty() && (result.contains(artist.trim()) || channel.contains(artist.trim())) {
        score += 40;
    } else if !artist.is_empty() {
        score -= 24;
    }
    if result.contains("official audio") {
        score += 28;
    }
    if channel.contains("topic") || channel.contains("vevo") {
        score += 24;
    }
    for (needle, penalty) in [
        ("karaoke", 55),
        ("nightcore", 50),
        ("slowed", 45),
        ("reverb", 45),
        ("reaction", 55),
        ("tutorial", 50),
        ("full album", 45),
    ] {
        if result.contains(needle) && !title.contains(needle) {
            score -= penalty;
        }
    }
    if hit.duration >= 80.0 && hit.duration <= 540.0 {
        score += 16;
    } else if hit.duration > 0.0 && hit.duration < 40.0 {
        score -= 35;
    } else if hit.duration > 900.0 {
        score -= 45;
    }
    score
}

fn friendly_error(stderr: &str, stdout: &str, failed: bool) -> String {
    let text = format!("{stderr}\n{stdout}");
    let lower = text.to_lowercase();
    if text.trim().is_empty() {
        return "yt-dlp не вернул данные".into();
    }
    if lower.contains("sign in") || lower.contains("not a bot") || lower.contains("video unavailable") || lower.contains("private video") {
        return "YouTube не отдал видео. Обновите yt-dlp.".into();
    }
    if text.contains("403") || lower.contains("file is empty") || lower.contains("requested format is not available") {
        return "yt-dlp не смог сохранить аудиопоток. Обновите yt-dlp.".into();
    }
    if text.contains("Connection aborted") || text.contains("10054") || text.contains("ConnectionReset") {
        return "Не удалось подключиться к YouTube.".into();
    }
    if lower.contains("timed out") {
        return "YouTube не ответил вовремя.".into();
    }
    if !failed {
        return "Не удалось найти видео на YouTube".into();
    }
    text.lines()
        .find(|line| {
            let line = line.trim();
            !line.is_empty() && !line.starts_with('[') && !line.starts_with("WARNING")
        })
        .unwrap_or("Не удалось скачать аудио")
        .chars()
        .take(240)
        .collect()
}

fn download_audio(
    bin: &str,
    url: &str,
    video_id: &str,
    proxy: &str,
    dest_dir: &Path,
    label: &str,
    report: &mut dyn FnMut(&str, Option<u8>),
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dest_dir).map_err(|err| err.to_string())?;
    if let Some(existing) = find_download(dest_dir, video_id) {
        return Ok(existing);
    }
    let template = dest_dir.join(format!("{video_id}.%(ext)s")).to_string_lossy().into_owned();
    let runtime = js_runtime();
    // android,web is what Electron sends, and it still finds the search hit.
    // On current yt-dlp that client answers "Sign in to confirm you're not a bot"
    // and writes no file. The download that saves uses the default clients plus
    // the JS challenge solver (`--remote-components ejs:github`).
    let mut attempts = Vec::new();
    if let Some(runtime) = runtime.clone() {
        // This is the invocation that writes a file: default clients plus the JS challenge solver.
        // Forcing android,web first makes current yt-dlp stop on a bot check and print nothing useful.
        attempts.push(download_args(&template, "bestaudio[protocol!*=m3u8]/bestaudio/best", None, Some(&runtime)));
    }
    attempts.push(download_args(&template, "bestaudio/best", Some("youtube:player_client=android,web"), None));
    let mut last_error = String::new();
    for mut args in attempts {
        push_proxy(&mut args, proxy);
        args.push("--".into());
        args.push(url.to_string());
        let (stdout, stderr, ok) = run(bin, &args, Some(dest_dir), Duration::from_secs(15 * 60), &mut |line, percent| {
            if let Some(percent) = percent {
                report(&format!("Скачивание: {label} · {percent}%"), Some(percent));
            } else if !line.is_empty() {
                report(&format!("Скачивание: {label}"), None);
            }
        })?;
        if let Some(path) = find_download(dest_dir, video_id) {
            return Ok(path);
        }
        remove_incomplete(dest_dir, video_id);
        last_error = if ok && stderr.trim().is_empty() && stdout.trim().is_empty() {
            "yt-dlp завершился без файла".into()
        } else {
            friendly_error(&stderr, &stdout, true)
        };
    }
    Err(if last_error.is_empty() {
        "yt-dlp завершился без файла".into()
    } else {
        last_error
    })
}

fn download_args(template: &str, format: &str, client: Option<&str>, runtime: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "--no-playlist".into(),
        "--ignore-config".into(),
        "-f".into(),
        format.into(),
        "--socket-timeout".into(),
        "30".into(),
        "--retries".into(),
        "3".into(),
        "--fragment-retries".into(),
        "2".into(),
        "--no-mtime".into(),
        "--newline".into(),
        "--progress".into(),
    ];
    if let Some(runtime) = runtime {
        args.push("--js-runtimes".into());
        args.push(runtime.into());
        args.push("--remote-components".into());
        args.push("ejs:github".into());
    }
    if let Some(client) = client {
        args.push("--extractor-args".into());
        args.push(client.into());
    }
    args.push("-o".into());
    args.push(template.into());
    args
}

fn js_runtime() -> Option<String> {
    // Pass the runtime name, not a full path. `--js-runtimes node:C:\...`
    // splits on the first colon and drops the Windows path.
    if command_on_path("node").is_some() && version_ok("node") {
        return Some("node".into());
    }
    if let Some(path) = command_on_path("nodejs") {
        if version_ok("nodejs") {
            return Some(format!("node:{}", path.display()));
        }
    }
    if command_on_path("deno").is_some() && version_ok("deno") {
        return Some("deno".into());
    }
    None
}

fn command_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(target_os = "windows")]
        {
            let exe = dir.join(format!("{name}.exe"));
            if exe.is_file() {
                return Some(exe);
            }
        }
    }
    None
}

fn push_proxy(args: &mut Vec<String>, proxy: &str) {
    let proxy = proxy.trim();
    if !proxy.is_empty() {
        args.push("--proxy".into());
        args.push(proxy.to_string());
    }
}

fn run(
    bin: &str,
    args: &[String],
    cwd: Option<&Path>,
    timeout: Duration,
    on_line: &mut dyn FnMut(&str, Option<u8>),
) -> Result<(String, String, bool), String> {
    let mut command = hidden(bin);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| err.to_string())?;
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();
    let (line_tx, line_rx) = std::sync::mpsc::channel::<String>();
    let stdout_task = std::thread::spawn(move || {
        let mut raw = Vec::new();
        if let Some(mut pipe) = stdout_pipe {
            let _ = pipe.read_to_end(&mut raw);
        }
        // read_to_string drops the whole buffer when a Cyrillic title is cp1251,
        // so a successful search looks like "yt-dlp не вернул данные".
        decode_output(&raw)
    });
    let stderr_task = std::thread::spawn(move || {
        let mut raw = Vec::new();
        if let Some(mut pipe) = stderr_pipe {
            let mut byte = [0u8; 1];
            let mut line = Vec::new();
            while pipe.read(&mut byte).unwrap_or(0) == 1 {
                raw.push(byte[0]);
                if byte[0] == b'\n' || byte[0] == b'\r' {
                    if !line.is_empty() {
                        let _ = line_tx.send(String::from_utf8_lossy(&line).to_string());
                        line.clear();
                    }
                } else {
                    line.push(byte[0]);
                }
            }
            if !line.is_empty() {
                let _ = line_tx.send(String::from_utf8_lossy(&line).to_string());
            }
        }
        decode_output(&raw)
    });
    let started = std::time::Instant::now();
    let status = loop {
        while let Ok(line) = line_rx.try_recv() {
            report_progress(&line, on_line);
        }
        if let Some(status) = child.try_wait().map_err(|err| err.to_string())? {
            break status;
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            let minutes = timeout.as_secs().max(1) / 60;
            return Err(format!("Превышено время ожидания ({minutes} мин)"));
        }
        std::thread::sleep(Duration::from_millis(200));
    };
    while let Ok(line) = line_rx.try_recv() {
        report_progress(&line, on_line);
    }
    let stdout = stdout_task.join().unwrap_or_default();
    let stderr = stderr_task.join().unwrap_or_default();
    Ok((stdout, stderr, status.success()))
}

fn decode_output(raw: &[u8]) -> String {
    if std::str::from_utf8(raw).is_ok() {
        return String::from_utf8_lossy(raw).into_owned();
    }
    let (text, _, _) = encoding_rs::WINDOWS_1251.decode(raw);
    text.into_owned()
}

fn report_progress(line: &str, on_line: &mut dyn FnMut(&str, Option<u8>)) {
    let percent = line.find("[download]").and_then(|start| {
        let rest = line[start + "[download]".len()..].trim();
        let number = rest.split('%').next()?.trim();
        if rest.contains('%') {
            number.parse::<f32>().ok().map(|value| value.round().clamp(0.0, 100.0) as u8)
        } else {
            None
        }
    });
    on_line(line, percent);
}

pub fn save_cover(url: &str, dir: &Path, seed: &str) -> Option<PathBuf> {
    let url = url.trim();
    if !url.starts_with("http") {
        return None;
    }
    let response = ureq::get(url).timeout(Duration::from_secs(12)).call().ok()?;
    let content_type = response.header("content-type").unwrap_or("").to_string();
    let mut bytes = Vec::new();
    response.into_reader().take(5_000_000).read_to_end(&mut bytes).ok()?;
    if bytes.len() < 128 {
        return None;
    }
    let ext = if content_type.contains("png") || url.contains(".png") {
        "png"
    } else if content_type.contains("webp") || url.contains(".webp") {
        "webp"
    } else {
        "jpg"
    };
    std::fs::create_dir_all(dir).ok()?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    use std::hash::{Hash, Hasher};
    url.hash(&mut hasher);
    seed.hash(&mut hasher);
    let path = dir.join(format!("{:x}.{ext}", hasher.finish()));
    if !path.exists() {
        std::fs::write(&path, &bytes).ok()?;
    }
    Some(path)
}

fn find_download(dir: &Path, video_id: &str) -> Option<PathBuf> {
    let prefix = format!("{video_id}.");
    let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
        if name.ends_with(".part") || name.ends_with(".ytdl") || name.ends_with(".temp") {
            continue;
        }
        if !name.starts_with(&prefix) {
            continue;
        }
        let ext = path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_ascii_lowercase();
        if !matches!(
            ext.as_str(),
            "webm" | "m4a" | "mp3" | "opus" | "ogg" | "wav" | "flac" | "aac" | "mp4" | "mkv" | "mov" | "m4b"
        ) {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() || meta.len() < 1024 {
            continue;
        }
        let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if best.as_ref().map(|(_, when)| modified > *when).unwrap_or(true) {
            best = Some((path, modified));
        }
    }
    best.map(|(path, _)| path)
}

fn remove_incomplete(dir: &Path, video_id: &str) {
    let prefix = format!("{video_id}.");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
        if !name.starts_with(&prefix) {
            continue;
        }
        let tiny = entry.metadata().map(|meta| meta.len() < 1024).unwrap_or(true);
        if tiny || name.ends_with(".part") || name.ends_with(".ytdl") {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{decode_output, friendly_error, loosen, parse_hits};

    #[test]
    fn cyrillic_search_output_is_not_dropped() {
        let title: Vec<u8> = vec![0xD2, 0xEE, 0xEB, 0xEF, 0xFB];
        assert_eq!(decode_output(&title), "Толпы");
        let mut line = b"bqk447IzpaU||".to_vec();
        line.extend_from_slice(&title);
        let text = decode_output(&line);
        let hits = parse_hits(&text);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "bqk447IzpaU");
        assert_eq!(hits[0].title, "Толпы");
    }

    #[test]
    fn speed_up_query_keeps_the_words_inside_parentheses() {
        assert_eq!(loosen("Толпы (Speed Up)"), "Толпы Speed Up");
    }

    #[test]
    fn json_search_rows_keep_the_video_id() {
        let stdout = r#"{"entries":[{"id":"bqk447IzpaU","title":"madk1d - Толпы (speed up)","duration":82,"channel":"soyuzmusic"}]}"#;
        let hits = parse_hits(stdout);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "bqk447IzpaU");
        assert_eq!(hits[0].channel, "soyuzmusic");
    }

    #[test]
    fn failures_are_not_described_as_a_missing_proxy() {
        for sample in [
            "",
            "ConnectionResetError: [WinError 10054]",
            "ERROR: unable to download webpage: network is unreachable",
            "ERROR: timed out",
            "ERROR: [youtube] abc: Sign in to confirm you’re not a bot",
        ] {
            let message = friendly_error(sample, "", true);
            let lower = message.to_lowercase();
            assert!(!lower.contains("прокси") && !lower.contains("proxy"), "{message}");
        }
    }
}
