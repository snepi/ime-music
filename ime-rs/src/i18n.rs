use std::collections::HashMap;
use std::path::Path;

pub struct I18n {
    map: HashMap<String, String>,
}

impl I18n {
    pub fn load(dir: &Path, locale: &str) -> Self {
        let code = match locale {
            "en" | "zh" | "hi" | "es" | "fr" | "uk" | "ru" => locale,
            _ => "ru",
        };
        let path = dir.join(format!("{code}.json"));
        let fallback = dir.join("ru.json");
        let raw = std::fs::read_to_string(&path)
            .or_else(|_| std::fs::read_to_string(&fallback))
            .unwrap_or_else(|_| "{}".into());
        let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
        let mut map = HashMap::new();
        if let Some(obj) = value.as_object() {
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    map.insert(k.clone(), s.to_string());
                }
            }
        }
        Self { map }
    }

    pub fn t(&self, key: &str) -> String {
        self.map.get(key).cloned().unwrap_or_else(|| key.to_string())
    }

    pub fn tf(&self, key: &str, vars: &[(&str, &str)]) -> String {
        let mut s = self.t(key);
        for (k, v) in vars {
            s = s.replace(&format!("{{{k}}}"), v);
        }
        s
    }
}

pub fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}
