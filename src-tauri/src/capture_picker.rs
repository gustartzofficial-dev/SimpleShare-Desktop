use crate::{live_auth, local_auth, local_page, windows_audio, windows_video, AppState};
use serde_json::{json, Value};
use tauri::{ipc::Channel, Manager, Webview, WebviewUrl};
#[tauri::command]
pub async fn capture_choose(
    app: tauri::AppHandle,
    webview: Webview,
    audio: bool,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    let id = uuid::Uuid::new_v4().to_string();
    let sources = windows_video::sources();
    let audio_sources = windows_audio::sources();
    {
        let mut s = state.inner.lock().unwrap();
        if s.capture_picker.is_some() {
            return Err("A screen selector is already open".into());
        }
        s.capture_picker = Some((id.clone(), sources, audio_sources, audio));
    }
    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "capture-picker",
        WebviewUrl::App("capture.html".into()),
    )
    .title("Share a window or display")
    .inner_size(760.0, 620.0)
    .min_inner_size(640.0, 520.0)
    .data_directory(state.web_data.clone())
    .on_navigation(local_page)
    .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
    if let Some(parent) = app.get_window("main") {
        builder = builder.owner_raw(parent.hwnd().map_err(|e| e.to_string())?);
    }
    let window = match builder.build() {
        Ok(w) => w,
        Err(e) => {
            state.inner.lock().unwrap().capture_picker = None;
            return Err(e.to_string());
        }
    };
    let handle = app.clone();
    let request = id.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let state = handle.state::<AppState>();
            let mut s = state.inner.lock().unwrap();
            if s.capture_picker
                .as_ref()
                .is_some_and(|(id, _, _, _)| id == &request)
            {
                s.capture_picker = None;
                drop(s);
                if let Some(view) = handle.get_webview("live") {
                    let _ = view.eval(format!(
                        "window.__ssCaptureChoice?.({},null);",
                        json!(request)
                    ));
                }
            }
        }
    });
    Ok(id)
}
#[tauri::command]
pub fn capture_picker_command(
    app: tauri::AppHandle,
    webview: Webview,
    name: String,
    source_id: Option<String>,
    audio_source_id: Option<String>,
) -> Result<Value, String> {
    local_auth(&webview, "capture-picker")?;
    let state = app.state::<AppState>();
    let mut s = state.inner.lock().unwrap();
    let (request, list, sound, wants_audio) = s
        .capture_picker
        .as_ref()
        .ok_or("The screen selector expired")?
        .clone();
    if name == "ready" {
        return Ok(json!({"sources":list,"audioSources":sound,"audio":wants_audio}));
    }
    if !matches!(name.as_str(), "select" | "cancel") {
        return Err("Unknown capture selection".into());
    }
    let choice = if name == "select" {
        s.grants.clear();
        let source = list
            .into_iter()
            .find(|s| Some(s.id.as_str()) == source_id.as_deref())
            .ok_or("Choose a window or display")?;
        if !windows_video::valid(&source) {
            return Err("That window closed or changed. Reopen the selector.".into());
        }
        let audio = if wants_audio {
            if let Some(audio_id) = audio_source_id {
                let audio = sound
                    .into_iter()
                    .find(|s| s.id == audio_id)
                    .ok_or("Choose an application sound source")?;
                if !windows_audio::valid(&audio) {
                    return Err("That audio application closed or changed".into());
                }
                let id = uuid::Uuid::new_v4().to_string();
                s.grants.insert(id.clone(), audio);
                Some(id)
            } else {
                None
            }
        } else {
            None
        };
        let id = uuid::Uuid::new_v4().to_string();
        s.video_grants.clear();
        s.video_grants.insert(id.clone(), source);
        Some(json!({"video":id,"audio":audio,"kind":s.video_grants[&id].kind}))
    } else {
        None
    };
    s.capture_picker = None;
    drop(s);
    if let Some(view) = app.get_webview("live") {
        let _ = view.eval(format!(
            "window.__ssCaptureChoice?.({},{});",
            json!(request),
            json!(choice)
        ));
    }
    if let Some(window) = app.get_webview_window("capture-picker") {
        let _ = window.close();
    }
    Ok(json!({"ok":true}))
}
#[tauri::command]
pub async fn capture_thumbnail(
    app: tauri::AppHandle,
    webview: Webview,
    source_id: String,
) -> Result<String, String> {
    local_auth(&webview, "capture-picker")?;
    let source = {
        let state = app.state::<AppState>();
        let state = state.inner.lock().unwrap();
        state
            .capture_picker
            .as_ref()
            .and_then(|(_, sources, _, _)| sources.iter().find(|source| source.id == source_id))
            .cloned()
            .ok_or("The source selector has closed")?
    };
    tauri::async_runtime::spawn_blocking(move || windows_video::thumbnail(source))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn video_start(
    app: tauri::AppHandle,
    webview: Webview,
    id: String,
    width: u32,
    height: u32,
    fps: u32,
    on_frame: Channel<Value>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    let source = state
        .inner
        .lock()
        .unwrap()
        .video_grants
        .remove(&id)
        .ok_or("Screen capture permission expired")?;
    let video = state.video.clone();
    tauri::async_runtime::spawn_blocking(move || {
        video.start(app, webview, id, source, width, height, fps, on_frame)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn video_stop(app: tauri::AppHandle, webview: Webview, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    live_auth(&webview, &state)?;
    let video = state.video.clone();
    tauri::async_runtime::spawn_blocking(move || video.stop(&app, &id))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn video_ack(
    webview: Webview,
    state: tauri::State<AppState>,
    id: String,
    slot: usize,
    sequence: u32,
) -> Result<(), String> {
    live_auth(&webview, &state)?;
    state.video.ack(&id, slot, sequence);
    Ok(())
}
