use std::path::Path;
use tauri::State;

use crate::extractors::{extract_content, extract_content_structured};
use crate::models::DocumentContent;
use crate::search::tantivy_search::delete_document_from_tantivy;
use crate::state::AppState;

/// Extract file content for preview (plain text)
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

/// Extract file content for rich preview (structured)
#[tauri::command]
pub async fn extract_file_content_structured(file_path: String) -> Result<DocumentContent, String> {
    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    extract_content_structured(path, &ext)
        .ok_or_else(|| "Failed to extract structured content".to_string())
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

/// Open file and automatically search/navigate to the search term
/// Uses COM automation on Windows for Office documents
#[tauri::command]
pub async fn open_file_and_search(file_path: String, search_term: String) -> Result<(), String> {
    let ext = Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    // If no search term, just open normally
    if search_term.trim().is_empty() {
        return opener::open(&file_path).map_err(|e| e.to_string());
    }

    match ext.as_str() {
        "doc" | "docx" => open_word_at_search(&file_path, &search_term),
        "xls" | "xlsx" => open_excel_at_search(&file_path, &search_term),
        "ppt" | "pptx" => open_powerpoint_at_search(&file_path, &search_term),
        _ => {
            // For other files, copy search term to clipboard and open
            #[cfg(target_os = "windows")]
            {
                let _ = copy_to_clipboard(&search_term);
            }
            opener::open(&file_path).map_err(|e| e.to_string())
        }
    }
}

/// Open Word document and navigate to search term using COM automation
#[cfg(target_os = "windows")]
fn open_word_at_search(file_path: &str, search_term: &str) -> Result<(), String> {
    let escaped_path = file_path.replace("'", "''").replace("\\", "\\\\");
    let escaped_term = search_term.replace("'", "''").replace("\\", "\\\\");

    let script = format!(
        r#"
try {{
    $word = New-Object -ComObject Word.Application
    $word.Visible = $true
    $doc = $word.Documents.Open('{}')
    Start-Sleep -Milliseconds 300
    $find = $word.Selection.Find
    $find.ClearFormatting()
    $find.Text = '{}'
    $find.Forward = $true
    $find.Wrap = 1
    $find.MatchCase = $false
    $find.MatchWholeWord = $false
    $null = $find.Execute()
}} catch {{
    Write-Host "COM Error: $_"
}}
"#,
        escaped_path, escaped_term
    );

    std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .spawn()
        .map_err(|e| format!("Failed to launch Word: {}", e))?;

    Ok(())
}

/// Open Excel document and navigate to search term using COM automation
#[cfg(target_os = "windows")]
fn open_excel_at_search(file_path: &str, search_term: &str) -> Result<(), String> {
    let escaped_path = file_path.replace("'", "''").replace("\\", "\\\\");
    let escaped_term = search_term.replace("'", "''").replace("\\", "\\\\");

    let script = format!(
        r#"
try {{
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $true
    $workbook = $excel.Workbooks.Open('{}')
    Start-Sleep -Milliseconds 300
    foreach ($sheet in $workbook.Sheets) {{
        $found = $sheet.Cells.Find('{}')
        if ($found) {{
            $sheet.Activate()
            $found.Select()
            break
        }}
    }}
}} catch {{
    Write-Host "COM Error: $_"
}}
"#,
        escaped_path, escaped_term
    );

    std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .spawn()
        .map_err(|e| format!("Failed to launch Excel: {}", e))?;

    Ok(())
}

/// Open PowerPoint and search using keyboard automation
#[cfg(target_os = "windows")]
fn open_powerpoint_at_search(file_path: &str, search_term: &str) -> Result<(), String> {
    let escaped_path = file_path.replace("'", "''").replace("\\", "\\\\");
    let escaped_term = search_term.replace("'", "''");

    // PowerPoint COM Find is complex, so we use keyboard automation
    let script = format!(
        r#"
try {{
    $ppt = New-Object -ComObject PowerPoint.Application
    $ppt.Visible = $true
    $presentation = $ppt.Presentations.Open('{}')
    Start-Sleep -Milliseconds 500
    
    # Copy search term to clipboard
    Set-Clipboard -Value '{}'
    
    # Send Ctrl+F to open Find dialog, then paste and search
    Add-Type -AssemblyName System.Windows.Forms
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait('^f')
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 100
    [System.Windows.Forms.SendKeys]::SendWait('{{ENTER}}')
}} catch {{
    Write-Host "COM Error: $_"
}}
"#,
        escaped_path, escaped_term
    );

    std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .spawn()
        .map_err(|e| format!("Failed to launch PowerPoint: {}", e))?;

    Ok(())
}

/// Copy text to Windows clipboard
#[cfg(target_os = "windows")]
fn copy_to_clipboard(text: &str) -> Result<(), String> {
    let escaped = text.replace("'", "''");
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!("Set-Clipboard -Value '{}'", escaped),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Fallback implementations for non-Windows platforms
#[cfg(not(target_os = "windows"))]
fn open_word_at_search(file_path: &str, _search_term: &str) -> Result<(), String> {
    opener::open(file_path).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn open_excel_at_search(file_path: &str, _search_term: &str) -> Result<(), String> {
    opener::open(file_path).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn open_powerpoint_at_search(file_path: &str, _search_term: &str) -> Result<(), String> {
    opener::open(file_path).map_err(|e| e.to_string())
}
