//! Background processing
//! 
//! Handles asynchronous PDF indexing so the app remains responsive
//! while processing large or numerous PDF files.

mod pdf_queue;

pub use pdf_queue::PdfQueue;
