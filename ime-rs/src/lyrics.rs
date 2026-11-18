//! Lyrics that already exist for a track: a saved file, a sidecar, or tags.
//! Nothing here writes a line that was not in one of those sources.

use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct LyricLine {
    pub time: f64,
    pub text: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Lyrics {
    pub lines: Vec<LyricLine>,
    pub synced: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    pub empty: bool,
}

impl Lyrics {
    pub fn none() -> Self {
        Self {
            lines: Vec::new(),
            synced: false,
            source: None,
            empty: true,
        }
    }
}

/// Library file, then `.lrc` / `.txt` beside the audio, then embedded tags.
pub fn load(id: &str, file_path: &str, data_dir: &Path) -> Lyrics {
    if let Some(path) = library_file(data_dir, id) {
        if let Some(text) = read_text(&path) {
            if let Some(lyrics) = accept(&text, "library") {
                return lyrics;
            }
        }
    }
    if !file_path.is_empty() {
        let path = Path::new(file_path);
        for sidecar in sidecars(path) {
            if let Some(text) = read_text(&sidecar) {
                let name = sidecar
                    .file_name()
                    .and_then(|item| item.to_str())
                    .unwrap_or("lyrics");
                if let Some(lyrics) = accept(&text, name) {
                    return lyrics;
                }
            }
        }
        if let Some(lyrics) = embedded(path) {
            return lyrics;
        }
    }
    Lyrics::none()
}

pub fn parse_lrc_or_text(raw: &str) -> (Vec<LyricLine>, bool) {
    let text = raw.trim_start_matches('\u{feff}');
    let mut lines = Vec::new();
    let mut had_stamp = false;
    for row in text.split('\n') {
        let trimmed = row.trim().trim_end_matches('\r');
        if trimmed.is_empty() || is_meta(trimmed) {
            continue;
        }
        let stamps = timestamps(trimmed);
        if stamps.is_empty() {
            if !trimmed.starts_with('[') {
                lines.push(LyricLine {
                    time: lines.len() as f64 * 0.01,
                    text: trimmed.to_string(),
                });
            }
            continue;
        }
        let lyric = lyric_text(trimmed);
        if lyric.is_empty() {
            continue;
        }
        had_stamp = true;
        for time in stamps {
            lines.push(LyricLine {
                time,
                text: lyric.clone(),
            });
        }
    }
    lines.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    let synced = had_stamp && !lines.is_empty();
    (lines, synced)
}

fn accept(raw: &str, source: &str) -> Option<Lyrics> {
    let (lines, synced) = parse_lrc_or_text(raw);
    if lines.is_empty() {
        return None;
    }
    Some(Lyrics {
        lines,
        synced,
        source: Some(source.to_string()),
        empty: false,
    })
}

fn is_meta(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    [
        "[ti:", "[ar:", "[al:", "[by:", "[offset:", "[id:", "[length:", "[tool:", "[ve:", "[re:", "[la:",
    ]
    .iter()
    .any(|prefix| lower.starts_with(prefix))
}

fn timestamps(line: &str) -> Vec<f64> {
    let bytes = line.as_bytes();
    let mut times = Vec::new();
    let mut i = 0;
    while i < bytes.len() && bytes[i] == b'[' {
        let Some(end) = line[i + 1..].find(']') else {
            break;
        };
        let body = &line[i + 1..i + 1 + end];
        let Some(time) = parse_stamp(body) else {
            break;
        };
        times.push(time);
        i += end + 2;
    }
    times
}

fn lyric_text(line: &str) -> String {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i] == b'[' {
        let Some(end) = line[i + 1..].find(']') else {
            break;
        };
        let body = &line[i + 1..i + 1 + end];
        if parse_stamp(body).is_none() {
            break;
        }
        i += end + 2;
    }
    line[i..].trim().to_string()
}

fn parse_stamp(body: &str) -> Option<f64> {
    let (min, rest) = body.split_once(':')?;
    if min.is_empty() || min.len() > 2 || !min.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let (sec, frac) = if let Some((sec, frac)) = rest.split_once(['.', ':']) {
        (sec, frac)
    } else {
        (rest, "")
    };
    if sec.len() != 2 || !sec.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if !frac.is_empty() && (frac.len() > 3 || !frac.chars().all(|c| c.is_ascii_digit())) {
        return None;
    }
    let minutes: f64 = min.parse().ok()?;
    let seconds: f64 = sec.parse().ok()?;
    if seconds >= 60.0 {
        return None;
    }
    let fraction = if frac.is_empty() {
        0.0
    } else {
        let n: f64 = frac.parse().ok()?;
        n / 10f64.powi(frac.len() as i32)
    };
    Some(minutes * 60.0 + seconds + fraction)
}

fn library_file(data_dir: &Path, id: &str) -> Option<PathBuf> {
    if id.is_empty() || id.len() > 80 {
        return None;
    }
    if !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') {
        return None;
    }
    Some(data_dir.join("lyrics").join(format!("{id}.txt")))
}

fn sidecars(path: &Path) -> Vec<PathBuf> {
    let Some(parent) = path.parent() else {
        return Vec::new();
    };
    let Some(stem) = path.file_stem().and_then(|item| item.to_str()) else {
        return Vec::new();
    };
    [".lrc", ".LRC", ".txt"]
        .into_iter()
        .map(|ext| parent.join(format!("{stem}{ext}")))
        .collect()
}

fn read_text(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut buf = Vec::new();
    file.take(1_000_000).read_to_end(&mut buf).ok()?;
    let text = if buf.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = buf[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .take_while(|unit| *unit != 0)
            .collect();
        String::from_utf16_lossy(&units)
    } else if buf.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = buf[2..]
            .chunks_exact(2)
            .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
            .take_while(|unit| *unit != 0)
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(&buf).into_owned()
    };
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

fn embedded(path: &Path) -> Option<Lyrics> {
    let bytes = read_prefix(path, 2_000_000)?;
    if bytes.starts_with(b"ID3") {
        return id3_lyrics(&bytes);
    }
    if bytes.starts_with(b"fLaC") {
        return flac_lyrics(&bytes);
    }
    None
}

fn read_prefix(path: &Path, max: u64) -> Option<Vec<u8>> {
    let file = File::open(path).ok()?;
    let mut buf = Vec::new();
    file.take(max).read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn id3_lyrics(bytes: &[u8]) -> Option<Lyrics> {
    if bytes.len() < 10 || &bytes[0..3] != b"ID3" {
        return None;
    }
    let version = bytes[3];
    if !(3..=4).contains(&version) {
        return None;
    }
    let flags = bytes[5];
    let size = synchsafe(&bytes[6..10]);
    let end = (10 + size).min(bytes.len());
    let mut body = bytes[10..end].to_vec();
    if flags & 0x80 != 0 {
        body = unsync(&body);
    }
    let start = if flags & 0x40 != 0 {
        if body.len() < 4 {
            return None;
        }
        let ext = if version >= 4 {
            4 + synchsafe(&body[..4])
        } else {
            u32::from_be_bytes([body[0], body[1], body[2], body[3]]) as usize
        };
        if ext > body.len() {
            return None;
        }
        ext
    } else {
        0
    };
    id3_frames(version, &body[start..])
}

fn id3_frames(version: u8, buf: &[u8]) -> Option<Lyrics> {
    let mut synced: Option<Vec<LyricLine>> = None;
    let mut plain: Option<String> = None;
    let mut i = 0;
    while i + 10 <= buf.len() {
        let id = &buf[i..i + 4];
        if id.iter().all(|byte| *byte == 0) {
            break;
        }
        if !id.iter().all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit()) {
            break;
        }
        let frame_size = if version >= 4 {
            synchsafe(&buf[i + 4..i + 8])
        } else {
            u32::from_be_bytes([buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]]) as usize
        };
        let flags = [buf[i + 8], buf[i + 9]];
        if frame_size == 0 || i + 10 + frame_size > buf.len() {
            break;
        }
        let data = &buf[i + 10..i + 10 + frame_size];
        let skip = if version >= 4 {
            flags[1] & 0x08 != 0 || flags[1] & 0x04 != 0
        } else {
            flags[1] & 0x80 != 0 || flags[1] & 0x40 != 0
        };
        if !skip {
            let mut payload = data.to_vec();
            if version >= 4 && flags[1] & 0x02 != 0 {
                payload = unsync(&payload);
            }
            if version >= 4 && flags[1] & 0x01 != 0 && payload.len() >= 4 {
                payload.drain(0..4);
            }
            if version < 4 && flags[1] & 0x20 != 0 && !payload.is_empty() {
                payload.drain(0..1);
            }
            match id {
                b"SYLT" if synced.is_none() => {
                    if let Some((lines, is_synced)) = sylt_lines(&payload) {
                        if is_synced {
                            synced = Some(lines);
                        } else if plain.is_none() && !lines.is_empty() {
                            plain = Some(lines.into_iter().map(|line| line.text).collect::<Vec<_>>().join("\n"));
                        }
                    }
                }
                b"USLT" if plain.is_none() => {
                    if let Some(text) = uslt_text(&payload) {
                        if !text.trim().is_empty() {
                            plain = Some(text);
                        }
                    }
                }
                _ => {}
            }
        }
        i += 10 + frame_size;
    }
    if let Some(lines) = synced {
        if !lines.is_empty() {
            return Some(Lyrics {
                lines,
                synced: true,
                source: Some("tags".into()),
                empty: false,
            });
        }
    }
    plain.and_then(|text| accept(&text, "tags"))
}

fn uslt_text(data: &[u8]) -> Option<String> {
    if data.len() < 5 {
        return None;
    }
    let enc = data[0];
    let (_, used) = take_terminated(enc, &data[4..])?;
    let text = decode_to_end(enc, &data[4 + used..]);
    let text = text.trim().trim_matches('\0').to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn sylt_lines(data: &[u8]) -> Option<(Vec<LyricLine>, bool)> {
    if data.len() < 6 {
        return None;
    }
    let enc = data[0];
    let format = data[4];
    let (_, used) = take_terminated(enc, &data[6..])?;
    let mut rest = &data[6 + used..];
    let mut lines = Vec::new();
    while !rest.is_empty() {
        let (text, consumed) = take_terminated(enc, rest)?;
        if consumed == 0 || rest.len() < consumed + 4 {
            break;
        }
        let stamp = u32::from_be_bytes([rest[consumed], rest[consumed + 1], rest[consumed + 2], rest[consumed + 3]]);
        let text = text.trim().trim_matches('\0').to_string();
        if !text.is_empty() {
            let time = if format == 2 {
                stamp as f64 / 1000.0
            } else {
                lines.len() as f64 * 0.01
            };
            lines.push(LyricLine { time, text });
        }
        rest = &rest[consumed + 4..];
    }
    if lines.is_empty() {
        None
    } else {
        Some((lines, format == 2))
    }
}

fn take_terminated(enc: u8, data: &[u8]) -> Option<(String, usize)> {
    if enc == 1 || enc == 2 {
        let (skip, be) = utf16_bom(enc, data);
        let mut i = skip;
        while i + 1 < data.len() {
            let unit = utf16_unit(be, &data[i..i + 2]);
            if unit == 0 {
                return Some((utf16_string(be, &data[skip..i]), i + 2));
            }
            i += 2;
        }
        let end = skip + ((data.len() - skip) / 2) * 2;
        return Some((utf16_string(be, &data[skip..end]), data.len()));
    }
    let end = data.iter().position(|byte| *byte == 0).unwrap_or(data.len());
    let text = decode_bytes(enc, &data[..end]);
    let used = if end < data.len() { end + 1 } else { data.len() };
    Some((text, used))
}

fn decode_to_end(enc: u8, data: &[u8]) -> String {
    if enc == 1 || enc == 2 {
        let (skip, be) = utf16_bom(enc, data);
        let end = skip + ((data.len() - skip) / 2) * 2;
        return utf16_string(be, &data[skip..end]).trim_end_matches('\0').to_string();
    }
    let end = data.iter().rposition(|byte| *byte != 0).map(|pos| pos + 1).unwrap_or(0);
    decode_bytes(enc, &data[..end])
}

fn decode_bytes(enc: u8, data: &[u8]) -> String {
    if enc == 0 {
        data.iter().map(|byte| char::from(*byte)).collect()
    } else {
        String::from_utf8_lossy(data).into_owned()
    }
}

fn utf16_bom(enc: u8, data: &[u8]) -> (usize, bool) {
    if enc == 2 {
        return (0, true);
    }
    if data.starts_with(&[0xFE, 0xFF]) {
        (2, true)
    } else if data.starts_with(&[0xFF, 0xFE]) {
        (2, false)
    } else {
        (0, false)
    }
}

fn utf16_unit(be: bool, data: &[u8]) -> u16 {
    if be {
        u16::from_be_bytes([data[0], data[1]])
    } else {
        u16::from_le_bytes([data[0], data[1]])
    }
}

fn utf16_string(be: bool, data: &[u8]) -> String {
    let units: Vec<u16> = data
        .chunks_exact(2)
        .map(|pair| utf16_unit(be, pair))
        .take_while(|unit| *unit != 0)
        .collect();
    String::from_utf16_lossy(&units)
}

fn synchsafe(bytes: &[u8]) -> usize {
    bytes.iter().take(4).fold(0usize, |acc, byte| (acc << 7) | (*byte as usize & 0x7f))
}

fn unsync(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len());
    let mut i = 0;
    while i < data.len() {
        out.push(data[i]);
        if data[i] == 0xFF && i + 1 < data.len() && data[i + 1] == 0x00 {
            i += 2;
        } else {
            i += 1;
        }
    }
    out
}

fn flac_lyrics(bytes: &[u8]) -> Option<Lyrics> {
    if bytes.len() < 8 || &bytes[0..4] != b"fLaC" {
        return None;
    }
    let mut i = 4;
    while i + 4 <= bytes.len() {
        let header = bytes[i];
        let len = u32::from_be_bytes([0, bytes[i + 1], bytes[i + 2], bytes[i + 3]]) as usize;
        let last = header & 0x80 != 0;
        let kind = header & 0x7f;
        let start = i + 4;
        if start + len > bytes.len() {
            break;
        }
        if kind == 4 {
            if let Some(text) = vorbis_lyrics(&bytes[start..start + len]) {
                return accept(&text, "tags");
            }
        }
        i = start + len;
        if last {
            break;
        }
    }
    None
}

fn vorbis_lyrics(block: &[u8]) -> Option<String> {
    if block.len() < 8 {
        return None;
    }
    let vendor = u32::from_le_bytes(block[0..4].try_into().ok()?) as usize;
    let mut i = 4usize.checked_add(vendor)?;
    if i + 4 > block.len() {
        return None;
    }
    let count = u32::from_le_bytes(block[i..i + 4].try_into().ok()?) as usize;
    i += 4;
    let mut found = None;
    for _ in 0..count {
        if i + 4 > block.len() {
            break;
        }
        let len = u32::from_le_bytes(block[i..i + 4].try_into().ok()?) as usize;
        i += 4;
        if len > block.len().saturating_sub(i) {
            break;
        }
        let comment = String::from_utf8_lossy(&block[i..i + len]);
        i += len;
        if let Some((key, value)) = comment.split_once('=') {
            if is_lyrics_key(key) && !value.trim().is_empty() {
                found = Some(value.trim().to_string());
            }
        }
    }
    found
}

fn is_lyrics_key(key: &str) -> bool {
    key.eq_ignore_ascii_case("LYRICS")
        || key.eq_ignore_ascii_case("UNSYNCEDLYRICS")
        || key.eq_ignore_ascii_case("SYNCEDLYRICS")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn lrc_keeps_the_file_text_and_times() {
        let (lines, synced) = parse_lrc_or_text("[ar:Кто-то]\n[ti:Двор]\n[00:01.50]Тихий двор\n[00:03.00]Жёлтый свет\n");
        assert!(synced);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "Тихий двор");
        assert!((lines[0].time - 1.5).abs() < 0.001);
        assert_eq!(lines[1].text, "Жёлтый свет");
        assert!((lines[1].time - 3.0).abs() < 0.001);
    }

    #[test]
    fn plain_text_is_not_treated_as_synced() {
        let (lines, synced) = parse_lrc_or_text("Первая\nВторая\n");
        assert!(!synced);
        assert_eq!(lines.iter().map(|line| line.text.as_str()).collect::<Vec<_>>(), ["Первая", "Вторая"]);
    }

    #[test]
    fn metadata_only_is_empty() {
        let (lines, synced) = parse_lrc_or_text("[ar:Никто]\n[ti:Пусто]\n");
        assert!(lines.is_empty());
        assert!(!synced);
    }

    #[test]
    fn library_file_wins_and_a_missing_track_stays_empty() {
        let dir = std::env::temp_dir().join(format!("ime-lyrics-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("lyrics")).unwrap();
        let audio = dir.join("song.wav");
        fs::write(&audio, b"RIFF$\x00\x00\x00WAVEfmt ").unwrap();
        fs::write(dir.join("song.lrc"), "[00:01.00]Соседний файл\n").unwrap();
        fs::write(dir.join("lyrics").join("track-1.txt"), "[00:02.00]Своя запись\n").unwrap();
        let found = load("track-1", audio.to_str().unwrap(), &dir);
        assert!(!found.empty);
        assert_eq!(found.lines[0].text, "Своя запись");
        assert_eq!(found.source.as_deref(), Some("library"));
        let sidecar = load("other", audio.to_str().unwrap(), &dir);
        assert_eq!(sidecar.lines[0].text, "Соседний файл");
        assert_eq!(sidecar.source.as_deref(), Some("song.lrc"));
        let missing = load("absent", "", &dir);
        assert!(missing.empty);
        assert!(missing.lines.is_empty());
        assert!(missing.source.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn id3_uslt_and_sylt_use_only_the_tag_text() {
        let uslt = uslt_frame(3, "Строка из тега");
        let file = tag(3, &uslt);
        let lyrics = id3_lyrics(&file).unwrap();
        assert!(!lyrics.synced);
        assert_eq!(lyrics.lines[0].text, "Строка из тега");
        assert_eq!(lyrics.source.as_deref(), Some("tags"));

        let sylt = sylt_frame(&["Первая строка", "Вторая строка"], &[1500, 3200]);
        let file = tag(4, &sylt);
        let lyrics = id3_lyrics(&file).unwrap();
        assert!(lyrics.synced);
        assert_eq!(lyrics.lines[0].text, "Первая строка");
        assert!((lyrics.lines[0].time - 1.5).abs() < 0.001);
        assert_eq!(lyrics.lines[1].text, "Вторая строка");
        assert!((lyrics.lines[1].time - 3.2).abs() < 0.001);

        let title_only = tag(3, &frame(b"TIT2", 3, &[0, b'N', b'o', b'n', b'e']));
        assert!(id3_lyrics(&title_only).is_none());
    }

    #[test]
    fn flac_comment_is_the_lyrics_and_a_wav_is_not() {
        let lyrics = flac_lyrics(&flac_block("Только эта строка")).unwrap();
        assert_eq!(lyrics.lines[0].text, "Только эта строка");
        assert!(!lyrics.synced);
        let dir = std::env::temp_dir().join(format!("ime-lyrics-wav-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("tone.wav");
        fs::write(&audio, b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00").unwrap();
        let found = load("tone", audio.to_str().unwrap(), &dir);
        assert!(found.empty);
        assert!(found.lines.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    fn synchsafe_encode(n: usize) -> [u8; 4] {
        [
            ((n >> 21) & 0x7f) as u8,
            ((n >> 14) & 0x7f) as u8,
            ((n >> 7) & 0x7f) as u8,
            (n & 0x7f) as u8,
        ]
    }

    fn tag(version: u8, frames: &[u8]) -> Vec<u8> {
        let mut out = vec![b'I', b'D', b'3', version, 0, 0];
        out.extend(synchsafe_encode(frames.len()));
        out.extend(frames);
        out
    }

    fn frame(id: &[u8; 4], version: u8, data: &[u8]) -> Vec<u8> {
        let mut out = id.to_vec();
        if version >= 4 {
            out.extend(synchsafe_encode(data.len()));
        } else {
            out.extend((data.len() as u32).to_be_bytes());
        }
        out.extend([0, 0]);
        out.extend(data);
        out
    }

    fn uslt_frame(version: u8, text: &str) -> Vec<u8> {
        let mut data = vec![3, b'r', b'u', b's', 0];
        data.extend(text.as_bytes());
        frame(b"USLT", version, &data)
    }

    fn sylt_frame(lines: &[&str], times_ms: &[u32]) -> Vec<u8> {
        let mut data = vec![3, b'r', b'u', b's', 2, 1, 0];
        for (text, time) in lines.iter().zip(times_ms) {
            data.extend(text.as_bytes());
            data.push(0);
            data.extend(time.to_be_bytes());
        }
        frame(b"SYLT", 4, &data)
    }

    fn flac_block(text: &str) -> Vec<u8> {
        let vendor = b"ime";
        let comment = format!("LYRICS={text}");
        let mut block: Vec<u8> = Vec::new();
        block.extend(&(vendor.len() as u32).to_le_bytes());
        block.extend(vendor);
        block.extend(&1u32.to_le_bytes());
        block.extend(&(comment.len() as u32).to_le_bytes());
        block.extend(comment.as_bytes());
        let mut file = b"fLaC".to_vec();
        file.push(0x80 | 4);
        let len = block.len() as u32;
        file.push((len >> 16) as u8);
        file.push((len >> 8) as u8);
        file.push(len as u8);
        file.extend(block);
        file
    }
}
