use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::fs;
use std::io::BufReader;
use std::path::Path;
use zip::ZipArchive;

/// Extract text content from an XLSX file
///
/// XLSX files are ZIP archives containing XML files.
/// - xl/sharedStrings.xml contains the string table (most text content)
/// - xl/worksheets/sheet1.xml, sheet2.xml, etc. contain cell data
///
/// We extract from sharedStrings.xml for the text content.
/// Uses quick-xml streaming parser for 10-50x faster extraction.
pub fn extract_xlsx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::with_capacity(8192);

    // Direct access to sharedStrings.xml (faster than iterating all entries)
    if let Ok(shared_strings) = archive.by_name("xl/sharedStrings.xml") {
        let buf_reader = BufReader::new(shared_strings);
        let mut reader = Reader::from_reader(buf_reader);
        reader.config_mut().trim_text(true);

        let mut buf = Vec::with_capacity(512);
        let mut in_si = false;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    if e.local_name().as_ref() == b"si" {
                        in_si = true;
                    }
                }
                Ok(Event::End(e)) => {
                    if e.local_name().as_ref() == b"si" {
                        in_si = false;
                        content.push(' ');
                    }
                }
                Ok(Event::Text(e)) if in_si => {
                    if let Ok(text) = e.unescape() {
                        content.push_str(&text);
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
    }

    if content.is_empty() {
        None
    } else {
        Some(content.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_nonexistent_file() {
        let result = extract_xlsx(Path::new("/nonexistent/file.xlsx"));
        assert!(result.is_none());
    }
}
