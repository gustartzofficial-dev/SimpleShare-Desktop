//! Linux pictures are acquired through WebKitGTK's PipeWire desktop portal.
//! Windows' raw-frame commands remain unavailable on this platform.
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Webview};
#[derive(Clone, Serialize)]
pub struct Source {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub detail: String,
}
pub fn sources() -> Vec<Source> {
    Vec::new()
}
pub fn valid(_: &Source) -> bool {
    false
}
pub fn thumbnail(_: Source) -> Result<String, String> {
    Err("Linux source previews belong to the system desktop portal".into())
}
#[derive(Clone, Default)]
pub struct Video;
impl Video {
    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &self,
        _: AppHandle,
        _: Webview,
        _: String,
        _: Source,
        _: u32,
        _: u32,
        _: u32,
        _: Channel<serde_json::Value>,
    ) -> Result<(), String> {
        Err("Use the Linux desktop capture portal".into())
    }
    pub fn ack(&self, _: &str, _: usize, _: u32) {}
    pub fn stop(&self, _: &AppHandle, _: &str) -> Option<String> {
        None
    }
    pub fn stop_all(&self, app: &AppHandle) {
        use tauri::Manager;
        if let Some(view) = app.get_webview("live") {
            let _ = view.eval("window.__ssNativeStopAll?.()");
        }
    }
}
