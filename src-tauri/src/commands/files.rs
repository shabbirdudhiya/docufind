use std::path::Path;
use tauri::State;

use crate::extractors::extract_content;
use crate::search::tantivy_search::delete_document_from_tantivy;
use crate::state::AppState;

/// Extract file content for preview
#[tauri::command]
pub async fn extract_file_content(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    extract_content(path, &ext).ok_or_else(|| "Failed to extract content".to_string())
}

/// Move file to trash
#[tauri::command]
pub async fn delete_file(file_path: String, state: State<'_, AppState>) -> Result<(), String> {
    // Use trash crate to move to system trash
    trash::delete(&file_path).map_err(|e| e.to_string())?;

    // Remove from Vec index
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.retain(|f| f.path != file_path);
    }

    // Remove from Tantivy index
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        delete_document_from_tantivy(&mut writer, &state.tantivy_schema, &file_path)?;
        writer.commit().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Open file with default application
#[tauri::command]
pub async fn open_file(file_path: String) -> Result<(), String> {
    opener::open(&file_path).map_err(|e| e.to_string())
}

/// Show file in folder/explorer
#[tauri::command]
pub async fn show_in_folder(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        if std::process::Command::new("nautilus")
            .args(["--select", &file_path])
            .spawn()
            .is_err()
        {
            if std::process::Command::new("dolphin")
                .args(["--select", &file_path])
                .spawn()
                .is_err()
            {
                let parent = Path::new(&file_path)
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                opener::open(&parent).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}
