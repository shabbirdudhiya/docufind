//! Tauri command handlers
//! 
//! All Tauri commands exposed to the frontend are defined here.
//! Split into submodules by functionality.

mod scanning;
mod search;
mod files;
mod folders;
mod persistence;

pub use scanning::*;
pub use search::*;
pub use files::*;
pub use folders::*;
pub use persistence::*;
