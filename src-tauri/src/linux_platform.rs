use gtk::prelude::*;
use std::cell::RefCell;
use tauri::Manager;
use webkit2gtk::{PermissionRequestExt, SettingsExt, UserMediaPermissionRequestExt, WebViewExt};
thread_local! { static VIEWS: RefCell<Option<(gtk::Layout, Option<webkit2gtk::WebView>, Option<webkit2gtk::WebView>)>> = const {RefCell::new(None)}; }
// Use a positioned viewport without child-driven minimum dimensions. A plain
// GtkFixed would keep the old window size as its minimum and prevent compact mode.
pub fn prepare(app: &tauri::AppHandle) -> tauri::Result<()> {
    for label in ["shell", "live"] {
        let is_live = label == "live";
        app.get_webview(label)
            .expect("Desktop webview")
            .with_webview(move |view| {
                let widget = view.inner();
                VIEWS.with(|state| {
                    let mut state = state.borrow_mut();
                    let Some(parent) = widget
                        .parent()
                        .and_then(|p| p.downcast::<gtk::Container>().ok())
                    else {
                        return;
                    };
                    if state.is_none() {
                        let fixed =
                            gtk::Layout::new(None::<&gtk::Adjustment>, None::<&gtk::Adjustment>);
                        fixed.set_hexpand(true);
                        fixed.set_vexpand(true);
                        parent.remove(&widget);
                        parent.add(&fixed);
                        fixed.show();
                        *state = Some((fixed, None, None));
                    } else {
                        parent.remove(&widget);
                    }
                    let (fixed, shell, live) = state.as_mut().unwrap();
                    fixed.put(&widget, 0, 0);
                    widget.show();
                    if is_live {
                        *live = Some(widget);
                    } else {
                        *shell = Some(widget);
                    }
                });
            })?;
    }
    Ok(())
}
pub fn layout(app: &tauri::AppHandle, width: f64, height: f64, left: f64, top: f64) {
    let _ = app.run_on_main_thread(move || {
        VIEWS.with(|state| {
            if let Some((fixed, shell, live)) = state.borrow().as_ref() {
                if let Some(view) = shell {
                    view.set_size_request(width as i32, height as i32);
                    fixed.move_(view, 0, 0);
                }
                if let Some(view) = live {
                    view.set_size_request(
                        (width - left).max(1.) as i32,
                        (height - top).max(1.) as i32,
                    );
                    fixed.move_(view, left as i32, top as i32);
                }
            }
        })
    });
}
pub fn attach(app: &tauri::AppHandle, live: &tauri::Webview) -> tauri::Result<()> {
    let origin = app.state::<crate::AppState>().origin.clone();
    let fullscreen = app.clone();
    live.with_webview(move |view| {
        let webview = view.inner();
        if let Some(settings) = WebViewExt::settings(&webview) {
            settings.set_enable_media(true);
            settings.set_enable_webaudio(true);
            settings.set_enable_webrtc(true);
            settings.set_enable_media_stream(true);
            settings.set_enable_fullscreen(true);
            settings.set_media_playback_requires_user_gesture(false);
        }
        webview.connect_permission_request(move |view, request| {
            use glib::translate::ToGlibPtr;
            let trusted = view
                .uri()
                .and_then(|uri| uri.parse::<url::Url>().ok())
                .is_some_and(|url| crate::trusted(&url, &origin));
            if let Some(media) = request.downcast_ref::<webkit2gtk::UserMediaPermissionRequest>() {
                let display = unsafe {
                    webkit2gtk_sys::webkit_user_media_permission_is_for_display_device(
                        media.to_glib_none().0,
                    ) != 0
                };
                if trusted
                    && !media.is_for_audio_device()
                    && (display || media.is_for_video_device())
                {
                    request.allow();
                } else {
                    request.deny();
                }
            } else {
                request.deny();
            }
            true
        });
        let handle = fullscreen.clone();
        webview.connect_enter_fullscreen(move |_| {
            let app = handle.clone();
            std::thread::spawn(move || crate::set_live_fullscreen(&app, true));
            false
        });
        webview.connect_leave_fullscreen(move |_| {
            let app = fullscreen.clone();
            std::thread::spawn(move || crate::set_live_fullscreen(&app, false));
            false
        });
    })
}

/// Probe only an explicit isolated loopback QA launch, never a normal user session.
pub fn smoke_probe(app: &tauri::AppHandle) {
    if !std::env::args().any(|a| a == "--qa")
        || std::env::var("SIMPLESHARE_LINUX_SMOKE").as_deref() != Ok("1")
    {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let result = (|| -> Result<f64, String> {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(25);
            loop {
                let ready = {
                    let state = app.state::<crate::AppState>();
                    let inner = state.inner.lock().unwrap();
                    inner.snapshot.is_some()
                        && inner
                            .profile
                            .data
                            .site_preferences
                            .get("simpleshare-name")
                            .is_some_and(|v| v == "Linux native smoke")
                };
                if ready {
                    break;
                }
                if std::time::Instant::now() > deadline {
                    return Err("The Linux room bridge did not become ready".into());
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            crate::compact(&app, true)?;
            std::thread::sleep(std::time::Duration::from_millis(700));
            let window = app.get_window("main").ok_or("Missing QA window")?;
            let width = window.inner_size().map_err(|e| e.to_string())?.width as f64
                / window.scale_factor().map_err(|e| e.to_string())?;
            crate::compact(&app, false)?;
            if width > 500.0 {
                return Err(format!(
                    "Linux compact mode did not shrink the window: {width}px"
                ));
            }
            Ok(width)
        })();
        let state = app.state::<crate::AppState>();
        let directory = state.inner.lock().unwrap().profile.directory.clone();
        let _ = std::fs::write(
            directory.join("desktop-smoke.json"),
            serde_json::to_vec(&match result {
                Ok(width) => serde_json::json!({"compactWidth":width}),
                Err(error) => serde_json::json!({"error":error}),
            })
            .unwrap(),
        );
    });
}
