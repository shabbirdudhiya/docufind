//! DOC (Legacy Word Binary) file text extraction
//!
//! This module extracts text from older .doc files (Word 97-2003 format).
//! These are OLE Compound Document files with text stored in the WordDocument stream.

use std::fs::File;
use std::io::Read;
use std::path::Path;
use cfb::CompoundFile;

/// Extract text content from a .doc file (Word 97-2003 binary format)
pub fn extract_doc(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut cfb = CompoundFile::open(file).ok()?;
    
    // Try to read the WordDocument stream
    let mut word_doc_stream = cfb.open_stream("/WordDocument").ok()?;
    let mut word_doc_data = Vec::new();
    word_doc_stream.read_to_end(&mut word_doc_data).ok()?;
    
    if word_doc_data.len() < 1472 {
        return None;
    }
    
    // Parse FIB (File Information Block) to get text positions
    // Reference: https://docs.microsoft.com/en-us/openspecs/office_file_formats/ms-doc
    
    // Read fcClx (offset to Clx in Table stream) at offset 0x01A2 (418)
    let fc_clx = read_u32_le(&word_doc_data, 0x01A2);
    let lcb_clx = read_u32_le(&word_doc_data, 0x01A6);
    
    // Determine which table stream to use (0Table or 1Table)
    // Bit 9 of flags at offset 0x000A indicates which table stream
    let flags = read_u16_le(&word_doc_data, 0x000A);
    let table_stream_name = if flags & 0x0200 != 0 { "/1Table" } else { "/0Table" };
    
    // Read text from Table stream using Clx structure
    if let Some(text) = extract_text_via_clx(&mut cfb, table_stream_name, fc_clx, lcb_clx, &word_doc_data) {
        if !text.trim().is_empty() {
            return Some(text);
        }
    }
    
    // Fallback: Try direct text extraction from WordDocument stream
    if let Some(text) = extract_text_direct(&word_doc_data) {
        if !text.trim().is_empty() {
            return Some(text);
        }
    }
    
    // Second fallback: Try reading from Text stream if it exists
    if let Ok(mut text_stream) = cfb.open_stream("/Text") {
        let mut text_data = Vec::new();
        if text_stream.read_to_end(&mut text_data).is_ok() {
            if let Some(text) = decode_text(&text_data) {
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
        }
    }
    
    // Third fallback: Use the fallback scanner
    if let Some(text) = extract_text_fallback(&word_doc_data) {
        if !text.trim().is_empty() {
            return Some(text);
        }
    }
    
    None
}

/// Extract text using the Clx (Complex) structure in the Table stream
fn extract_text_via_clx<F: Read + std::io::Seek>(
    cfb: &mut CompoundFile<F>,
    table_stream_name: &str,
    fc_clx: u32,
    lcb_clx: u32,
    word_doc_data: &[u8],
) -> Option<String> {
    if lcb_clx == 0 {
        return None;
    }
    
    let mut table_stream = cfb.open_stream(table_stream_name).ok()?;
    let mut table_data = Vec::new();
    table_stream.read_to_end(&mut table_data).ok()?;
    
    if (fc_clx as usize) >= table_data.len() {
        return None;
    }
    
    // Read ccpText (character count of main document text) from FIB
    let ccp_text = read_u32_le(word_doc_data, 0x004C) as usize;
    let fc_min = read_u32_le(word_doc_data, 0x0018) as usize; // Start of text in WordDocument stream
    
    if ccp_text == 0 || fc_min == 0 {
        return None;
    }
    
    // Extract text based on character positions
    let mut text = String::new();
    let end_pos = fc_min + (ccp_text * 2).min(word_doc_data.len() - fc_min);
    
    // Try Unicode first (UTF-16LE)
    if fc_min + 2 <= word_doc_data.len() {
        let text_bytes = &word_doc_data[fc_min..end_pos.min(word_doc_data.len())];
        if let Some(decoded) = decode_utf16le(text_bytes) {
            text = decoded;
        }
    }
    
    // Clean up the text
    Some(clean_extracted_text(&text))
}

/// Direct text extraction from WordDocument stream
fn extract_text_direct(word_doc_data: &[u8]) -> Option<String> {
    // Get text boundaries from FIB
    let fc_min = read_u32_le(word_doc_data, 0x0018) as usize;
    let fc_mac = read_u32_le(word_doc_data, 0x001C) as usize;
    
    if fc_min == 0 || fc_mac <= fc_min || fc_mac > word_doc_data.len() {
        // Try alternate positions
        return extract_text_fallback(word_doc_data);
    }
    
    let text_region = &word_doc_data[fc_min..fc_mac];
    
    // Try to decode as UTF-16LE first (common for newer .doc files)
    if let Some(text) = decode_utf16le(text_region) {
        let cleaned = clean_extracted_text(&text);
        if !cleaned.is_empty() && is_readable_text(&cleaned) {
            return Some(cleaned);
        }
    }
    
    // Try Windows-1252 (common for older .doc files)
    if let Some(text) = decode_windows1252(text_region) {
        let cleaned = clean_extracted_text(&text);
        if !cleaned.is_empty() && is_readable_text(&cleaned) {
            return Some(cleaned);
        }
    }
    
    None
}

/// Fallback text extraction - scan for readable text sequences
fn extract_text_fallback(data: &[u8]) -> Option<String> {
    let mut result = String::new();
    
    // First, try to extract ALL UTF-16LE content (works better for Arabic)
    if let Some(text) = decode_utf16le(data) {
        let cleaned = clean_extracted_text(&text);
        if cleaned.len() > 50 {
            return Some(cleaned);
        }
    }
    
    // Scan for text sequences
    let mut i = 0;
    while i < data.len() {
        // Try to find UTF-16LE sequences
        if i + 1 < data.len() {
            // Check for valid UTF-16LE character (not just ASCII)
            let char_val = u16::from_le_bytes([data[i], data[i + 1]]);
            if is_valid_utf16_char(char_val) {
                let start = i;
                while i + 1 < data.len() {
                    let cv = u16::from_le_bytes([data[i], data[i + 1]]);
                    if !is_valid_utf16_char(cv) {
                        break;
                    }
                    i += 2;
                }
                if i > start + 4 {
                    if let Some(text) = decode_utf16le(&data[start..i]) {
                        if !result.is_empty() && !result.ends_with('\n') && !result.ends_with(' ') {
                            result.push(' ');
                        }
                        result.push_str(&text);
                    }
                }
            } else {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    
    if result.len() > 50 {
        Some(clean_extracted_text(&result))
    } else {
        None
    }
}

/// Check if a UTF-16 code unit is a valid printable character
fn is_valid_utf16_char(val: u16) -> bool {
    // ASCII printable (space to ~)
    (val >= 0x0020 && val <= 0x007E) ||
    // Newlines and tabs
    val == 0x000A || val == 0x000D || val == 0x0009 ||
    // Arabic (0600-06FF)
    (val >= 0x0600 && val <= 0x06FF) ||
    // Arabic Supplement (0750-077F)
    (val >= 0x0750 && val <= 0x077F) ||
    // Arabic Extended-A (08A0-08FF)
    (val >= 0x08A0 && val <= 0x08FF) ||
    // Arabic Presentation Forms-A (FB50-FDFF)
    (val >= 0xFB50 && val <= 0xFDFF) ||
    // Arabic Presentation Forms-B (FE70-FEFF)
    (val >= 0xFE70 && val <= 0xFEFF) ||
    // Common punctuation
    (val >= 0x2000 && val <= 0x206F) ||
    // General punctuation (including Arabic comma, semicolon)
    (val >= 0x060C && val <= 0x061F)
}

/// Decode UTF-16LE bytes to string
fn decode_utf16le(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 2 {
        return None;
    }
    
    let u16_iter = bytes.chunks_exact(2).map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]));
    String::from_utf16(&u16_iter.collect::<Vec<u16>>()).ok()
}

/// Decode Windows-1252 encoded bytes
fn decode_windows1252(bytes: &[u8]) -> Option<String> {
    use encoding_rs::WINDOWS_1252;
    let (decoded, _, had_errors) = WINDOWS_1252.decode(bytes);
    if had_errors {
        None
    } else {
        Some(decoded.into_owned())
    }
}

/// Decode Windows-1256 (Arabic) encoded bytes
fn decode_windows1256(bytes: &[u8]) -> Option<String> {
    use encoding_rs::WINDOWS_1256;
    let (decoded, _, had_errors) = WINDOWS_1256.decode(bytes);
    if had_errors {
        None
    } else {
        Some(decoded.into_owned())
    }
}

/// General text decoder
fn decode_text(bytes: &[u8]) -> Option<String> {
    // Try UTF-16LE first (most common in .doc files)
    if let Some(text) = decode_utf16le(bytes) {
        if is_readable_text(&text) {
            return Some(text);
        }
    }
    
    // Try UTF-8
    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        if is_readable_text(&text) {
            return Some(text);
        }
    }
    
    // Try Windows-1256 (Arabic)
    if let Some(text) = decode_windows1256(bytes) {
        if is_readable_text(&text) {
            return Some(text);
        }
    }
    
    // Try Windows-1252 (Western European)
    decode_windows1252(bytes)
}

/// Clean up extracted text
fn clean_extracted_text(text: &str) -> String {
    text.chars()
        .filter(|c| {
            // Keep printable characters, newlines, tabs, and common Unicode
            c.is_alphanumeric() || 
            c.is_whitespace() || 
            c.is_ascii_punctuation() ||
            (*c >= '\u{0600}' && *c <= '\u{06FF}') || // Arabic
            (*c >= '\u{0750}' && *c <= '\u{077F}') || // Arabic Supplement
            (*c >= '\u{FB50}' && *c <= '\u{FDFF}') || // Arabic Presentation Forms-A
            (*c >= '\u{FE70}' && *c <= '\u{FEFF}') || // Arabic Presentation Forms-B
            (*c >= '\u{4E00}' && *c <= '\u{9FFF}') || // CJK
            *c == '\n' || *c == '\r' || *c == '\t'
        })
        .collect::<String>()
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Check if text is readable (has enough alphanumeric content including Arabic)
fn is_readable_text(text: &str) -> bool {
    if text.len() < 10 {
        return false;
    }
    let alpha_count = text.chars().filter(|c| {
        c.is_alphanumeric() ||
        // Count Arabic characters as readable
        (*c >= '\u{0600}' && *c <= '\u{06FF}') ||
        (*c >= '\u{0750}' && *c <= '\u{077F}') ||
        (*c >= '\u{08A0}' && *c <= '\u{08FF}') ||
        (*c >= '\u{FB50}' && *c <= '\u{FDFF}') ||
        (*c >= '\u{FE70}' && *c <= '\u{FEFF}')
    }).count();
    let total = text.chars().count();
    if total == 0 {
        return false;
    }
    (alpha_count as f64 / total as f64) > 0.3
}

fn read_u16_le(data: &[u8], offset: usize) -> u16 {
    if offset + 2 > data.len() {
        return 0;
    }
    u16::from_le_bytes([data[offset], data[offset + 1]])
}

fn read_u32_le(data: &[u8], offset: usize) -> u32 {
    if offset + 4 > data.len() {
        return 0;
    }
    u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text() {
        let dirty = "Hello\x00World\x01Test\n\nLine";
        let clean = clean_extracted_text(dirty);
        assert!(clean.contains("Hello"));
        assert!(clean.contains("World"));
    }
    
    #[test]
    fn test_is_readable() {
        assert!(is_readable_text("This is readable text with words."));
        assert!(!is_readable_text("\x00\x00\x00"));
        assert!(!is_readable_text("ab"));
    }
}
