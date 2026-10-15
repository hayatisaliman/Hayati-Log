use std::{collections::HashSet, fs, path::PathBuf, time::{Duration, SystemTime}};
use tauri::Manager;

mod menubar;
#[cfg(windows)]
mod taskbar;

const KEEP_BACKUPS: usize = 14;
const MEDIA_GRACE: Duration = Duration::from_secs(24 * 60 * 60);
const OLD_DATA_DIR: &str = "com.hayati.report";

pub(crate) fn data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let old = dir.with_file_name(OLD_DATA_DIR);
    if !dir.exists() && old.is_dir() {
        fs::rename(&old, &dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    let file = dir.join("report.json");
    if !file.exists() {
        return Ok(None);
    }
    std::thread::spawn(move || prune_media(dir));
    fs::read_to_string(file).map(Some).map_err(|e| e.to_string())
}

fn media_refs(text: &str, out: &mut HashSet<String>) {
    for (i, _) in text.match_indices("media:") {
        let name: String = text[i + 6..].chars().take_while(|c| c.is_ascii_alphanumeric() || "._-".contains(*c)).collect();
        if valid_media_name(&name) {
            out.insert(name);
        }
    }
}

// prune_media — deletes media/ files no longer referenced by the data, sandbox or any backup
fn prune_media(dir: PathBuf) {
    let Ok(entries) = fs::read_dir(dir.join("media")) else { return };
    let Ok(main) = fs::read_to_string(dir.join("report.json")) else { return };
    let mut refs = HashSet::new();
    media_refs(&main, &mut refs);
    let mut others = vec![dir.join("report.sandbox.json")];
    if let Ok(b) = fs::read_dir(dir.join("backups")) {
        others.extend(b.filter_map(|e| e.ok()).map(|e| e.path()));
    }
    for p in others {
        if let Ok(t) = fs::read_to_string(p) {
            media_refs(&t, &mut refs);
        }
    }
    let now = SystemTime::now();
    for e in entries.filter_map(|e| e.ok()) {
        let name = e.file_name().to_string_lossy().into_owned();
        let Ok(meta) = e.metadata() else { continue };
        if !meta.is_file() || refs.contains(&name) {
            continue;
        }
        let old = meta.modified().ok().and_then(|t| now.duration_since(t).ok()).map_or(false, |d| d > MEDIA_GRACE);
        if old {
            let _ = fs::remove_file(e.path());
        }
    }
}

#[tauri::command]
fn save_data(app: tauri::AppHandle, json: String, day: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let dir = data_dir(&app)?;
    let file = dir.join("report.json");
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let day: String = day.chars().filter(|c| c.is_ascii_digit() || *c == '-').collect();
    let backup = backups.join(format!("report-{day}.json"));
    if file.exists() && !backup.exists() {
        fs::copy(&file, &backup).map_err(|e| e.to_string())?;
        let mut all: Vec<_> = fs::read_dir(&backups)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.file_name().map_or(false, |n| n.to_string_lossy().starts_with("report-")))
            .collect();
        all.sort();
        if all.len() > KEEP_BACKUPS {
            for p in &all[..all.len() - KEEP_BACKUPS] {
                let _ = fs::remove_file(p);
            }
        }
    }
    let tmp = dir.join("report.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}

#[tauri::command]
fn data_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.join("report.json").to_string_lossy().into_owned())
}

#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = data_dir(&app)?.join("backups");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for e in fs::read_dir(&dir).map_err(|e| e.to_string())?.filter_map(|e| e.ok()) {
        let name = e.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".json") {
            continue;
        }
        let Ok(meta) = e.metadata() else { continue };
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64);
        out.push(serde_json::json!({ "name": name, "size": meta.len(), "modified": modified }));
    }
    Ok(out)
}

#[tauri::command]
fn read_backup(app: tauri::AppHandle, name: String) -> Result<String, String> {
    if name.is_empty() || !name.ends_with(".json") || !name.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) {
        return Err("Invalid backup name".into());
    }
    fs::read_to_string(data_dir(&app)?.join("backups").join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_export(path: String, text: String) -> Result<(), String> {
    let file = PathBuf::from(&path);
    match file.extension().and_then(|e| e.to_str()) {
        Some("json") | Some("md") => {}
        _ => return Err("Only .json and .md files can be exported".into()),
    }
    fs::write(&file, text).map_err(|e| e.to_string())
}

fn valid_media_name(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('.') && name.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

#[tauri::command]
fn media_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?.join("media");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_media(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Expected file bytes".into()) };
    let name = request.headers().get("x-name").and_then(|v| v.to_str().ok()).unwrap_or_default();
    if !valid_media_name(name) {
        return Err("Invalid media name".into());
    }
    let dir = data_dir(&app)?.join("media");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(name), bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| menubar::show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .invoke_handler(tauri::generate_handler![
            load_data, save_data, data_path, list_backups, read_backup, media_dir, save_media, write_export,
            menubar::tray_icons, menubar::tray_watch, menubar::popup_info, menubar::popup_ready, menubar::popup_result,
            menubar::note_saved, menubar::bar_state, menubar::bar_size, menubar::bar_menu, menubar::get_launch_at_login, menubar::set_launch_at_login
        ])
        .setup(|app| Ok(menubar::setup(app.handle())?))
        .on_menu_event(menubar::on_menu)
        .on_window_event(|w, ev| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
                if w.label() == "main" {
                    api.prevent_close();
                    let _ = w.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Hayati Log")
        .run(|app, ev| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = ev {
                menubar::show_main(app);
            }
            let _ = (app, ev);
        });
}
