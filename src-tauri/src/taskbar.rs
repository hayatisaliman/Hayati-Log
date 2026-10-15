use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindowBuilder};
use windows::{
    core::w,
    Win32::{
        Foundation::{HWND, RECT},
        Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY},
        Media::Audio::{PlaySoundW, SND_ALIAS, SND_ASYNC, SND_FILENAME, SND_NODEFAULT},
        System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD},
        UI::{
            Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN},
            WindowsAndMessaging::{
                FindWindowExW, FindWindowW, GetWindowLongPtrW, GetWindowRect, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST,
                SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
            },
        },
    },
};

fn hwnd<R: Runtime>(w: &tauri::WebviewWindow<R>) -> Option<HWND> {
    w.hwnd().ok().map(|h| HWND(h.0 as _))
}

// create — borderless window that sits on the taskbar, left of the clock and tray icons
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let w = WebviewWindowBuilder::new(app, "bar", WebviewUrl::App("index.html".into()))
        .title("Hayati Log")
        .inner_size(120.0, 40.0)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .shadow(false)
        .visible(false)
        .build()?;
    if let Some(h) = hwnd(&w) {
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
        }
    }
    Ok(())
}

pub fn light_taskbar() -> bool {
    let mut value: u32 = 1;
    let mut size = std::mem::size_of::<u32>() as u32;
    let ok = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut value as *mut u32 as *mut _),
            Some(&mut size),
        )
    };
    ok.is_ok() && value == 1
}

fn busy() -> bool {
    matches!(unsafe { SHQueryUserNotificationState() }, Ok(s) if s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE)
}

fn rect(h: HWND) -> Option<RECT> {
    let mut r = RECT::default();
    unsafe { GetWindowRect(h, &mut r) }.ok().map(|_| r)
}

// place — keep the widget on the taskbar; hidden for full-screen apps, auto-hidden or vertical taskbars
pub fn place<R: Runtime>(app: &AppHandle<R>, width: f64) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(win) = handle.get_webview_window("bar") else { return };
        let Some(me) = hwnd(&win) else { return };
        let target = (|| {
            let tray = unsafe { FindWindowW(w!("Shell_TrayWnd"), None) }.ok()?;
            let tr = rect(tray)?;
            let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            unsafe { GetMonitorInfoW(MonitorFromWindow(tray, MONITOR_DEFAULTTOPRIMARY), &mut mi) }.ok().ok()?;
            let shown = tr.bottom.min(mi.rcMonitor.bottom) - tr.top.max(mi.rcMonitor.top);
            let (tw, th) = (tr.right - tr.left, tr.bottom - tr.top);
            if tw <= th || shown < th - 4 || busy() || width <= 0.0 {
                return None;
            }
            let right = unsafe { FindWindowExW(Some(tray), None, w!("TrayNotifyWnd"), None) }.ok().and_then(rect).map_or(tr.right, |r| r.left);
            let scale = win.scale_factor().unwrap_or(1.0);
            let w = (width * scale).ceil() as i32;
            Some((right - w - (4.0 * scale) as i32, tr.top, w, th))
        })();
        match target {
            Some((x, y, w, h)) => {
                if rect(me).map(|r| (r.left, r.top, r.right - r.left, r.bottom - r.top)) != Some((x, y, w, h)) {
                    let _ = win.set_size(PhysicalSize::new(w as u32, h as u32));
                    let _ = win.set_position(PhysicalPosition::new(x, y));
                }
                unsafe {
                    let _ = ShowWindow(me, SW_SHOWNOACTIVATE);
                    let _ = SetWindowPos(me, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                }
            }
            None => unsafe {
                let _ = ShowWindow(me, SW_HIDE);
            },
        }
    });
}

pub fn alarm() {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let file: Vec<u16> = format!("{root}\\Media\\Alarm01.wav").encode_utf16().chain([0]).collect();
    let played = unsafe { PlaySoundW(windows::core::PCWSTR(file.as_ptr()), None, SND_FILENAME | SND_ASYNC | SND_NODEFAULT) };
    if !played.as_bool() {
        unsafe {
            let _ = PlaySoundW(w!("SystemExclamation"), None, SND_ALIAS | SND_ASYNC);
        }
    }
}
