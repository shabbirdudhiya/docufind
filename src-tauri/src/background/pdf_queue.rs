use std::collections::VecDeque;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, AtomicUsize, Ordering}};
use std::thread;
use std::path::PathBuf;

/// Background PDF processing queue
/// 
/// PDFs are queued for async processing to keep the UI responsive.
/// The main indexing completes quickly with fast file types,
/// then PDFs are processed in the background.
pub struct PdfQueue {
    /// Queue of PDF paths waiting to be processed
    queue: Mutex<VecDeque<PathBuf>>,
    
    /// Number of PDFs currently being processed
    processing_count: AtomicUsize,
    
    /// Number of PDFs completed
    completed_count: AtomicUsize,
    
    /// Total PDFs queued (for progress calculation)
    total_queued: AtomicUsize,
    
    /// Whether background processing is running
    is_running: AtomicBool,
}

impl PdfQueue {
    pub fn new() -> Self {
        Self {
            queue: Mutex::new(VecDeque::new()),
            processing_count: AtomicUsize::new(0),
            completed_count: AtomicUsize::new(0),
            total_queued: AtomicUsize::new(0),
            is_running: AtomicBool::new(false),
        }
    }
    
    /// Add a PDF path to the queue
    pub fn enqueue(&self, path: PathBuf) {
        if let Ok(mut queue) = self.queue.lock() {
            queue.push_back(path);
            self.total_queued.fetch_add(1, Ordering::SeqCst);
        }
    }
    
    /// Add multiple PDF paths to the queue
    pub fn enqueue_batch(&self, paths: Vec<PathBuf>) {
        if let Ok(mut queue) = self.queue.lock() {
            let count = paths.len();
            queue.extend(paths);
            self.total_queued.fetch_add(count, Ordering::SeqCst);
        }
    }
    
    /// Get the next PDF path from the queue
    pub fn dequeue(&self) -> Option<PathBuf> {
        if let Ok(mut queue) = self.queue.lock() {
            queue.pop_front()
        } else {
            None
        }
    }
    
    /// Get current queue status
    pub fn status(&self) -> PdfQueueStatus {
        PdfQueueStatus {
            pending: self.queue.lock().map(|q| q.len()).unwrap_or(0),
            processing: self.processing_count.load(Ordering::SeqCst),
            completed: self.completed_count.load(Ordering::SeqCst),
            total: self.total_queued.load(Ordering::SeqCst),
            is_running: self.is_running.load(Ordering::SeqCst),
        }
    }
    
    /// Mark that processing has started for a PDF
    pub fn mark_processing(&self) {
        self.processing_count.fetch_add(1, Ordering::SeqCst);
    }
    
    /// Mark that a PDF has been completed
    pub fn mark_completed(&self) {
        self.processing_count.fetch_sub(1, Ordering::SeqCst);
        self.completed_count.fetch_add(1, Ordering::SeqCst);
    }
    
    /// Check if queue is empty and nothing is processing
    pub fn is_idle(&self) -> bool {
        let queue_empty = self.queue.lock().map(|q| q.is_empty()).unwrap_or(true);
        let nothing_processing = self.processing_count.load(Ordering::SeqCst) == 0;
        queue_empty && nothing_processing
    }
    
    /// Set running state
    pub fn set_running(&self, running: bool) {
        self.is_running.store(running, Ordering::SeqCst);
    }
    
    /// Reset counters (call when starting a new indexing session)
    pub fn reset(&self) {
        if let Ok(mut queue) = self.queue.lock() {
            queue.clear();
        }
        self.processing_count.store(0, Ordering::SeqCst);
        self.completed_count.store(0, Ordering::SeqCst);
        self.total_queued.store(0, Ordering::SeqCst);
        self.is_running.store(false, Ordering::SeqCst);
    }
}

impl Default for PdfQueue {
    fn default() -> Self {
        Self::new()
    }
}

/// Status of the PDF processing queue
#[derive(Debug, Clone, serde::Serialize)]
pub struct PdfQueueStatus {
    /// Number of PDFs waiting in queue
    pub pending: usize,
    /// Number of PDFs currently being processed
    pub processing: usize,
    /// Number of PDFs completed
    pub completed: usize,
    /// Total PDFs queued in this session
    pub total: usize,
    /// Whether background processing is active
    pub is_running: bool,
}

impl PdfQueueStatus {
    /// Get progress as a percentage (0-100)
    pub fn progress_percent(&self) -> u8 {
        if self.total == 0 {
            100
        } else {
            ((self.completed as f64 / self.total as f64) * 100.0) as u8
        }
    }
    
    /// Check if all PDFs have been processed
    pub fn is_complete(&self) -> bool {
        self.pending == 0 && self.processing == 0
    }
}
