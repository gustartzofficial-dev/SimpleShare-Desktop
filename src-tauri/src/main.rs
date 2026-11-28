#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod capture_picker;
#[cfg(windows)]
mod gpu_scale;
mod i18n;
mod installer;
#[cfg(target_os = "linux")]
mod linux_platform;
mod profile;
#[cfg(windows)]
mod qa_fixture;
#[cfg(test)]
mod update_tests;
#[cfg(windows)]
mod windows_audio;
#[cfg(target_os = "linux")]
#[path = "linux_audio.rs"]
mod windows_audio;
#[cfg(windows)]
mod windows_video;
#[cfg(target_os = "linux")]
#[path = "linux_video.rs"]
mod windows_video;
use i18n::{tr, tr_with};
use profile::{label, room_url, trusted, Profile, SITE};
use serde_json::{json, Value};
use std::{collections::HashMap, path::PathBuf, sync::Mutex, time::Duration};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    webview::NewWindowResponse,
    Emitter, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewBuilder, WebviewUrl,
    WindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
struct Inner {
    profile: Profile,
    snapshot: Option<Value>,
    compact: bool,
    overlay: String,
    loading: bool,
    error: String,
    notice: String,
    normal_size: (f64, f64),
    picker: Option<(String, Vec<windows_audio::Source>)>,
    grants: HashMap<String, windows_audio::Source>,
    capture_picker: Option<(
        String,
        Vec<windows_video::Source>,
        Vec<windows_audio::Source>,
        bool,
    )>,
    video_grants: HashMap<String, windows_video::Source>,
    update: Option<tauri_plugin_updater::Update>,
    update_status: String,
    quit_token: Option<String>,
    // True while the live page shows an element in fullscreen (a shared screen or camera).
    fullscreen: bool,
}
struct TrayItems {
    show: tauri::menu::MenuItem<tauri::Wry>,
    compact: tauri::menu::MenuItem<tauri::Wry>,
    stop: tauri::menu::MenuItem<tauri::Wry>,
    quit: tauri::menu::MenuItem<tauri::Wry>,
}
struct AppState {
    inner: Mutex<Inner>,
    tray: Mutex<Option<TrayItems>>,
    audio: windows_audio::Audio,
    video: windows_video::Video,
    origin: String,
    web_data: PathBuf,
}
fn live_auth(view: &Webview, state: &AppState) -> Result<(), String> {
    if view.label() != "live" || !view.url().is_ok_and(|u| trusted(&u, &state.origin)) {
        return Err("Unauthorized live-page command".into());
    }
    Ok(())
}
fn local_auth(view: &Webview, label: &str) -> Result<(), String> {
    if view.label() != label || !view.url().is_ok_and(|u| local_page(&u)) {
        return Err("Unauthorized desktop command".into());
    }
    Ok(())
}
fn local_page(u: &url::Url) -> bool {
    (u.scheme() == "tauri" && u.host_str() == Some("localhost"))
        || (matches!(u.scheme(), "http" | "https") && u.host_str() == Some("tauri.localhost"))
        || (cfg!(debug_assertions)
            && u.scheme() == "http"
            && u.host_str() == Some("127.0.0.1")
            && u.port() == Some(1420))
}
#[cfg(test)]
mod local_origin_tests {
    #[test]
    fn windows_and_linux_assets_are_local_but_similar_remote_hosts_are_not() {
        for url in [
            "tauri://localhost/installer.html",
            "http://tauri.localhost/index.html",
        ] {
            assert!(super::local_page(&url.parse().unwrap()));
        }
        for url in [
            "https://localhost/installer.html",
            "tauri://evil.example/",
            "https://tauri.localhost.evil.example/",
        ] {
            assert!(!super::local_page(&url.parse().unwrap()));
        }
    }
}
fn language_of(s: &Inner) -> &'static str {
    i18n::resolve(
        s.profile
            .data
            .site_preferences
            .get("simpleshare-lang")
            .map(String::as_str),
    )
}
fn language(app: &tauri::AppHandle) -> &'static str {
    language_of(&app.state::<AppState>().inner.lock().unwrap())
}
fn localize_tray(app: &tauri::AppHandle) {
    let lang = language(app);
    if let Some(items) = app.state::<AppState>().tray.lock().unwrap().as_ref() {
        let _ = items.show.set_text(tr(lang, "tray.show"));
        let _ = items.compact.set_text(tr(lang, "tray.compact"));
        let _ = items.stop.set_text(tr(lang, "tray.stop"));
        let _ = items.quit.set_text(tr(lang, "tray.quit"));
    }
}
fn localized_default(url: &str, lang: &str) -> String {
    let name = profile::default_name(url);
    if let Some(rest) = name.strip_prefix("Room ") {
        format!("{} {rest}", tr(lang, "room.default"))
    } else {
        tr(lang, "room.saved").into()
    }
}
fn state_value(app: &tauri::AppHandle) -> Value {
    let maximized = app
        .get_window("main")
        .is_some_and(|w| w.is_maximized().unwrap_or(false));
    let state = app.state::<AppState>();
    let s = state.inner.lock().unwrap();
    json!({"version":app.package_info().version.to_string(),"language":language_of(&s),"languagePreference":s.profile.data.site_preferences.get("simpleshare-lang").cloned().unwrap_or_else(||"auto".into()),"fullscreen":s.fullscreen,"compact":s.compact,"overlay":s.overlay,"loading":s.loading,"loadError":s.error,"notice":s.notice,"snapshot":s.snapshot,"data":s.profile.data,"platform":std::env::consts::OS,"selfUpdateSupported":!cfg!(target_os="linux")||std::env::var_os("APPIMAGE").is_some(),"nativeAudioSupported":true,"profilePath":s.profile.directory.display().to_string(),"updateStatus":s.update_status,"updateAvailable":s.update.as_ref().map(|u|u.version.clone()),"maximized":maximized})
}
fn send_state(app: &tauri::AppHandle) {
    let _ = app.emit_to("shell", "shell-state", state_value(app));
}
fn layout(app: &tauri::AppHandle) {
    let Some(window) = app.get_window("main") else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let width = size.width as f64 / scale;
    let height = size.height as f64 / scale;
    let state = app.state::<AppState>();
    let s = state.inner.lock().unwrap();
    let compact = s.compact;
    let notice = s.notice.clone();
    let sidebar = if s.profile.data.prefs.sidebar_collapsed {
        60.0
    } else {
        216.0
    };
    let fullscreen = s.fullscreen && !compact;
    let hidden =
        !fullscreen && (compact || !s.overlay.is_empty() || s.loading || !s.error.is_empty());
    drop(s);
    #[cfg(target_os = "linux")]
    linux_platform::layout(
        app,
        width,
        height,
        if fullscreen { 0.0 } else { sidebar },
        if fullscreen { 0.0 } else { 52.0 },
    );
    if let Some(shell) = app.get_webview("shell") {
        let _ = shell.set_size(LogicalSize::new(width, height));
    }
    if let Some(live) = app.get_webview("live") {
        // In fullscreen the room covers the whole window, hiding the title bar and sidebar.
        let (left, top) = if fullscreen {
            (0.0, 0.0)
        } else {
            (sidebar, 52.0)
        };
        let _ = live.set_position(LogicalPosition::new(left, top));
        let _ = live.set_size(LogicalSize::new(
            (width - left).max(1.0),
            (height - top).max(1.0),
        ));
        if hidden {
            let _ = live.hide();
        } else {
            let _ = live.show();
        }
        let _ = live.eval(format!(
            "window.__ssCompact={compact};window.__ssDesktopNotice?.({});",
            json!(notice)
        ));
    }
}
// Mirrors element fullscreen in the live page onto the native window, so a fullscreen stream
// fills the monitor instead of the area inside the desktop chrome.
fn set_live_fullscreen(app: &tauri::AppHandle, on: bool) {
    let state = app.state::<AppState>();
    let mut s = state.inner.lock().unwrap();
    if s.fullscreen == on || (on && s.compact) {
        return;
    }
    s.fullscreen = on;
    drop(s);
    if let Some(window) = app.get_window("main") {
        let _ = window.set_fullscreen(on);
        if on {
            let _ = window.set_focus();
        }
    }
    layout(app);
    send_state(app);
}
fn exit_live_fullscreen(app: &tauri::AppHandle) {
    if let Some(live) = app.get_webview("live") {
        let _ = live.eval("document.fullscreenElement&&document.exitFullscreen().catch(()=>{})");
    }
    set_live_fullscreen(app, false);
}
#[cfg(windows)]
fn attach_live_handlers(app: &tauri::AppHandle, live: &Webview) -> tauri::Result<()> {
    use webview2_com::{
        take_pwstr, ContainsFullScreenElementChangedEventHandler,
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
            COREWEBVIEW2_PERMISSION_STATE_DENY,
        },
        PermissionRequestedEventHandler,
    };
    let fullscreen_app = app.clone();
    let origin = app.state::<AppState>().origin.clone();
    live.with_webview(move |view| unsafe {
        let Ok(webview) = view.controller().CoreWebView2() else {
            return;
        };
        let mut token = 0i64;
        let handler_app = fullscreen_app.clone();
        let _ = webview.add_ContainsFullScreenElementChanged(
            &ContainsFullScreenElementChangedEventHandler::create(Box::new(move |sender, _| {
                let mut value = windows::core::BOOL::default();
                if let Some(sender) = sender {
                    sender.ContainsFullScreenElement(&mut value)?;
                }
                let on = value.as_bool();
                let app = handler_app.clone();
                // Window changes resize the web view; never run them inside its callback.
                std::thread::spawn(move || set_live_fullscreen(&app, on));
                Ok(())
            })),
            &mut token,
        );
        let _ = webview.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                let mut uri = windows::core::PWSTR::null();
                args.Uri(&mut uri)?;
                let uri = take_pwstr(uri);
                let mut user = windows::core::BOOL::default();
                args.IsUserInitiated(&mut user)?;
                let trusted_page = uri.parse::<url::Url>().is_ok_and(|u| trusted(&u, &origin));
                if !trusted_page || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                    // SimpleShare never uses a microphone; other sites get nothing.
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?;
                } else if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA && user.as_bool() {
                    // The room's Camera button was pressed in the pinned website.
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            })),
            &mut token,
        );
    })
}
#[cfg(target_os = "linux")]
fn attach_live_handlers(app: &tauri::AppHandle, view: &Webview) -> tauri::Result<()> {
    linux_platform::attach(app, view)
}
fn notice(app: &tauri::AppHandle, message: impl Into<String>) {
    app.state::<AppState>().inner.lock().unwrap().notice = message.into();
    send_state(app);
}
fn load_watchdog(app: &tauri::AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(25));
        let state = app.state::<AppState>();
        let mut s = state.inner.lock().unwrap();
        if !s.loading {
            return;
        }
        s.loading = false;
        s.error = tr(language_of(&s), "load.failed").into();
        drop(s);
        layout(&app);
        send_state(&app);
    });
}
fn compact(app: &tauri::AppHandle, on: bool) -> Result<(), String> {
    let w = app.get_window("main").ok_or("No desktop window")?;
    let size = w.inner_size().map_err(|e| e.to_string())?;
    let factor = w.scale_factor().unwrap_or(1.0);
    let state = app.state::<AppState>();
    let mut s = state.inner.lock().unwrap();
    if s.compact == on {
        return Ok(());
    }
    let was_fullscreen = s.fullscreen;
    if on {
        s.normal_size = (size.width as f64 / factor, size.height as f64 / factor);
    }
    s.compact = on;
    let normal_size = s.normal_size;
    let always_on_top = on && s.profile.data.prefs.always_on_top;
    drop(s);
    if on && was_fullscreen {
        exit_live_fullscreen(app);
    }
    // Native window calls can synchronously deliver resize/focus callbacks.
    // None may run while the callbacks' app-state mutex is held.
    if on {
        let _ = w.unmaximize();
        let _ = w.set_min_size(Some(LogicalSize::new(330.0, 340.0)));
        let _ = w.set_size(LogicalSize::new(380.0, 490.0));
    } else {
        let _ = w.set_min_size(Some(LogicalSize::new(960.0, 620.0)));
        let _ = w.set_size(LogicalSize::new(normal_size.0, normal_size.1));
    }
    let _ = w.set_always_on_top(always_on_top);
    layout(app);
    send_state(app);
    Ok(())
}
fn room_action(app: &tauri::AppHandle, action: &str) -> Result<(), String> {
    let id = match action {
        "share" => "shareBtn",
        "stop" => "stopBtn",
        "mute" => "audioBtn",
        "settings" => "settingsBtn",
        "copy" => "copyBtn",
        "camera" => "cameraBtn",
        _ => return Err("Unknown room action".into()),
    };
    let state = app.state::<AppState>();
    let s = state.inner.lock().unwrap();
    let profile = s.profile.data.prefs.profile.clone();
    let is_compact = s.compact;
    drop(s);
    if action == "stop" {
        state.audio.stop_all();
        let video = state.video.clone();
        let handle = app.clone();
        std::thread::spawn(move || video.stop_all(&handle));
    }
    if action == "share" && is_compact {
        compact(app, false)?;
    }
    app.get_webview("live").ok_or("No live view")?.eval(format!("(()=>{{const q=document.getElementById('quality');if(q)q.value={};const b=document.getElementById({});if(b&&!b.disabled)b.click();if({})window.__ssNativeStopAll?.();}})()",json!(profile),json!(id),json!(action=="stop"))).map_err(|e|e.to_string())
}
fn navigate(app: &tauri::AppHandle, input: &str, force: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let url = if input == "home" {
        format!("{}/", state.origin)
    } else {
        room_url(input, &state.origin)?
    };
    let view = app.get_webview("live").ok_or("No live view")?;
    let current = view.url().map_err(|e| e.to_string())?;
    if !force && current.as_str() == url {
        return Ok(());
    }
    let mut s = state.inner.lock().unwrap();
    if s.snapshot
        .as_ref()
        .is_some_and(|v| v["sharing"] == true || v["camera"] == true)
    {
        return Err(tr(language_of(&s), "navigate.sharing").into());
    }
    s.loading = true;
    s.error.clear();
    s.snapshot = None;
    s.grants.clear();
    drop(s);
    state.audio.stop_all();
    state.video.stop_all(app);
    layout(app);
    send_state(app);
    load_watchdog(app);
    view.navigate(url.parse().map_err(|_| "Invalid URL")?)
        .map_err(|e| e.to_string())
}
fn request_quit(app: &tauri::AppHandle) {
    let active = app
        .state::<AppState>()
        .inner
        .lock()
        .unwrap()
        .snapshot
        .as_ref()
        .is_some_and(|s| s["sharing"] == true || s["watching"] == true || s["camera"] == true);
    if active {
        let app = app.clone();
        let lang = language(&app);
        app.clone()
            .dialog()
            .message(tr(lang, "quit.message"))
            .title(tr(lang, "quit.title"))
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                tr(lang, "quit.yes").into(),
                tr(lang, "quit.no").into(),
            ))
            .show(move |yes| {
                if yes {
                    flush_and_quit(&app);
                }
            });
    } else {
        flush_and_quit(app);
    }
}
fn flush_and_quit(app: &tauri::AppHandle) {
    let token = uuid::Uuid::new_v4().to_string();
    app.state::<AppState>().inner.lock().unwrap().quit_token = Some(token.clone());
    if let Some(live) = app.get_webview("live") {
        if live
            .eval(format!("window.__ssFlushAndQuit?.({});", json!(token)))
            .is_ok()
        {
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                if let Some(state) = app.try_state::<AppState>() {
                    state.audio.stop_all();
                    state.video.stop_all(&app);
                }
                app.exit(0);
            });
            return;
        }
    }
    app.exit(0);
}
#[tauri::command]
async fn shell_command(
    app: tauri::AppHandle,
    webview: Webview,
    name: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    local_auth(&webview, "shell")?;
    let value = payload.unwrap_or(Value::Null);
    let state = app.state::<AppState>();
    match name.as_str() {
        "show-notice" => {
            let message = label(value.as_str().unwrap_or(""), 300);
            state.inner.lock().unwrap().notice = message.clone();
            if let Some(view) = app.get_webview("live") {
                let _ = view.eval(format!("window.__ssDesktopNotice?.({});", json!(message)));
            }
            return Ok(json!({"ok":true}));
        }
        "ready" => {}
        "minimize" => {
            app.get_window("main")
                .unwrap()
                .minimize()
                .map_err(|e| e.to_string())?;
        }
        "maximize" => {
            let w = app.get_window("main").unwrap();
            if w.is_maximized().unwrap_or(false) {
                let _ = w.unmaximize();
            } else {
                let _ = w.maximize();
            }
        }
        "close" => {
            let _ = app.get_window("main").unwrap().close();
        }
        "quit" => request_quit(&app),
        "compact" => {
            let on = !state.inner.lock().unwrap().compact;
            compact(&app, on)?;
        }
        "collapse-sidebar" => {
            let mut s = state.inner.lock().unwrap();
            s.profile.data.prefs.sidebar_collapsed = !s.profile.data.prefs.sidebar_collapsed;
            s.profile.save()?;
            drop(s);
            layout(&app);
        }
        "preferences" => {
            let mut s = state.inner.lock().unwrap();
            s.overlay = if s.overlay.is_empty() {
                "preferences".into()
            } else {
                String::new()
            };
            drop(s);
            layout(&app);
        }
        "navigate" => navigate(&app, value.as_str().ok_or("Invalid invite")?, false)?,
        "create" => navigate(&app, &uuid::Uuid::new_v4().simple().to_string(), false)?,
        "favorite" => {
            let mut s = state.inner.lock().unwrap();
            let lang = language_of(&s);
            let url = value["url"]
                .as_str()
                .map(str::to_string)
                .or_else(|| {
                    s.snapshot
                        .as_ref()
                        .and_then(|v| v["url"].as_str().map(str::to_string))
                })
                .ok_or(tr(lang, "favorite.none"))?;
            let clean = room_url(&url, &state.origin)?;
            let known = s.profile.data.favorites.iter().any(|r| r.url == clean);
            let name = value["name"]
                .as_str()
                .filter(|n| !label(n, 48).is_empty())
                .map(str::to_string)
                .or_else(|| (!known).then(|| localized_default(&clean, lang)));
            s.profile.favorite(&url, name.as_deref(), &state.origin)?;
        }
        "language" => {
            let choice = value.as_str().unwrap_or("auto");
            if choice != "auto" && !i18n::LANGUAGES.contains(&choice) {
                return Err("Unknown language".into());
            }
            state
                .inner
                .lock()
                .unwrap()
                .profile
                .preference("simpleshare-lang", choice)?;
            localize_tray(&app);
            if let Some(view) = app.get_webview("live") {
                let _ = view.eval(format!(
                    "try{{localStorage.setItem('simpleshare-lang',{0});}}catch{{}}window.__ssApplyLanguage?.({0});",
                    json!(choice)
                ));
            }
        }
        "exit-fullscreen" => exit_live_fullscreen(&app),
        "remove-favorite" => {
            let url = room_url(value.as_str().ok_or("Invalid room")?, &state.origin)?;
            let mut s = state.inner.lock().unwrap();
            s.profile.data.favorites.retain(|r| r.url != url);
            s.profile.save()?;
        }
        "prefs" => {
            let mut s = state.inner.lock().unwrap();
            let mut prefs = serde_json::to_value(&s.profile.data.prefs).unwrap();
            if let Some(object) = value.as_object() {
                for (k, v) in object {
                    if prefs.get(k).is_some() {
                        prefs[k] = v.clone();
                    }
                }
            }
            s.profile.data.prefs = serde_json::from_value(prefs).map_err(|e| e.to_string())?;
            s.profile.data = s.profile.data.clone().sanitize(&state.origin);
            s.profile.save()?;
            let quality = s.profile.data.prefs.profile.clone();
            let top = s.compact && s.profile.data.prefs.always_on_top;
            drop(s);
            let _ = app.get_window("main").unwrap().set_always_on_top(top);
            let _=app.get_webview("live").unwrap().eval(format!("(()=>{{const q=document.getElementById('quality');if(q){{q.value={};q.dispatchEvent(new Event('change',{{bubbles:true}}));}}}})()",json!(quality)));
        }
        "room-action" => room_action(&app, value.as_str().ok_or("Invalid room action")?)?,
        "retry" => {
            let url = state
                .inner
                .lock()
                .unwrap()
                .snapshot
                .as_ref()
                .and_then(|v| v["url"].as_str().map(str::to_string))
                .unwrap_or("home".into());
            navigate(&app, &url, true)?;
        }
        "dismiss-notice" => state.inner.lock().unwrap().notice.clear(),
        "diagnostics" => {
            let directory = state.inner.lock().unwrap().profile.directory.clone();
            app.opener()
                .open_path(directory.to_string_lossy().to_string(), None::<&str>)
                .map_err(|e| e.to_string())?;
        }
        "import-profile" => {
            if let Some(file) = app
                .dialog()
                .file()
                .add_filter("Electron desktop profile", &["json"])
                .set_title("Choose the old user-data/desktop.json")
                .blocking_pick_file()
            {
                let file = file.into_path().map_err(|e| e.to_string())?;
                let mut s = state.inner.lock().unwrap();
                s.profile.import(&file, &state.origin)?;
                let prefs = s.profile.data.site_preferences.clone();
                drop(s);
                app.get_webview("live")
                    .unwrap()
                    .eval(format!("window.__ssImportPreferences?.({});", json!(prefs)))
                    .map_err(|e| e.to_string())?;
            }
        }
        "check-update" => {
            drop(state);
            check_update(app.clone(), false).await;
            return Ok(json!({"ok":true}));
        }
        "install-update" => {
            drop(state);
            install_update(app.clone()).await?;
            return Ok(json!({"ok":true}));
        }
        _ => return Err("Unknown desktop command".into()),
    }
    send_state(&app);
    Ok(json!({"ok":true}))
}
#[tauri::command]
fn site_preferences(
    webview: Webview,
    state: State<AppState>,
    operation: String,
    key: Option<String>,
    value: Option<String>,
) -> Result<Value, String> {
    live_auth(&webview, &state)?;
    let mut s = state.inner.lock().unwrap();
    match operation.as_str() {
        "read" => Ok(json!(s.profile.data.site_preferences)),
        "save" => {
            let key = key.ok_or("Missing key")?;
            s.profile.preference(&key, &value.ok_or("Missing value")?)?;
            drop(s);
            if key == "simpleshare-lang" {
                let app = webview.app_handle().clone();
                localize_tray(&app);
                send_state(&app);
            }
            Ok(json!(true))
        }
        _ => Err("Unknown preference operation".into()),
    }
}
#[tauri::command]
fn site_state(app: tauri::AppHandle, webview: Webview, value: Value) -> Result<(), String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    let url = value["url"]
        .as_str()
        .and_then(|u| u.parse().ok())
        .filter(|u| trusted(u, &state.origin))
        .ok_or("Invalid page snapshot")?;
    let room = room_url(url.as_str(), &state.origin).ok();
    let snapshot = json!({"url":room.clone().unwrap_or(format!("{}/",state.origin)),"room":room.is_some(),"title":label(value["title"].as_str().unwrap_or("SimpleShare"),48),"status":label(value["status"].as_str().unwrap_or("Connected"),60),"sharing":value["sharing"].as_bool().unwrap_or(false),"watching":value["watching"].as_bool().unwrap_or(false),"canShare":value["canShare"].as_bool().unwrap_or(false),"camera":value["camera"].as_bool().unwrap_or(false),"canCamera":value["canCamera"].as_bool().unwrap_or(false),"fullscreen":value["fullscreen"].as_bool().unwrap_or(false),"theme":if value["theme"]=="light"{"light"}else{"dark"},"streamers":value["streamers"].as_array().unwrap_or(&vec![]).iter().take(10).map(|v|label(v.as_str().unwrap_or(""),48)).collect::<Vec<_>>()});
    let mut s = state.inner.lock().unwrap();
    s.snapshot = Some(snapshot);
    if let Some(room) = room {
        if s.profile.data.last_room != room && s.profile.visit(&room, &state.origin).is_ok() {
            let lang = language_of(&s);
            if let Some(recent) = s.profile.data.recent.first_mut() {
                if recent.name == profile::default_name(&recent.url) {
                    recent.name = localized_default(&recent.url, lang);
                    let _ = s.profile.save();
                }
            }
        }
    }
    drop(s);
    send_state(&app);
    Ok(())
}
#[tauri::command]
fn site_preview(
    app: tauri::AppHandle,
    webview: Webview,
    value: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    if value
        .as_ref()
        .is_some_and(|v| v.len() > 180000 || !v.starts_with("data:image/jpeg;base64,"))
    {
        return Err("Invalid preview".into());
    }
    app.emit_to("shell", "shell-preview", value)
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn site_notice(app: tauri::AppHandle, webview: Webview, message: String) -> Result<(), String> {
    live_auth(&webview, &app.state::<AppState>())?;
    notice(&app, label(&message, 300));
    Ok(())
}
#[tauri::command]
fn site_quit(app: tauri::AppHandle, webview: Webview, token: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    if state.inner.lock().unwrap().quit_token.as_deref() != Some(&token) {
        return Err("No quit request is pending".into());
    }
    state.audio.stop_all();
    state.video.stop_all(&app);
    app.exit(0);
    Ok(())
}
#[tauri::command]
async fn audio_choose(app: tauri::AppHandle, webview: Webview) -> Result<String, String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    let sources = windows_audio::sources();
    let mut s = state.inner.lock().unwrap();
    if s.picker.is_some() {
        return Err("An audio picker is already open".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    s.picker = Some((id.clone(), sources));
    drop(s);
    let mut window = tauri::WebviewWindowBuilder::new(
        &app,
        "audio-picker",
        WebviewUrl::App("audio.html".into()),
    )
    .title(tr(language(&app), "audio.title"))
    .data_directory(state.web_data.clone())
    .inner_size(620.0, 530.0)
    .min_inner_size(500.0, 420.0)
    .resizable(true);
    #[cfg(windows)]
    if let Some(parent) = app.get_window("main") {
        window = window.owner_raw(parent.hwnd().map_err(|e| e.to_string())?);
    }
    let picker_window = match window
        .on_navigation(local_page)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()
    {
        Ok(window) => window,
        Err(error) => {
            state.inner.lock().unwrap().picker = None;
            return Err(error.to_string());
        }
    };
    let on_close = app.clone();
    picker_window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let pending = on_close
                .state::<AppState>()
                .inner
                .lock()
                .unwrap()
                .picker
                .take();
            if let Some((request, _)) = pending {
                if let Some(view) = on_close.get_webview("live") {
                    let _ = view.eval(format!("window.__ssAudioChoice?.({},null)", json!(request)));
                }
            }
        }
    });
    Ok(id)
}
#[tauri::command]
fn picker_command(
    app: tauri::AppHandle,
    webview: Webview,
    name: String,
    source_id: Option<String>,
) -> Result<Value, String> {
    local_auth(&webview, "audio-picker")?;
    let state = app.state::<AppState>();
    let mut s = state.inner.lock().unwrap();
    if name == "ready" {
        return Ok(s
            .picker
            .as_ref()
            .map(|(id, list)| json!({"id":id,"sources":list,"language":language_of(&s)}))
            .unwrap_or(Value::Null));
    }
    if !matches!(name.as_str(), "select" | "cancel") {
        return Err("Unknown picker command".into());
    }
    let (id, list) = s.picker.as_ref().ok_or("Audio selection expired")?.clone();
    let grant = if name == "select" {
        let source = list
            .into_iter()
            .find(|p| Some(p.id.as_str()) == source_id.as_deref())
            .ok_or("Select an application")?;
        if !windows_audio::valid(&source) {
            return Err("That application closed or changed".into());
        }
        let grant = uuid::Uuid::new_v4().to_string();
        s.grants.clear();
        s.grants.insert(grant.clone(), source);
        Some(grant)
    } else {
        None
    };
    s.picker = None;
    drop(s);
    if let Some(view) = app.get_webview("live") {
        let _ = view.eval(format!(
            "window.__ssAudioChoice?.({},{});",
            json!(id),
            json!(grant)
        ));
    }
    if let Some(window) = app.get_webview_window("audio-picker") {
        let _ = window.close();
    }
    Ok(json!({"ok":true}))
}
#[tauri::command]
async fn audio_start(
    app: tauri::AppHandle,
    webview: Webview,
    id: String,
    on_audio: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    let source = state
        .inner
        .lock()
        .unwrap()
        .grants
        .remove(&id)
        .ok_or("Audio permission expired")?;
    let audio = state.audio.clone();
    tauri::async_runtime::spawn_blocking(move || audio.start(app, id, source, on_audio))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn audio_stop(webview: Webview, state: State<AppState>, id: String) -> Result<(), String> {
    live_auth(&webview, &state)?;
    state.audio.stop(&id);
    Ok(())
}
#[tauri::command]
fn audio_ack(
    webview: Webview,
    state: State<AppState>,
    id: String,
    sequence: u32,
) -> Result<(), String> {
    live_auth(&webview, &state)?;
    state.audio.ack(&id, sequence);
    Ok(())
}
async fn check_update(app: tauri::AppHandle, automatic: bool) {
    #[cfg(target_os = "linux")]
    if std::env::var_os("APPIMAGE").is_none() {
        if !automatic {
            let _ = app.opener().open_url(
                "https://github.com/gustartzofficial-dev/SimpleShare-Desktop/releases/latest",
                None::<&str>,
            );
        }
        return;
    }
    {
        let state = app.state::<AppState>();
        let mut s = state.inner.lock().unwrap();
        if automatic && !s.profile.data.prefs.auto_update {
            return;
        }
        s.update_status = tr(language_of(&s), "update.checking").into();
    }
    send_state(&app);
    let result = async {
        app.updater_builder()
            .timeout(Duration::from_secs(20))
            .build()?
            .check()
            .await
    }
    .await;
    let found = match result {
        Ok(update) => {
            let found = update.is_some();
            let state = app.state::<AppState>();
            let mut s = state.inner.lock().unwrap();
            let lang = language_of(&s);
            s.update_status = update
                .as_ref()
                .map(|u| tr_with(lang, "update.available", "version", &u.version))
                .unwrap_or(tr(lang, "update.latest").into());
            s.update = update;
            found
        }
        Err(error) => {
            let state = app.state::<AppState>();
            let mut s = state.inner.lock().unwrap();
            s.update_status = tr_with(
                language_of(&s),
                "update.unavailable",
                "error",
                &error.to_string(),
            );
            false
        }
    };
    send_state(&app);
    if automatic && found {
        let idle = app
            .state::<AppState>()
            .inner
            .lock()
            .unwrap()
            .snapshot
            .as_ref()
            .is_none_or(|v| v["room"] != true);
        if idle {
            let _ = install_update(app).await;
        }
    }
}
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = {
        let state = app.state::<AppState>();
        let mut s = state.inner.lock().unwrap();
        let lang = language_of(&s);
        if s.snapshot
            .as_ref()
            .is_some_and(|v| v["sharing"] == true || v["watching"] == true || v["camera"] == true)
        {
            return Err(tr(lang, "update.waitRoom").into());
        }
        s.update_status = tr(lang, "update.downloading").into();
        s.update.clone().ok_or(tr(lang, "update.checkFirst"))?
    };
    send_state(&app);
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    {
        let state = app.state::<AppState>();
        let s = state.inner.lock().unwrap();
        if s.snapshot.as_ref().is_some_and(|v| v["room"] == true) {
            return Err(tr(language_of(&s), "update.leaveRoom").into());
        }
        s.profile.save()?;
    }
    app.state::<AppState>().audio.stop_all();
    app.state::<AppState>().video.stop_all(&app);
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().any(|a| a == "--install") {
        return installer::setup(app);
    }
    let qa = std::env::args().any(|a| a == "--qa");
    let origin = if qa {
        let value = std::env::var("SIMPLESHARE_QA_URL")?;
        let url: url::Url = value.parse()?;
        if url.scheme() != "http"
            || url.host_str() != Some("127.0.0.1")
            || std::env::var("SIMPLESHARE_QA_PROFILE").is_err()
        {
            return Err("QA requires an explicit loopback URL and isolated profile".into());
        }
        url.origin().ascii_serialization()
    } else {
        SITE.into()
    };
    let directory = if qa {
        PathBuf::from(std::env::var("SIMPLESHARE_QA_PROFILE")?)
    } else {
        app.path().app_config_dir()?
    };
    let web_data = directory.join("webview");
    let profile = Profile::open(directory.clone(), &origin)?;
    let startup = profile.data.site_preferences.clone();
    let startup_language =
        i18n::resolve(startup.get("simpleshare-lang").map(String::as_str)).to_string();
    let initial = if profile.data.prefs.reopen_last_room && !profile.data.last_room.is_empty() {
        profile.data.last_room.clone()
    } else {
        format!("{origin}/")
    };
    app.manage(AppState {
        inner: Mutex::new(Inner {
            profile,
            snapshot: None,
            compact: false,
            overlay: String::new(),
            loading: true,
            error: String::new(),
            notice: String::new(),
            normal_size: (1320.0, 850.0),
            picker: None,
            grants: HashMap::new(),
            capture_picker: None,
            video_grants: HashMap::new(),
            update: None,
            update_status: tr(&startup_language, "update.idle").into(),
            quit_token: None,
            fullscreen: false,
        }),
        tray: Mutex::new(None),
        audio: Default::default(),
        video: Default::default(),
        origin: origin.clone(),
        web_data: web_data.clone(),
    });
    let window = WindowBuilder::new(app, "main")
        .title("SimpleShare")
        .inner_size(1320.0, 850.0)
        .min_inner_size(960.0, 620.0)
        .decorations(false)
        .build()?;
    window.add_child(
        WebviewBuilder::new("shell", WebviewUrl::App("index.html".into()))
            .on_navigation(local_page)
            .on_new_window(|_, _| NewWindowResponse::Deny)
            .data_directory(web_data.clone()),
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(1320.0, 850.0),
    )?;
    let origin_check = origin.clone();
    let mut script = include_str!("../gen/live.js")
        .replace("__SS_ORIGIN_JSON__", &json!(origin).to_string())
        .replace("__SS_PREFS_JSON__", &json!(startup).to_string())
        .replace(
            "__SS_PLATFORM_JSON__",
            &json!(std::env::consts::OS).to_string(),
        );
    script.push_str(include_str!("../../src/native/site-chrome.js"));
    let on_load = app.handle().clone();
    #[cfg(target_os = "linux")]
    let initial_view_url = "about:blank";
    #[cfg(windows)]
    let initial_view_url = initial.as_str();
    let live = WebviewBuilder::new("live", WebviewUrl::External(initial_view_url.parse()?))
        .data_directory(web_data)
        .initialization_script(script)
        .on_navigation(move |url| {
            trusted(url, &origin_check)
                || (cfg!(target_os = "linux") && url.as_str() == "about:blank")
        })
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_page_load(move |view, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let state = on_load.state::<AppState>();
                if view.url().is_ok_and(|u| trusted(&u, &state.origin)) {
                    let mut s = state.inner.lock().unwrap();
                    s.loading = false;
                    s.error.clear();
                    drop(s);
                    layout(&on_load);
                    send_state(&on_load);
                }
            }
        });
    let live = window.add_child(
        live,
        LogicalPosition::new(216.0, 52.0),
        LogicalSize::new(1104.0, 798.0),
    )?;
    #[cfg(target_os = "linux")]
    linux_platform::prepare(app.handle())?;
    attach_live_handlers(app.handle(), &live)?;
    #[cfg(target_os = "linux")]
    live.navigate(initial.parse()?)?;
    let handle = app.handle().clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
            layout(&handle)
        }
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let to_tray = handle
                .state::<AppState>()
                .inner
                .lock()
                .unwrap()
                .profile
                .data
                .prefs
                .close_to_tray;
            if to_tray {
                let _ = handle.get_window("main").unwrap().hide();
            } else {
                request_quit(&handle);
            }
        }
        _ => {}
    });
    let lang = startup_language.as_str();
    let show =
        tauri::menu::MenuItem::with_id(app, "show", tr(lang, "tray.show"), true, None::<&str>)?;
    let mini = tauri::menu::MenuItem::with_id(
        app,
        "compact",
        tr(lang, "tray.compact"),
        true,
        None::<&str>,
    )?;
    let stop =
        tauri::menu::MenuItem::with_id(app, "stop", tr(lang, "tray.stop"), true, None::<&str>)?;
    let quit =
        tauri::menu::MenuItem::with_id(app, "quit", tr(lang, "tray.quit"), true, None::<&str>)?;
    let menu = tauri::menu::Menu::with_items(app, &[&show, &mini, &stop, &quit])?;
    *app.state::<AppState>().tray.lock().unwrap() = Some(TrayItems {
        show: show.clone(),
        compact: mini.clone(),
        stop: stop.clone(),
        quit: quit.clone(),
    });
    tauri::tray::TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("SimpleShare")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let w = app.get_window("main").unwrap();
                let _ = w.show();
                let _ = w.set_focus();
            }
            "compact" => {
                let on = !app.state::<AppState>().inner.lock().unwrap().compact;
                let _ = compact(app, on);
                let _ = app.get_window("main").unwrap().show();
            }
            "stop" => {
                let _ = room_action(app, "stop");
            }
            "quit" => request_quit(app),
            _ => {}
        })
        .build(app)?;
    layout(app.handle());
    #[cfg(target_os = "linux")]
    linux_platform::smoke_probe(app.handle());
    load_watchdog(app.handle());
    let update_app = app.handle().clone();
    if !qa {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(20));
            loop {
                tauri::async_runtime::block_on(check_update(update_app.clone(), true));
                std::thread::sleep(Duration::from_secs(21600));
            }
        });
    }
    Ok(())
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    #[cfg(windows)]
    if args.get(1).is_some_and(|s| s == "--native-fixture") {
        if qa_fixture::run().is_err() {
            std::process::exit(1);
        }
        return;
    }
    #[cfg(windows)]
    if args.get(1).is_some_and(|s| s == "--audio-worker") {
        let result = args
            .get(2)
            .and_then(|p| p.parse().ok())
            .ok_or("Invalid PID")
            .map_err(String::from)
            .and_then(|pid| windows_audio::worker(pid).map_err(|e| e.to_string()));
        if result.is_err() {
            std::process::exit(1);
        }
        return;
    }
    let mut context = tauri::generate_context!();
    if args.iter().any(|arg| arg == "--qa") {
        context.config_mut().identifier.push_str(".qa");
    }
    let builder = tauri::Builder::default();
    #[cfg(target_os = "linux")]
    let builder = builder
        // Older WebKitGTK initializes WebCodecs before GStreamer (WebKit #320327).
        // Querying media playback first initializes its registry before the RTC
        // adapter probes codecs. This script must precede the adapter's script.
        .plugin(tauri::plugin::Builder::<tauri::Wry, ()>::new("linux-media-init")
            .js_init_script_on_all_frames(include_str!("../../src/native/linux-media.js"))
            .build())
        .plugin(tauri_plugin_webrtc::init());
    builder
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            installer::installer_command,
            shell_command,
            site_preferences,
            site_state,
            site_preview,
            site_notice,
            site_quit,
            audio_choose,
            picker_command,
            audio_start,
            audio_stop,
            audio_ack,
            capture_picker::capture_choose,
            capture_picker::capture_picker_command,
            capture_picker::capture_thumbnail,
            capture_picker::video_start,
            capture_picker::video_stop,
            capture_picker::video_ack
        ])
        .setup(setup)
        .build(context)
        .expect("Could not start SimpleShare")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    state.audio.stop_all();
                    state.video.stop_all(app);
                }
            }
        });
}
