use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
use url::Url;

pub const SITE: &str = "https://simple-share-hazel.vercel.app";
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
    pub url: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Prefs {
    pub profile: String,
    pub always_on_top: bool,
    pub close_to_tray: bool,
    pub reopen_last_room: bool,
    pub sidebar_collapsed: bool,
    pub auto_update: bool,
}
impl Default for Prefs {
    fn default() -> Self {
        Self {
            profile: "720p60".into(),
            always_on_top: true,
            close_to_tray: true,
            reopen_last_room: false,
            sidebar_collapsed: false,
            auto_update: true,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Data {
    pub favorites: Vec<Room>,
    pub recent: Vec<Room>,
    pub prefs: Prefs,
    pub site_preferences: BTreeMap<String, String>,
    pub last_room: String,
}
#[derive(Clone)]
pub struct Profile {
    pub directory: PathBuf,
    pub data: Data,
}
pub fn label(value: &str, limit: usize) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(limit)
        .collect()
}
pub fn room_url(input: &str, origin: &str) -> Result<String, String> {
    let value = input.trim();
    let url = if valid_room(value) {
        Url::parse(&format!("{origin}/?room={value}"))
    } else {
        Url::parse(value)
    }
    .map_err(|_| "Use a SimpleShare invite or room code".to_string())?;
    let expected = Url::parse(origin).map_err(|e| e.to_string())?;
    if url.origin() != expected.origin()
        || url.path() != "/"
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only this SimpleShare website's room links can be saved".into());
    }
    let id = url
        .query_pairs()
        .find(|(k, _)| k == "room")
        .map(|(_, v)| v.to_string())
        .unwrap_or_default();
    if !valid_room(&id) {
        return Err("Invalid room code".into());
    }
    let mut clean = expected;
    clean.set_path("/");
    clean.set_query(None);
    clean.set_fragment(None);
    clean.query_pairs_mut().append_pair("room", &id);
    if url.query_pairs().any(|(k, v)| k == "p2p" && v == "1") {
        clean.query_pairs_mut().append_pair("p2p", "1");
    }
    Ok(clean.to_string())
}
pub fn valid_room(id: &str) -> bool {
    (20..=80).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
pub fn trusted(url: &Url, origin: &str) -> bool {
    Url::parse(origin).is_ok_and(|o| {
        o.origin() == url.origin()
            && url.path() == "/"
            && url.username().is_empty()
            && url.password().is_none()
    })
}
pub fn clean_preference(key: &str, value: &str) -> Option<String> {
    if value.len() > 200 {
        return None;
    }
    match key {
        "simpleshare-name" => {
            let name = label(value, 28);
            (!name.is_empty()).then_some(name)
        }
        "simpleshare-theme" if ["dark", "light"].contains(&value) => Some(value.into()),
        "simpleshare-muted" if ["true", "false"].contains(&value) => Some(value.into()),
        "simpleshare-sfx" if ["on", "off"].contains(&value) => Some(value.into()),
        "simpleshare-volume" | "simpleshare-primary-mix" | "simpleshare-extra-mix" => {
            let max = if key.ends_with("-mix") { 100.0 } else { 1.0 };
            value
                .parse::<f64>()
                .ok()
                .filter(|n| n.is_finite() && *n >= 0.0 && *n <= max)
                .map(|n| n.to_string())
        }
        _ => None,
    }
}
impl Data {
    pub fn sanitize(mut self, origin: &str) -> Self {
        fn rooms(list: Vec<Room>, origin: &str, limit: usize) -> Vec<Room> {
            let mut result = vec![];
            for room in list.into_iter().take(100) {
                if let Ok(url) = room_url(&room.url, origin) {
                    if !result.iter().any(|r: &Room| r.url == url) {
                        result.push(Room {
                            url,
                            name: label(&room.name, 48),
                        });
                    }
                }
                if result.len() >= limit {
                    break;
                }
            }
            result
        }
        self.favorites = rooms(self.favorites, origin, 50);
        self.recent = rooms(self.recent, origin, 8);
        self.site_preferences = self
            .site_preferences
            .into_iter()
            .filter_map(|(k, v)| clean_preference(&k, &v).map(|clean| (k, clean)))
            .collect();
        self.last_room = room_url(&self.last_room, origin).unwrap_or_default();
        if !["720p30", "720p60", "1080p60"].contains(&self.prefs.profile.as_str()) {
            self.prefs.profile = "720p60".into();
        }
        self
    }
}
impl Profile {
    pub fn open(directory: PathBuf, origin: &str) -> Result<Self, String> {
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let file = directory.join("profile.json");
        let data = if file.exists() {
            let parsed = if fs::metadata(&file).map_err(|e| e.to_string())?.len() < 262144 {
                serde_json::from_slice::<Data>(&fs::read(&file).map_err(|e| e.to_string())?).ok()
            } else {
                None
            };
            match parsed {
                Some(data) => data,
                None => {
                    let backup =
                        directory.join(format!("profile-invalid-{}.json", uuid::Uuid::new_v4()));
                    fs::copy(&file, backup).map_err(|e| e.to_string())?;
                    Data::default()
                }
            }
        } else {
            Data::default()
        };
        let mut data = data.sanitize(origin);
        data.site_preferences
            .entry("simpleshare-name".into())
            .or_insert_with(|| {
                format!(
                    "Guest {}",
                    &uuid::Uuid::new_v4().simple().to_string()[..4].to_uppercase()
                )
            });
        let profile = Self { directory, data };
        profile.save()?;
        Ok(profile)
    }
    pub fn save(&self) -> Result<(), String> {
        let temporary = self.directory.join("profile.json.tmp");
        fs::write(
            &temporary,
            serde_json::to_vec_pretty(&self.data).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::rename(temporary, self.directory.join("profile.json")).map_err(|e| e.to_string())
    }
    pub fn preference(&mut self, key: &str, value: &str) -> Result<(), String> {
        let clean = clean_preference(key, value).ok_or("This setting is not allowed")?;
        if self.data.site_preferences.get(key) == Some(&clean) {
            return Ok(());
        }
        let old = self.data.clone();
        self.data.site_preferences.insert(key.into(), clean);
        if let Err(e) = self.save() {
            self.data = old;
            return Err(e);
        }
        Ok(())
    }
    pub fn visit(&mut self, input: &str, origin: &str) -> Result<(), String> {
        let url = room_url(input, origin)?;
        self.data.last_room = url.clone();
        let name = self
            .data
            .favorites
            .iter()
            .find(|r| r.url == url)
            .map(|r| r.name.clone())
            .unwrap_or_else(|| default_name(&url));
        self.data.recent.retain(|r| r.url != url);
        self.data.recent.insert(0, Room { url, name });
        self.data.recent.truncate(8);
        self.save()
    }
    pub fn favorite(
        &mut self,
        input: &str,
        name: Option<&str>,
        origin: &str,
    ) -> Result<(), String> {
        let url = room_url(input, origin)?;
        let name = name
            .map(|n| label(n, 48))
            .filter(|n| !n.is_empty())
            .or_else(|| {
                self.data
                    .favorites
                    .iter()
                    .find(|r| r.url == url)
                    .map(|r| r.name.clone())
            })
            .unwrap_or_else(|| default_name(&url));
        self.data.favorites.retain(|r| r.url != url);
        self.data.favorites.insert(
            0,
            Room {
                url: url.clone(),
                name: name.clone(),
            },
        );
        self.data.favorites.truncate(50);
        for recent in &mut self.data.recent {
            if recent.url == url {
                recent.name = name.clone();
            }
        }
        self.save()
    }
    pub fn import(&mut self, file: &Path, origin: &str) -> Result<(), String> {
        if fs::metadata(file).map_err(|e| e.to_string())?.len() > 262144 {
            return Err("The old profile is too large".into());
        }
        let value: Value = serde_json::from_slice(&fs::read(file).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let imported: Data = serde_json::from_value(value).map_err(|e| e.to_string())?;
        let imported = imported.sanitize(origin);
        for room in imported.favorites.into_iter().rev() {
            self.favorite(&room.url, Some(&room.name), origin)?;
        }
        for (key, value) in imported.site_preferences {
            self.data.site_preferences.insert(key, value);
        }
        self.data.prefs = imported.prefs;
        self.save()
    }
}
pub fn default_name(url: &str) -> String {
    let id = Url::parse(url)
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "room")
                .map(|(_, v)| v.to_string())
        })
        .unwrap_or_default();
    if id.len() >= 8 {
        format!("Room {} · {}", &id[..4], &id[id.len() - 4..])
    } else {
        "Saved room".into()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invites_are_canonical_and_restricted() {
        let id = "abcdef1234567890abcdef12";
        assert_eq!(room_url(id, SITE).unwrap(), format!("{SITE}/?room={id}"));
        assert!(room_url("https://evil.example/?room=abcdef1234567890abcdef12", SITE).is_err());
        assert!(room_url("javascript:alert(1)", SITE).is_err());
    }
    #[test]
    fn only_public_preferences_are_accepted() {
        assert_eq!(
            clean_preference("simpleshare-name", "  Gusta "),
            Some("Gusta".into())
        );
        assert_eq!(
            clean_preference("simpleshare-volume", "0"),
            Some("0".into())
        );
        assert!(clean_preference("token", "secret").is_none());
        assert!(clean_preference("simpleshare-volume", "NaN").is_none());
    }
    #[test]
    fn profile_survives_install_independent_recreation() {
        let folder =
            std::env::temp_dir().join(format!("simpleshare-test-{}", uuid::Uuid::new_v4()));
        let mut p = Profile::open(folder.clone(), SITE).unwrap();
        p.preference("simpleshare-name", "Gusta").unwrap();
        p.data.prefs.sidebar_collapsed = true;
        p.save().unwrap();
        let restored = Profile::open(folder, SITE).unwrap();
        assert_eq!(restored.data.site_preferences["simpleshare-name"], "Gusta");
        assert!(restored.data.prefs.sidebar_collapsed);
    }
    #[test]
    fn corrupt_profile_is_preserved_before_recovery() {
        let folder =
            std::env::temp_dir().join(format!("simpleshare-corrupt-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("profile.json"), b"broken-json").unwrap();
        let profile = Profile::open(folder.clone(), SITE).unwrap();
        assert!(!profile.data.site_preferences["simpleshare-name"].is_empty());
        let backup = fs::read_dir(folder)
            .unwrap()
            .filter_map(Result::ok)
            .find(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("profile-invalid-")
            })
            .unwrap();
        assert_eq!(fs::read(backup.path()).unwrap(), b"broken-json");
    }
    #[test]
    fn electron_import_keeps_favorites_and_zero_volume() {
        let folder =
            std::env::temp_dir().join(format!("simpleshare-import-{}", uuid::Uuid::new_v4()));
        let mut profile = Profile::open(folder.clone(), SITE).unwrap();
        let old = folder.join("desktop.json");
        fs::write(&old,serde_json::json!({"favorites":[{"url":format!("{SITE}/?room=abcdef1234567890abcdef12"),"name":"Game night"}],"prefs":{"profile":"1080p60"},"sitePreferences":{"simpleshare-name":"Gusta","simpleshare-volume":"0","token":"do not import"}}).to_string()).unwrap();
        profile.import(&old, SITE).unwrap();
        let restored = Profile::open(folder, SITE).unwrap();
        assert_eq!(restored.data.favorites[0].name, "Game night");
        assert_eq!(restored.data.site_preferences["simpleshare-volume"], "0");
        assert!(!restored.data.site_preferences.contains_key("token"));
    }
}
