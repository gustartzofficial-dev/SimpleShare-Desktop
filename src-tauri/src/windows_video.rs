use crate::gpu_scale::Scaler;
use serde::Serialize;
use serde_json::json;
use std::{
    cell::RefCell,
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, Manager, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Environment12, ICoreWebView2SharedBuffer, ICoreWebView2_17,
    COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY,
};
use windows::core::{Interface, PCWSTR};
use windows_capture::{
    capture::{CaptureControl, Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::*,
    window::Window,
};
type CaptureError = Box<dyn std::error::Error + Send + Sync>;
thread_local! {static BUFFERS:RefCell<HashMap<String,Vec<ICoreWebView2SharedBuffer>>>=RefCell::new(HashMap::new());}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub detail: String,
    #[serde(skip)]
    handle: isize,
    #[serde(skip)]
    pid: u32,
}
pub fn sources() -> Vec<Source> {
    let mut result = Vec::new();
    for monitor in Monitor::enumerate().unwrap_or_default() {
        let handle = monitor.as_raw_hmonitor() as isize;
        result.push(Source {
            id: format!("display:{handle}"),
            name: monitor.name().unwrap_or("Display".into()),
            kind: "display".into(),
            detail: format!(
                "{} × {}",
                monitor.width().unwrap_or(0),
                monitor.height().unwrap_or(0)
            ),
            handle,
            pid: 0,
        });
    }
    for source in crate::windows_audio::video_sources() {
        let window = Window::from_raw_hwnd(source.hwnd as *mut _);
        if window.is_valid() {
            result.push(Source {
                id: source.id,
                name: source.name,
                kind: "window".into(),
                detail: source.executable,
                handle: source.hwnd,
                pid: source.pid,
            });
        }
    }
    result.truncate(90);
    result
}
pub fn valid(source: &Source) -> bool {
    sources()
        .iter()
        .any(|s| s.id == source.id && s.pid == source.pid && s.detail == source.detail)
}
#[derive(Clone)]
struct Flags {
    app: tauri::AppHandle,
    id: String,
    slots: [usize; 2],
    pending: Arc<Mutex<[Option<u32>; 2]>>,
    ended: Arc<AtomicBool>,
    channel: Channel<serde_json::Value>,
    width: u32,
    height: u32,
    fps: u32,
}
struct Capture {
    flags: Flags,
    scaler: Option<Scaler>,
    sequence: u32,
    last: Option<Instant>,
}
impl Drop for Capture {
    fn drop(&mut self) {
        self.flags.ended.store(true, Ordering::Release);
        // Keep mapped memory alive until every native capture callback has gone,
        // including when the OS rejects a request to stop the capture thread.
        close_buffers(&self.flags.app, self.flags.id.clone());
    }
}
impl GraphicsCaptureApiHandler for Capture {
    type Flags = Flags;
    type Error = CaptureError;
    fn new(ctx: Context<Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            flags: ctx.flags,
            scaler: None,
            sequence: 0,
            last: None,
        })
    }
    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let now = Instant::now();
        if self.last.is_some_and(|last| {
            now.duration_since(last)
                < Duration::from_micros(1_000_000 / self.flags.fps as u64)
                    .saturating_sub(Duration::from_millis(1))
        }) {
            return Ok(());
        }
        if frame.width() == 0 || frame.height() == 0 {
            return Ok(());
        }
        let slot = {
            let mut pending = self.flags.pending.lock().unwrap();
            let Some(slot) = pending.iter().position(Option::is_none) else {
                return Ok(());
            };
            self.sequence = self.sequence.wrapping_add(1);
            pending[slot] = Some(self.sequence);
            slot
        };
        if self
            .scaler
            .as_ref()
            .is_none_or(|s| s.source_size != (frame.width(), frame.height()))
        {
            self.scaler = Some(Scaler::new(frame, self.flags.width, self.flags.height)?);
        }
        unsafe {
            self.scaler
                .as_ref()
                .unwrap()
                .copy_to(frame, self.flags.slots[slot])?;
        }
        self.last = Some(now);
        self.flags.channel.send(json!({"slot":slot,"sequence":self.sequence,"width":self.flags.width,"height":self.flags.height}))?;
        Ok(())
    }
    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.flags.ended.store(true, Ordering::Release);
        Ok(())
    }
}
struct Job {
    control: CaptureControl<Capture, CaptureError>,
    pending: Arc<Mutex<[Option<u32>; 2]>>,
}
#[derive(Clone, Default)]
pub struct Video {
    jobs: Arc<Mutex<HashMap<String, Job>>>,
    start_gate: Arc<Mutex<()>>,
}
fn close_buffers(app: &tauri::AppHandle, id: String) {
    let _ = app.run_on_main_thread(move || {
        BUFFERS.with(|map| {
            if let Some(buffers) = map.borrow_mut().remove(&id) {
                for buffer in buffers {
                    unsafe {
                        let _ = buffer.Close();
                    }
                }
            }
        });
    });
}
impl Video {
    pub fn start(
        &self,
        app: tauri::AppHandle,
        view: Webview,
        id: String,
        source: Source,
        width: u32,
        height: u32,
        fps: u32,
        channel: Channel<serde_json::Value>,
    ) -> Result<(), String> {
        let _start = self.start_gate.lock().unwrap();
        if self.jobs.lock().unwrap().len() >= 2 {
            return Err("Finish the current screen capture before starting another".into());
        }
        if !valid(&source) {
            return Err("That capture source closed or changed. Choose it again.".into());
        }
        let width = width.clamp(320, 1920);
        let height = height.clamp(180, 1080);
        let fps = fps.clamp(1, 60);
        let size = width as u64 * height as u64 * 4;
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        let buffer_id = id.clone();
        view.with_webview(move |view| {
            let result = (|| -> Result<[usize; 2], String> {
                unsafe {
                    let environment: ICoreWebView2Environment12 = view
                        .environment()
                        .cast()
                        .map_err(|e| format!("WebView2 shared memory is unavailable: {e}"))?;
                    let webview: ICoreWebView2_17 = view
                        .controller()
                        .CoreWebView2()
                        .map_err(|e| e.to_string())?
                        .cast()
                        .map_err(|e| e.to_string())?;
                    let mut pointers = [0usize; 2];
                    let mut buffers = Vec::new();
                    for slot in 0..2 {
                        let buffer = environment
                            .CreateSharedBuffer(size)
                            .map_err(|e| e.to_string())?;
                        let mut pointer = std::ptr::null_mut();
                        buffer.Buffer(&mut pointer).map_err(|e| e.to_string())?;
                        pointers[slot] = pointer as usize;
                        let message: Vec<u16> =
                            json!({"type":"simpleshare-native-video","id":buffer_id,"slot":slot})
                                .to_string()
                                .encode_utf16()
                                .chain(Some(0))
                                .collect();
                        webview
                            .PostSharedBufferToScript(
                                &buffer,
                                COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY,
                                PCWSTR(message.as_ptr()),
                            )
                            .map_err(|e| e.to_string())?;
                        buffers.push(buffer);
                    }
                    BUFFERS.with(|map| map.borrow_mut().insert(buffer_id, buffers));
                    Ok(pointers)
                }
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        let slots = match rx.recv_timeout(Duration::from_secs(8)) {
            Ok(Ok(slots)) => slots,
            result => {
                close_buffers(&app, id);
                return Err(match result {
                    Ok(Err(error)) => error,
                    _ => "Native frame bridge did not initialize".into(),
                });
            }
        };
        let pending = Arc::new(Mutex::new([None; 2]));
        let ended = Arc::new(AtomicBool::new(false));
        let flags = Flags {
            app: app.clone(),
            id: id.clone(),
            slots,
            pending: pending.clone(),
            ended: ended.clone(),
            channel,
            width,
            height,
            fps,
        };
        macro_rules! start {
            ($item:expr) => {
                Capture::start_free_threaded(Settings::new(
                    $item,
                    CursorCaptureSettings::WithCursor,
                    DrawBorderSettings::Default,
                    SecondaryWindowSettings::Default,
                    MinimumUpdateIntervalSettings::Default,
                    DirtyRegionSettings::Default,
                    ColorFormat::Rgba8,
                    flags,
                ))
                .map_err(|e| e.to_string())
            };
        }
        let control = if source.kind == "display" {
            start!(Monitor::from_raw_hmonitor(source.handle as *mut _))
        } else {
            start!(Window::from_raw_hwnd(source.handle as *mut _))
        };
        let control = match control {
            Ok(value) => value,
            Err(error) => {
                close_buffers(&app, id);
                return Err(error);
            }
        };
        self.jobs
            .lock()
            .unwrap()
            .insert(id.clone(), Job { control, pending });
        let video = self.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(200));
                let finished = {
                    let jobs = video.jobs.lock().unwrap();
                    let Some(job) = jobs.get(&id) else {
                        return;
                    };
                    job.control.is_finished()
                };
                if ended.load(Ordering::Acquire) || finished {
                    break;
                }
            }
            let message = video
                .stop(&app, &id)
                .unwrap_or("The selected window closed or native capture ended.".into());
            if let Some(view) = app.get_webview("live") {
                let _ = view.eval(format!(
                    "window.__ssVideoEnded?.({},{});",
                    json!(id),
                    json!(message)
                ));
            }
        });
        Ok(())
    }
    pub fn ack(&self, id: &str, slot: usize, sequence: u32) {
        if slot >= 2 {
            return;
        }
        if let Some(job) = self.jobs.lock().unwrap().get(id) {
            let mut pending = job.pending.lock().unwrap();
            if pending[slot] == Some(sequence) {
                pending[slot] = None;
            }
        }
    }
    pub fn stop(&self, app: &tauri::AppHandle, id: &str) -> Option<String> {
        let job = self.jobs.lock().unwrap().remove(id);
        let error = job.and_then(|job| {
            job.control
                .stop()
                .err()
                .map(|error| format!("Native capture stopped: {error}"))
        });
        let _ = app;
        error
    }
    pub fn stop_all(&self, app: &tauri::AppHandle) {
        let ids: Vec<_> = self.jobs.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.stop(app, &id);
        }
    }
}
