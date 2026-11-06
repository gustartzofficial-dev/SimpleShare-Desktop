// Explicit --native-fixture test mode: a Win32/GDI window and a WASAPI tone.
// It never loads a website or a Chromium test browser.
use std::{
    io::BufRead,
    sync::{
        atomic::{AtomicBool, AtomicIsize, Ordering},
        Arc,
    },
};
static FIXTURE_WINDOW: AtomicIsize = AtomicIsize::new(0);
use windows::{
    core::w,
    Win32::{
        Foundation::*, Graphics::Gdi::*, System::LibraryLoader::GetModuleHandleW,
        UI::WindowsAndMessaging::*,
    },
};
unsafe extern "system" fn procedure(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        0x8001 => {
            let _ = SetWindowPos(hwnd, None, 0, 0, 1040, 600, SWP_NOMOVE | SWP_NOZORDER);
            LRESULT(0)
        }
        0x8002 => {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
            LRESULT(0)
        }
        0x8003 => {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            LRESULT(0)
        }
        WM_TIMER => {
            let _ = InvalidateRect(Some(hwnd), None, false);
            LRESULT(0)
        }
        WM_PAINT => {
            let mut paint = PAINTSTRUCT::default();
            let dc = BeginPaint(hwnd, &mut paint);
            let mut rect = RECT::default();
            let _ = GetClientRect(hwnd, &mut rect);
            let tick = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
                / 100;
            let brush = CreateSolidBrush(COLORREF(if tick % 2 == 0 {
                0x00283424
            } else {
                0x00283b45
            }));
            FillRect(dc, &rect, brush);
            let _ = DeleteObject(brush.into());
            SetTextColor(dc, COLORREF(0x007797f0));
            SetBkMode(dc, TRANSPARENT);
            let text: Vec<u16> = format!("SimpleShare native capture · frame {tick}")
                .encode_utf16()
                .collect();
            let _ = TextOutW(dc, 30, 150, &text);
            let _ = EndPaint(hwnd, &paint);
            LRESULT(0)
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
fn tone(silent: Arc<AtomicBool>) -> Result<(), Box<dyn std::error::Error>> {
    use wasapi::*;
    initialize_mta().ok()?;
    let enumerator = DeviceEnumerator::new()?;
    let device = enumerator.get_default_device(&Direction::Render)?;
    let mut client = device.get_iaudioclient()?;
    let format = WaveFormat::new(32, 32, &SampleType::Float, 48000, 2, None);
    let (duration, _) = client.get_device_period()?;
    client.initialize_client(
        &format,
        &Direction::Render,
        &StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: duration,
        },
    )?;
    let event = client.set_get_eventhandle()?;
    let render = client.get_audiorenderclient()?;
    client.start_stream()?;
    let mut phase = 0.0f32;
    loop {
        let frames = client.get_available_space_in_frames()?;
        if frames > 0 {
            let mut bytes = Vec::with_capacity(frames as usize * 8);
            for _ in 0..frames {
                phase += 440.0 * std::f32::consts::TAU / 48000.0;
                let sample = if silent.load(Ordering::Relaxed) {
                    0.0
                } else {
                    phase.sin() * 0.03
                };
                bytes.extend_from_slice(&sample.to_le_bytes());
                bytes.extend_from_slice(&sample.to_le_bytes());
            }
            render.write_to_device(frames as usize, &bytes, None)?;
        }
        let _ = event.wait_for_event(1000);
    }
}
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let silent = Arc::new(AtomicBool::new(false));
    let control = silent.clone();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            if let Ok(line) = line {
                if line == "silent" {
                    control.store(true, Ordering::Relaxed);
                }
                let message = match line.as_str() {
                    "resize" => 0x8001,
                    "minimize" => 0x8002,
                    "restore" => 0x8003,
                    _ => 0,
                };
                if message != 0 {
                    unsafe {
                        let _ = PostMessageW(
                            Some(HWND(FIXTURE_WINDOW.load(Ordering::Relaxed) as *mut _)),
                            message,
                            WPARAM(0),
                            LPARAM(0),
                        );
                    }
                }
            }
        }
        std::process::exit(0);
    });
    std::thread::spawn(move || {
        let _ = tone(silent);
    });
    unsafe {
        let instance = GetModuleHandleW(None)?;
        let class = w!("SimpleShareNativeFixture");
        RegisterClassW(&WNDCLASSW {
            lpfnWndProc: Some(procedure),
            hInstance: instance.into(),
            lpszClassName: class,
            hCursor: LoadCursorW(None, IDC_ARROW)?,
            ..Default::default()
        });
        let window = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class,
            w!("SimpleShare Native Capture Fixture"),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            720,
            480,
            None,
            None,
            Some(instance.into()),
            None,
        )?;
        FIXTURE_WINDOW.store(window.0 as isize, Ordering::Relaxed);
        SetTimer(Some(window), 1, 100, None);
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
    Ok(())
}
