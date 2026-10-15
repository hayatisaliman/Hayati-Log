use std::{collections::HashMap, fs, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{
    image::Image,
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::data_dir;

const DEFAULT_NOTE: &str = "Bismillah";
const PRESETS: [(&str, u64); 4] = [("10 min", 600), ("15 min", 900), ("30 min", 1800), ("1 hour", 3600)];
const KEEP_NOTES: usize = 15;

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct Saved {
    note: String,
    saved: Vec<String>,
    timer_end: Option<u64>,
    timer_dur: Option<u64>,
    launch_at_login: Option<bool>,
}

impl Default for Saved {
    fn default() -> Self {
        Self { note: DEFAULT_NOTE.into(), saved: vec![], timer_end: None, timer_dur: None, launch_at_login: None }
    }
}

#[derive(Deserialize, Clone, PartialEq)]
pub struct Watch {
    label: String,
    elapsed_sec: u64,
    at_ms: u64,
    paused: bool,
}

#[derive(Deserialize, Clone, PartialEq)]
pub struct Cat {
    id: String,
    label: String,
}

#[derive(Deserialize, Clone, PartialEq)]
pub struct Group {
    name: String,
    cats: Vec<Cat>,
}

#[derive(Deserialize)]
pub struct TrayImage {
    name: String,
    w: u32,
    h: u32,
    rgba: Vec<u8>,
}

#[derive(Default)]
pub struct State {
    saved: Saved,
    watch: Option<Watch>,
    groups: Vec<Group>,
    icons: HashMap<String, (Vec<u8>, u32, u32)>,
    firing: bool,
    popup: Option<Value>,
    shown: bool,
}

pub struct Menubar(Mutex<State>);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

fn fmt_clock(sec: u64) -> String {
    format!("{:02}:{:02}:{:02}", sec / 3600, sec % 3600 / 60, sec % 60)
}

fn fmt_dur(sec: u64) -> String {
    let (h, m, s) = (sec / 3600, sec % 3600 / 60, sec % 60);
    if h > 0 { format!("{h}h {m}m {s}s") } else if m > 0 { format!("{m}m {s}s") } else { format!("{s}s") }
}

fn fmt_span(sec: u64) -> String {
    let (h, m) = (sec / 3600, sec % 3600 / 60);
    let plural = |n: u64, w: &str| format!("{n} {w}{}", if n == 1 { "" } else { "s" });
    if h > 0 { plural(h, "hour") } else if m > 0 { plural(m, "minute") } else { plural(sec, "second") }
}

fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max { text.into() } else { format!("{}…", text.chars().take(max - 1).collect::<String>()) }
}

fn image(st: &State, name: &str) -> Option<Image<'static>> {
    st.icons.get(name).map(|(rgba, w, h)| Image::new_owned(rgba.clone(), *w, *h))
}

fn load<R: Runtime>(app: &AppHandle<R>) -> Saved {
    let file = data_dir(app).map(|d| d.join("menubar.json"));
    if let Some(s) = file.as_ref().ok().and_then(|f| fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str(&t).ok()) {
        return s;
    }
    let mut s = Saved::default();
    let old = std::env::var("HOME").map(|h| std::path::Path::new(&h).join(".menubar_tool_state.json"));
    if let Some(v) = old.ok().and_then(|f| fs::read_to_string(f).ok()).and_then(|t| serde_json::from_str::<Value>(&t).ok()) {
        if let Some(n) = v["notes"]["current"].as_str().filter(|n| !n.trim().is_empty()) {
            s.note = n.into();
        }
        if let Some(list) = v["notes"]["saved"].as_array() {
            s.saved = list.iter().filter_map(|x| x.as_str().map(String::from)).take(KEEP_NOTES).collect();
        }
    }
    s
}

fn store<R: Runtime>(app: &AppHandle<R>, s: &Saved) {
    if let Ok(dir) = data_dir(app) {
        let _ = fs::write(dir.join("menubar.json"), serde_json::to_string(s).unwrap_or_default());
    }
}

fn state<R: Runtime>(app: &AppHandle<R>) -> std::sync::MutexGuard<'_, State> {
    app.state::<Menubar>().inner().0.lock().unwrap_or_else(|e| e.into_inner())
}

fn edit<R: Runtime>(app: &AppHandle<R>, f: impl FnOnce(&mut Saved)) {
    let saved = {
        let mut st = state(app);
        f(&mut st.saved);
        st.saved.clone()
    };
    store(app, &saved);
    refresh_menus(app);
}

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, text: &str, enabled: bool) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, text, enabled, None::<&str>)
}

fn footer<R: Runtime>(app: &AppHandle<R>, m: &Menu<R>) -> tauri::Result<()> {
    m.append(&PredefinedMenuItem::separator(app)?)?;
    m.append(&item(app, "app:open", "Open Hayati Log", true)?)
}

fn timer_menu<R: Runtime>(app: &AppHandle<R>, s: &Saved) -> tauri::Result<Menu<R>> {
    let m = Menu::new(app)?;
    m.append(&item(app, "-", "Timer", false)?)?;
    if s.timer_end.is_some() {
        m.append(&item(app, "timer:stop", "Stop Timer", true)?)?;
    } else {
        for (label, sec) in PRESETS {
            m.append(&item(app, &format!("timer:{sec}"), label, true)?)?;
        }
        m.append(&PredefinedMenuItem::separator(app)?)?;
        m.append(&item(app, "timer:custom", "Custom…", true)?)?;
    }
    footer(app, &m)?;
    Ok(m)
}

fn categories<R: Runtime>(app: &AppHandle<R>, groups: &[Group], add: impl Fn(&Submenu<R>) -> tauri::Result<()>) -> tauri::Result<()> {
    for g in groups {
        let sub = Submenu::new(app, &g.name, true)?;
        for c in &g.cats {
            sub.append(&item(app, &format!("watch:cat:{}", c.id), &c.label, true)?)?;
        }
        add(&sub)?;
    }
    Ok(())
}

fn watch_menu<R: Runtime>(app: &AppHandle<R>, watch: &Option<Watch>, groups: &[Group]) -> tauri::Result<Menu<R>> {
    let m = Menu::new(app)?;
    m.append(&item(app, "-", "Stopwatch", false)?)?;
    match watch {
        Some(w) => {
            m.append(&item(app, "-", &w.label, false)?)?;
            m.append(&item(app, if w.paused { "watch:resume" } else { "watch:pause" }, if w.paused { "Resume" } else { "Pause" }, true)?)?;
            m.append(&item(app, "watch:stop", "Stop", true)?)?;
            let sub = Submenu::new(app, "Switch To", true)?;
            sub.append(&item(app, "watch:specify", "Specify…", true)?)?;
            sub.append(&PredefinedMenuItem::separator(app)?)?;
            categories(app, groups, |i| sub.append(i))?;
            m.append(&sub)?;
        }
        None => {
            m.append(&item(app, "watch:specify", "Specify…", true)?)?;
            m.append(&PredefinedMenuItem::separator(app)?)?;
            categories(app, groups, |i| m.append(i))?;
        }
    }
    footer(app, &m)?;
    Ok(m)
}

fn note_menu<R: Runtime>(app: &AppHandle<R>, s: &Saved) -> tauri::Result<Menu<R>> {
    let m = Menu::new(app)?;
    m.append(&item(app, "-", "Note", false)?)?;
    m.append(&item(app, "note:write", "Write Note…", true)?)?;
    m.append(&item(app, "note:clear", "Clear Note", true)?)?;
    let sub = Submenu::new(app, "Saved Notes", true)?;
    if s.saved.is_empty() {
        sub.append(&item(app, "-", "None saved", false)?)?;
    }
    for (i, n) in s.saved.iter().enumerate() {
        sub.append(&item(app, &format!("note:load:{i}"), &clip(n, 25), true)?)?;
    }
    m.append(&sub)?;
    footer(app, &m)?;
    Ok(m)
}

// refresh_menus — never call tray APIs while holding the state lock
fn refresh_menus<R: Runtime>(app: &AppHandle<R>) {
    let (saved, watch, groups) = {
        let st = state(app);
        (st.saved.clone(), st.watch.clone(), st.groups.clone())
    };
    let menus = (timer_menu(app, &saved), watch_menu(app, &watch, &groups), note_menu(app, &saved));
    let set = |id: &str, m: tauri::Result<Menu<R>>| {
        if let (Some(t), Ok(m)) = (app.tray_by_id(id), m) {
            let _ = t.set_menu(Some(m));
        }
    };
    set("timer", menus.0);
    set("watch", menus.1);
    set("note", menus.2);
}

fn make_tray<R: Runtime>(app: &AppHandle<R>, id: &str, icon: Option<Image<'static>>) -> tauri::Result<TrayIcon<R>> {
    let mut b = TrayIconBuilder::with_id(id).icon_as_template(true).show_menu_on_left_click(true).tooltip("Hayati Log");
    if let Some(i) = icon {
        b = b.icon(i);
    }
    b.build(app)
}

#[tauri::command]
pub fn tray_icons<R: Runtime>(app: AppHandle<R>, icons: Vec<TrayImage>) -> Result<(), String> {
    let (timer, watch, note) = {
        let mut st = state(&app);
        for i in icons {
            st.icons.insert(i.name, (i.rgba, i.w, i.h));
        }
        (image(&st, "hourglass"), image(&st, "stopwatch"), if cfg!(target_os = "macos") { None } else { image(&st, "pen-line") })
    };
    if app.tray_by_id("timer").is_none() {
        make_tray(&app, "timer", timer).map_err(|e| e.to_string())?;
        make_tray(&app, "watch", watch).map_err(|e| e.to_string())?;
        make_tray(&app, "note", note).map_err(|e| e.to_string())?;
    }
    refresh_menus(&app);
    tick(&app, &mut Titles::default());
    Ok(())
}

#[tauri::command]
pub fn tray_watch<R: Runtime>(app: AppHandle<R>, watch: Option<Watch>, groups: Vec<Group>) {
    let rebuild = {
        let mut st = state(&app);
        let shape = |w: &Option<Watch>| w.as_ref().map(|w| (w.label.clone(), w.paused));
        let changed = shape(&st.watch) != shape(&watch) || st.groups != groups;
        st.watch = watch;
        st.groups = groups;
        changed
    };
    if rebuild {
        refresh_menus(&app);
    }
}

#[derive(Default)]
struct Titles {
    timer: String,
    watch: String,
    watch_icon: String,
    note: String,
}

fn tick<R: Runtime>(app: &AppHandle<R>, last: &mut Titles) {
    let now = now_ms();
    let (next, icon, fire) = {
        let mut st = state(app);
        let mut fire = None;
        let timer = match st.saved.timer_end {
            Some(end) if end > now => fmt_clock((end - now + 999) / 1000),
            Some(_) => {
                if !st.firing {
                    st.firing = true;
                    fire = Some(st.saved.timer_dur.unwrap_or(0));
                }
                fmt_clock(0)
            }
            None => String::new(),
        };
        let (watch, watch_icon) = match &st.watch {
            Some(w) if w.paused => (format!("{} {}", w.label, fmt_dur(w.elapsed_sec)), "pause"),
            Some(w) => (format!("{} {}", w.label, fmt_dur(w.elapsed_sec + now.saturating_sub(w.at_ms) / 1000)), "stopwatch"),
            None => (String::new(), "stopwatch"),
        };
        let next = Titles { timer, watch, watch_icon: watch_icon.into(), note: clip(&st.saved.note, 30) };
        let icon = if next.watch_icon != last.watch_icon { image(&st, watch_icon) } else { None };
        (next, icon, fire)
    };
    let title = |id: &str, t: &str| {
        if let Some(tray) = app.tray_by_id(id) {
            let _ = tray.set_title(if t.is_empty() { None } else { Some(format!(" {t}")) });
            let _ = tray.set_tooltip(Some(if t.is_empty() { "Hayati Log" } else { t }));
        }
    };
    if next.timer != last.timer { title("timer", &next.timer) }
    if next.watch != last.watch { title("watch", &next.watch) }
    if next.note != last.note {
        if let Some(tray) = app.tray_by_id("note") {
            let _ = tray.set_title(Some(&next.note));
            let _ = tray.set_tooltip(Some(&next.note));
        }
    }
    if let (Some(i), Some(tray)) = (icon, app.tray_by_id("watch")) {
        let _ = tray.set_icon(Some(i));
        let _ = tray.set_icon_as_template(true);
    }
    *last = next;
    if let Some(dur) = fire {
        refresh_menus(app);
        fire_timer(app, dur);
    }
}

fn fire_timer<R: Runtime>(app: &AppHandle<R>, dur: u64) {
    let msg = format!("{} time's up!", fmt_span(dur));
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = Command::new("caffeinate").args(["-u", "-t", "5"]).spawn();
        let _ = Command::new("afplay").arg("/System/Library/Sounds/Glass.aiff").spawn();
    }
    let _ = app.notification().builder().title("Timer").body(&msg).show();
    open_popup(app, json!({ "kind": "timer-done", "title": "Time's up", "message": format!("{msg} How is it going?") }));
}

fn start_timer<R: Runtime>(app: &AppHandle<R>, sec: u64) {
    edit(app, |s| {
        s.timer_end = Some(now_ms() + sec * 1000);
        s.timer_dur = Some(sec);
    });
}

fn emit_main<R: Runtime>(app: &AppHandle<R>, action: Value) {
    let _ = app.emit_to("main", "tray-action", action);
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn on_menu<R: Runtime>(app: &AppHandle<R>, ev: MenuEvent) {
    let id = ev.id().as_ref().to_string();
    match id.as_str() {
        "app:open" => {
            show_main(app);
            emit_main(app, json!({ "type": "view", "view": "blocks" }));
        }
        "timer:custom" => open_popup(app, json!({ "kind": "timer", "title": "Custom Timer" })),
        "timer:stop" => edit(app, |s| { s.timer_end = None; s.timer_dur = None }),
        "watch:specify" => open_popup(app, json!({ "kind": "activity", "title": "Stopwatch" })),
        "watch:pause" | "watch:resume" | "watch:stop" => emit_main(app, json!({ "type": &id[6..] })),
        "note:write" => {
            let (note, saved) = { let st = state(app); (st.saved.note.clone(), st.saved.saved.clone()) };
            open_popup(app, json!({ "kind": "note", "title": "Note", "note": note, "saved": saved }));
        }
        "note:clear" => edit(app, |s| s.note = DEFAULT_NOTE.into()),
        _ => {
            if let Some(cat) = id.strip_prefix("watch:cat:") {
                emit_main(app, json!({ "type": "start", "cat": cat }));
            } else if let Some(i) = id.strip_prefix("note:load:").and_then(|i| i.parse::<usize>().ok()) {
                edit(app, |s| if let Some(n) = s.saved.get(i).cloned() { s.note = n });
            } else if let Some(sec) = id.strip_prefix("timer:").and_then(|s| s.parse::<u64>().ok()) {
                start_timer(app, sec);
            }
        }
    }
}

#[cfg(target_os = "macos")]
objc2::define_class!(
    #[unsafe(super(objc2_app_kit::NSPanel, objc2_app_kit::NSWindow, objc2_app_kit::NSResponder, objc2_foundation::NSObject))]
    #[name = "HayatiPopupPanel"]
    struct PopupPanel;

    impl PopupPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key(&self) -> bool {
            true
        }

        #[unsafe(method(canBecomeMainWindow))]
        fn can_become_main(&self) -> bool {
            false
        }
    }
);

// make_panel — non-activating panel: floats over any app and Space without bringing Hayati Log forward
#[cfg(target_os = "macos")]
fn make_panel<R: Runtime>(w: &tauri::WebviewWindow<R>) {
    use objc2::ClassType;
    use objc2_app_kit::{NSPanel, NSStatusWindowLevel, NSWindowCollectionBehavior as B, NSWindowStyleMask};
    let Ok(ptr) = w.ns_window() else { return };
    unsafe { objc2::ffi::object_setClass(ptr.cast(), PopupPanel::class()) };
    let panel: &NSPanel = unsafe { &*(ptr as *const NSPanel) };
    panel.setStyleMask(panel.styleMask() | NSWindowStyleMask::NonactivatingPanel);
    panel.setFloatingPanel(true);
    panel.setBecomesKeyOnlyIfNeeded(false);
    panel.setLevel(NSStatusWindowLevel);
    panel.setCollectionBehavior(B::CanJoinAllSpaces | B::FullScreenAuxiliary | B::Stationary | B::IgnoresCycle);
    panel.setHidesOnDeactivate(false);
}

#[cfg(target_os = "macos")]
fn raise_window<R: Runtime>(w: &tauri::WebviewWindow<R>) {
    use objc2_app_kit::NSWindow;
    let Ok(ptr) = w.ns_window() else { return };
    let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
    ns.orderFrontRegardless();
    ns.makeKeyWindow();
}

#[cfg(not(target_os = "macos"))]
fn raise_window<R: Runtime>(w: &tauri::WebviewWindow<R>) {
    let _ = w.set_always_on_top(true);
}

pub fn open_popup<R: Runtime>(app: &AppHandle<R>, info: Value) {
    {
        let mut st = state(app);
        if st.popup.as_ref().is_some_and(|p| p["kind"] == "timer-done") && info["kind"] != "timer-done" {
            return;
        }
        st.popup = Some(info.clone());
        st.shown = false;
    }
    let _ = app.emit_to("popup", "popup", info);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        let late = { let st = state(&app); st.popup.is_some() && !st.shown };
        if late {
            show_popup(&app, 380.0, 180.0);
        }
    });
}

fn show_popup<R: Runtime>(app: &AppHandle<R>, w: f64, h: f64) {
    state(app).shown = true;
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(win) = handle.get_webview_window("popup") else { return };
        let _ = win.set_size(tauri::LogicalSize::new(w, h));
        let cursor = handle.cursor_position().ok();
        let mon = cursor.and_then(|c| handle.monitor_from_point(c.x, c.y).ok().flatten()).or_else(|| handle.primary_monitor().ok().flatten());
        if let Some(m) = mon {
            let (pos, size, scale) = (m.position(), m.size(), m.scale_factor());
            let x = pos.x as f64 + (size.width as f64 - w * scale) / 2.0;
            let y = pos.y as f64 + size.height as f64 * 0.2;
            let _ = win.set_position(PhysicalPosition::new(x, y));
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = win.show();
            let _ = win.set_focus();
        }
        raise_window(&win);
    });
}

fn close_popup<R: Runtime>(app: &AppHandle<R>) {
    {
        let mut st = state(app);
        st.popup = None;
        st.shown = false;
    }
    if let Some(w) = app.get_webview_window("popup") {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn popup_info<R: Runtime>(app: AppHandle<R>) -> Option<Value> {
    state(&app).popup.clone()
}

#[tauri::command]
pub fn popup_ready<R: Runtime>(app: AppHandle<R>, width: f64, height: f64) {
    if state(&app).popup.is_some() {
        show_popup(&app, width, height);
    }
}

#[tauri::command]
pub fn popup_result<R: Runtime>(app: AppHandle<R>, value: Value) {
    let kind = state(&app).popup.as_ref().and_then(|p| p["kind"].as_str().map(String::from)).unwrap_or_default();
    close_popup(&app);
    let text = value.as_str().map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    match kind.as_str() {
        "note" => {
            if let Some(t) = text {
                edit(&app, |s| {
                    s.saved.retain(|x| *x != t);
                    s.saved.insert(0, t.clone());
                    s.saved.truncate(KEEP_NOTES);
                    s.note = t;
                });
            }
        }
        "timer" => {
            if let Some(sec) = value.as_u64().filter(|s| *s > 0) {
                start_timer(&app, sec);
            }
        }
        "timer-done" => {
            state(&app).firing = false;
            if value.as_str() == Some("more") {
                let dur = state(&app).saved.timer_dur.unwrap_or(0);
                start_timer(&app, dur);
            } else {
                edit(&app, |s| { s.timer_end = None; s.timer_dur = None });
            }
        }
        "activity" => {
            if let Some(t) = text {
                emit_main(&app, json!({ "type": "start", "text": t }));
            }
        }
        _ => {}
    }
}

#[tauri::command]
pub fn note_saved<R: Runtime>(app: AppHandle<R>, saved: Vec<String>) {
    edit(&app, |s| s.saved = saved.into_iter().take(KEEP_NOTES).collect());
}

#[tauri::command]
pub fn get_launch_at_login<R: Runtime>(app: AppHandle<R>) -> bool {
    state(&app).saved.launch_at_login.unwrap_or(true)
}

#[tauri::command]
pub fn set_launch_at_login<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<(), String> {
    edit(&app, |s| s.launch_at_login = Some(on));
    sync_autostart(&app, on)
}

fn sync_autostart<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let al = app.autolaunch();
    if on { al.enable() } else if al.is_enabled().unwrap_or(false) { al.disable() } else { Ok(()) }.map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn keep_awake() {
    use objc2_foundation::{ns_string, NSActivityOptions, NSProcessInfo};
    let token = NSProcessInfo::processInfo().beginActivityWithOptions_reason(NSActivityOptions::UserInitiatedAllowingIdleSystemSleep, ns_string!("Menu bar timer"));
    std::mem::forget(token);
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let mut saved = load(app);
    let login = *saved.launch_at_login.get_or_insert(true);
    store(app, &saved);
    let _ = sync_autostart(app, login);
    app.manage(Menubar(Mutex::new(State { saved, ..Default::default() })));

    WebviewWindowBuilder::new(app, "popup", WebviewUrl::App("index.html".into()))
        .title("Hayati Log")
        .inner_size(380.0, 180.0)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .accept_first_mouse(true)
        .shadow(true)
        .visible(false)
        .build()?;
    #[cfg(target_os = "macos")]
    if let Some(w) = app.get_webview_window("popup") {
        make_panel(&w);
    }

    #[cfg(target_os = "macos")]
    keep_awake();

    if !std::env::args().any(|a| a == "--hidden") {
        show_main(app);
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        let mut last = Titles::default();
        loop {
            std::thread::sleep(Duration::from_millis(1000 - now_ms() % 1000 + 5));
            if handle.tray_by_id("timer").is_some() {
                tick(&handle, &mut last);
            }
        }
    });
    Ok(())
}
