//! File watching functionality
//!
//! Watches indexed folders for changes and emits events to the frontend.

use std::path::Path;
use std::sync::mpsc::channel;
use std::thread;
use std::time::Duration;

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

use crate::extractors::ALL_EXTENSIONS;
use crate::state::AppState;

/// Start watching folders for changes
#[tauri::command]
pub async fn start_watching(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let folders = state
        .watched_folders
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    if folders.is_empty() {
        return Err("No folders to watch".to_string());
    }

    // Stop existing watcher
    {
        let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
        *watcher_guard = None;
    }

    let (tx, rx) = channel();

    let config = Config::default().with_poll_interval(Duration::from_secs(2));

    let mut watcher = RecommendedWatcher::new(tx, config).map_err(|e| e.to_string())?;

    // Watch all indexed folders
    for folder in &folders {
        watcher
            .watch(Path::new(folder), RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch {}: {}", folder, e))?;
    }

    // Store watcher
    {
        let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
        *watcher_guard = Some(watcher);
    }

    // Spawn thread to handle events
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut debounce_map: std::collections::HashMap<String, std::time::Instant> =
            std::collections::HashMap::new();
        let debounce_duration = Duration::from_millis(500);

        for res in rx {
            match res {
                Ok(event) => {
                    for path in event.paths {
                        let path_str = path.to_string_lossy().to_string();

                        // Debounce: skip if we've seen this path recently
                        let now = std::time::Instant::now();
                        if let Some(last_time) = debounce_map.get(&path_str) {
                            if now.duration_since(*last_time) < debounce_duration {
                                continue;
                            }
                        }
                        debounce_map.insert(path_str.clone(), now);

                        // Check if it's a supported file
                        if let Some(ext) = path.extension() {
                            let ext_str = ext.to_string_lossy().to_lowercase();
                            if ALL_EXTENSIONS.contains(&ext_str.as_str()) {
                                let file_name = path
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default();

                                // Skip temp files
                                if file_name.starts_with('.') || file_name.starts_with("~$") {
                                    continue;
                                }

                                match event.kind {
                                    notify::EventKind::Create(_) | notify::EventKind::Modify(_) => {
                                        let _ = app_handle.emit(
                                            "file-changed",
                                            serde_json::json!({
                                                "type": "modified",
                                                "path": path_str
                                            }),
                                        );
                                    }
                                    notify::EventKind::Remove(_) => {
                                        let _ = app_handle.emit(
                                            "file-changed",
                                            serde_json::json!({
                                                "type": "removed",
                                                "path": path_str
                                            }),
                                        );
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Watch error: {:?}", e);
                }
            }
        }
    });

    println!("👀 Started watching {} folders", folders.len());
    Ok(())
}

/// Stop watching folders
#[tauri::command]
pub async fn stop_watching(state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *watcher_guard = None;
    println!("🛑 Stopped watching folders");
    Ok(())
}
