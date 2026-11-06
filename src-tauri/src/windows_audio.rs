use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    io::{Read, Write},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Manager,
};
use windows::{
    core::{BOOL, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HWND, LPARAM},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
            GetWindowThreadProcessId, IsWindowVisible,
        },
    },
};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub executable: String,
    #[serde(skip)]
    pub hwnd: isize,
    #[serde(skip)]
    pub pid: u32,
}
fn executable(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 32768];
        let mut len = buf.len() as u32;
        let ok =
            QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len)
                .is_ok();
        let _ = CloseHandle(h);
        if !ok {
            return None;
        }
        Some(
            String::from_utf16_lossy(&buf[..len as usize])
                .rsplit('\\')
                .next()?
                .to_lowercase(),
        )
    }
}
struct Enumeration {
    list: Vec<Source>,
    audio_only: bool,
}
unsafe extern "system" fn enumerate(hwnd: HWND, param: LPARAM) -> BOOL {
    let selection = &mut *(param.0 as *mut Enumeration);
    let len = GetWindowTextLengthW(hwnd);
    if !IsWindowVisible(hwnd).as_bool() || len <= 0 || len > 512 {
        return BOOL(1);
    }
    let mut rect = Default::default();
    if GetWindowRect(hwnd, &mut rect).is_err()
        || rect.right - rect.left < 60
        || rect.bottom - rect.top < 40
    {
        return BOOL(1);
    }
    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == std::process::id() {
        return BOOL(1);
    }
    let Some(exe) = executable(pid) else {
        return BOOL(1);
    };
    if selection.audio_only
        && [
            "explorer.exe",
            "applicationframehost.exe",
            "shellexperiencehost.exe",
            "svchost.exe",
            "dllhost.exe",
            "cmd.exe",
            "powershell.exe",
            "pwsh.exe",
            "conhost.exe",
            "windowsterminal.exe",
            "wt.exe",
        ]
        .contains(&exe.as_str())
    {
        return BOOL(1);
    }
    let mut text = vec![0u16; len as usize + 1];
    let count = GetWindowTextW(hwnd, &mut text);
    if count > 0 {
        selection.list.push(Source {
            id: format!("window:{}", hwnd.0 as isize),
            name: String::from_utf16_lossy(&text[..count as usize]),
            executable: exe,
            hwnd: hwnd.0 as isize,
            pid,
        });
    }
    BOOL(1)
}
pub fn sources() -> Vec<Source> {
    enumerate_sources(true)
}
pub fn video_sources() -> Vec<Source> {
    enumerate_sources(false)
}
fn enumerate_sources(audio_only: bool) -> Vec<Source> {
    let mut selection = Enumeration {
        list: vec![],
        audio_only,
    };
    unsafe {
        let _ = EnumWindows(Some(enumerate), LPARAM(&mut selection as *mut _ as isize));
    }
    selection.list.truncate(80);
    selection.list
}
pub fn valid(source: &Source) -> bool {
    unsafe {
        let mut pid = 0;
        GetWindowThreadProcessId(HWND(source.hwnd as *mut _), Some(&mut pid));
        pid == source.pid && executable(pid).is_some_and(|s| s == source.executable)
    }
}
pub struct Job {
    pub child: Arc<Mutex<Child>>,
    pub pending: Arc<Mutex<BTreeSet<u32>>>,
}
#[derive(Clone, Default)]
pub struct Audio {
    pub jobs: Arc<Mutex<HashMap<String, Job>>>,
    start_gate: Arc<Mutex<()>>,
}
impl Audio {
    pub fn start(
        &self,
        app: AppHandle,
        id: String,
        source: Source,
        channel: Channel<InvokeResponseBody>,
    ) -> Result<(), String> {
        let _start = self.start_gate.lock().unwrap();
        if !valid(&source) {
            return Err("The selected audio application changed. Choose it again.".into());
        }
        if self.jobs.lock().unwrap().len() >= 3 {
            return Err("Too many application audio sources".into());
        }
        let mut child = Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
            .args(["--audio-worker", &source.pid.to_string()])
            .creation_flags(0x08000000)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        let mut stdout = child.stdout.take().ok_or("Audio output is unavailable")?;
        let child = Arc::new(Mutex::new(child));
        let initialized = Arc::new(AtomicBool::new(false));
        let watchdog_child = child.clone();
        let watchdog_ready = initialized.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(8));
            if !watchdog_ready.load(Ordering::Acquire) {
                let _ = watchdog_child.lock().unwrap().kill();
            }
        });
        let mut header = [0; 4];
        let started = stdout.read_exact(&mut header).is_ok() && &header == b"SSAU";
        initialized.store(true, Ordering::Release);
        if !started {
            let _ = child.lock().unwrap().kill();
            let _ = child.lock().unwrap().wait();
            return Err("Windows application audio could not initialize".into());
        }
        let pending = Arc::new(Mutex::new(BTreeSet::new()));
        self.jobs.lock().unwrap().insert(
            id.clone(),
            Job {
                child: child.clone(),
                pending: pending.clone(),
            },
        );
        let jobs = self.jobs.clone();
        thread::spawn(move || {
            let mut sequence = 0u32;
            loop {
                let mut length = [0; 4];
                if stdout.read_exact(&mut length).is_err() {
                    break;
                }
                let size = u32::from_le_bytes(length) as usize;
                if size == 0 || size > 65536 {
                    break;
                }
                let mut bytes = vec![0; size + 4];
                if stdout.read_exact(&mut bytes[4..]).is_err() {
                    break;
                }
                if !jobs.lock().unwrap().contains_key(&id) {
                    return;
                }
                let mut credits = pending.lock().unwrap();
                if credits.len() >= 8 {
                    continue;
                }
                sequence = sequence.wrapping_add(1);
                credits.insert(sequence);
                drop(credits);
                bytes[..4].copy_from_slice(&sequence.to_le_bytes());
                if channel.send(InvokeResponseBody::Raw(bytes)).is_err() {
                    break;
                }
            }
            if jobs.lock().unwrap().remove(&id).is_some() {
                if let Some(view) = app.get_webview("live") {
                    let _ = view.eval(format!(
                        "window.__ssAudioError?.({},{})",
                        serde_json::to_string(&id).unwrap(),
                        serde_json::to_string(
                            "Application audio stopped. Your picture can continue."
                        )
                        .unwrap()
                    ));
                }
            }
            let _ = child.lock().unwrap().kill();
            let _ = child.lock().unwrap().wait();
        });
        Ok(())
    }
    pub fn ack(&self, id: &str, sequence: u32) {
        if let Some(job) = self.jobs.lock().unwrap().get(id) {
            job.pending.lock().unwrap().remove(&sequence);
        }
    }
    pub fn stop(&self, id: &str) {
        if let Some(job) = self.jobs.lock().unwrap().remove(id) {
            let mut child = job.child.lock().unwrap();
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    pub fn stop_all(&self) {
        let ids: Vec<_> = self.jobs.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }
}
pub fn worker(pid: u32) -> Result<(), Box<dyn std::error::Error>> {
    use wasapi::*;
    // The parent owns the write end. A crash or forced quit closes it even during silence.
    thread::spawn(|| {
        let _ = std::io::stdin().read(&mut [0u8; 1]);
        std::process::exit(0);
    });
    initialize_mta().ok()?;
    let format = WaveFormat::new(32, 32, &SampleType::Float, 48000, 2, None);
    let mut client = AudioClient::new_application_loopback_client(pid, true)?;
    client.initialize_client(
        &format,
        &Direction::Capture,
        &StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: 0,
        },
    )?;
    let event = client.set_get_eventhandle()?;
    let capture = client.get_audiocaptureclient()?;
    let mut queue = VecDeque::new();
    client.start_stream()?;
    let mut output = std::io::stdout().lock();
    output.write_all(b"SSAU")?;
    output.flush()?;
    loop {
        let frames = capture.get_next_packet_size()?.unwrap_or(0);
        if frames > 0 {
            capture.read_from_device_to_deque(&mut queue)?;
        }
        while queue.len() >= 480 * 2 * 4 {
            let mut pcm = Vec::with_capacity(480 * 2 * 2);
            for _ in 0..960 {
                let raw = [
                    queue.pop_front().unwrap(),
                    queue.pop_front().unwrap(),
                    queue.pop_front().unwrap(),
                    queue.pop_front().unwrap(),
                ];
                let sample = (f32::from_le_bytes(raw).clamp(-1.0, 1.0) * 32767.0) as i16;
                pcm.extend_from_slice(&sample.to_le_bytes());
            }
            output.write_all(&(pcm.len() as u32).to_le_bytes())?;
            output.write_all(&pcm)?;
            output.flush()?;
        }
        if queue.len() > 48000 * 8 {
            queue.clear();
        }
        if event.wait_for_event(3000).is_err() {
            continue;
        }
    }
}
