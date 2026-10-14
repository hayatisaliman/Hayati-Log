use std::{fs, path::PathBuf};
use tauri::Manager;

const KEEP_BACKUPS: usize = 30;

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = data_dir(&app)?.join("report.json");
    if !file.exists() {
        return Ok(None);
    }
    fs::read_to_string(file).map(Some).map_err(|e| e.to_string())
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
        .invoke_handler(tauri::generate_handler![load_data, save_data, data_path, list_backups, read_backup, media_dir, save_media])
        .run(tauri::generate_context!())
        .expect("error while running Hayati Log");
}
