//! The Electron wishlist download: search YouTube with the user's yt-dlp, then save audio.
//! Same program and the same arguments as electron/youtubeImportService.cjs.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

const MISSING: &str = "yt-dlp не найден. Откройте Настройки и укажите путь, например: D:\\yt-dlp\\yt-dlp.exe (можно указать и папку D:\\yt-dlp)";

pub fn download_search(title: &str, artist: &str, configured: &str, proxy: &str, dest_dir: &Path) -> Result<PathBuf, String> {
    let title = title.trim();
    let artist = artist.trim();
    if title.is_empty() && artist.is_empty() {
        return Err("Укажите название и исполнителя".into());
    }
    let query = if artist.is_empty() {
        title.to_string()
    } else if title.is_empty() {
        artist.to_string()
    } else {
        format!("{artist} - {title}")
    };
    if query.chars().count() > 240 {
        return Err("Слишком длинный запрос для поиска".into());
    }
    let bin = resolve_bin(configured).ok_or_else(|| MISSING.to_string())?;
    let video_id = search_id(&bin, &query, proxy)?;
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    download_audio(&bin, &url, &video_id, proxy, dest_dir)
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
    Command::new(bin)
        .arg("--version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

fn search_id(bin: &str, query: &str, proxy: &str) -> Result<String, String> {
    let mut args = vec![
        "--no-playlist".into(),
        "--ignore-config".into(),
        "--flat-playlist".into(),
        "--extractor-args".into(),
        "youtube:player_client=android,web".into(),
        "--print".into(),
        "id".into(),
        "--socket-timeout".into(),
        "30".into(),
        "--retries".into(),
        "3".into(),
    ];
    push_proxy(&mut args, proxy);
    args.push("--".into());
    args.push(format!("ytsearch1:{query}"));
    let output = run(bin, &args, None, Duration::from_secs(45))?;
    output
        .lines()
        .map(str::trim)
        .find(|line| line.len() >= 6 && line.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'))
        .map(str::to_string)
        .ok_or_else(|| "Не удалось найти видео на YouTube".into())
}

fn download_audio(bin: &str, url: &str, video_id: &str, proxy: &str, dest_dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dest_dir).map_err(|err| err.to_string())?;
    if let Some(existing) = find_download(dest_dir, video_id) {
        return Ok(existing);
    }
    let template = dest_dir.join(format!("{video_id}.%(ext)s"));
    let mut args = vec![
        "--no-playlist".into(),
        "--ignore-config".into(),
        "-f".into(),
        "bestaudio/best".into(),
        "--extractor-args".into(),
        "youtube:player_client=android,web".into(),
        "--socket-timeout".into(),
        "30".into(),
        "--retries".into(),
        "5".into(),
        "--fragment-retries".into(),
        "5".into(),
        "--no-mtime".into(),
        "--newline".into(),
        "--progress".into(),
        "-o".into(),
        template.to_string_lossy().into_owned(),
    ];
    push_proxy(&mut args, proxy);
    args.push("--".into());
    args.push(url.to_string());
    let _ = run(bin, &args, Some(dest_dir), Duration::from_secs(15 * 60))?;
    find_download(dest_dir, video_id).ok_or_else(|| "yt-dlp завершился без файла".into())
}

fn push_proxy(args: &mut Vec<String>, proxy: &str) {
    let proxy = proxy.trim();
    if !proxy.is_empty() {
        args.push("--proxy".into());
        args.push(proxy.to_string());
    }
}

fn run(bin: &str, args: &[String], cwd: Option<&Path>, timeout: Duration) -> Result<String, String> {
    let mut command = Command::new(bin);
    command.args(args);
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    let mut child = command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| err.to_string())?;
    let started = std::time::Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|err| err.to_string())? {
            let mut stdout = String::new();
            if let Some(mut pipe) = child.stdout.take() {
                use std::io::Read;
                let _ = pipe.read_to_string(&mut stdout);
            }
            if status.success() || !stdout.trim().is_empty() {
                return Ok(stdout);
            }
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stderr.take() {
                use std::io::Read;
                let _ = pipe.read_to_string(&mut stderr);
            }
            let detail = stderr.trim();
            return Err(if detail.is_empty() {
                format!("yt-dlp завершился с кодом {}", status.code().unwrap_or(1))
            } else {
                detail.chars().take(400).collect()
            });
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            return Err("Превышено время ожидания скачивания (15 мин)".into());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn find_download(dir: &Path, video_id: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    entries.filter_map(|entry| entry.ok()).map(|entry| entry.path()).find(|path| {
        path.file_stem().and_then(|stem| stem.to_str()) == Some(video_id) && path.is_file()
    })
}
