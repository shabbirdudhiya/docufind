# DocuFind Copilot Instructions

## 🏗 Architecture Overview

DocuFind is a local desktop document search application built with **Tauri**, **Next.js**, and **Rust**.

- **Frontend**: Next.js (Static Export), React, Tailwind CSS, Shadcn UI.
- **Backend**: Rust (Tauri). Handles file system operations, indexing, and search.
- **Database**: SQLite (via `rusqlite` in Rust) using FTS5 for full-text search.
- **Bridge**: `src/lib/tauri-adapter.ts` serves as the typed interface between Frontend and Backend.

### Key Components

- **Search Engine**: Primary search uses **SQLite FTS5** for high performance and multi-language support (including Arabic/Chinese). Fallback to direct content search if FTS5 fails.
- **Document Parsing**: Custom extractors in `src-tauri/src/extractors/` convert DOCX, PPTX, XLSX, etc., into structured content.
- **State Management**: Rust `AppState` manages the database connection and indexing status.

## 🛠 Developer Workflows

- **Development**: Run `npm run tauri dev` to start both Next.js and Tauri.
- **Build**: `npm run tauri build`. Note that Next.js is configured for `output: 'export'` (SSG).
- **Database**: The SQLite database (`docufind.db`) is managed by the Rust backend.
  - _Note_: `package.json` includes Prisma, but the core search logic uses `rusqlite` directly for FTS5 capabilities.

## 🧩 Patterns & Conventions

### Frontend-Backend Communication

1.  **Commands**: Define Rust commands in `src-tauri/src/commands/`.
2.  **Exposure**: Register commands in `src-tauri/src/lib.rs` inside `tauri::generate_handler!`.
3.  **Invocation**: Use `tauriAPI.invoke` in `src/lib/tauri-adapter.ts`. **Always** update the TypeScript interfaces in `tauri-adapter.ts` when changing Rust structs.

### Rust Backend

- **Command Structure**: Group commands by domain (e.g., `search.rs`, `scanning.rs`) in `src-tauri/src/commands/`.
- **Error Handling**: Return `Result<T, String>` for commands to propagate errors to the frontend.
- **Async**: Most commands should be `async` to avoid blocking the main thread.

### Frontend (Next.js)

- **Client Components**: Since this is a Tauri app, most pages/components should be `'use client'`.
- **UI Components**: Use `src/components/ui/` (Shadcn) for consistent design.
- **Icons**: Use `lucide-react`.

## ⚠️ Critical Implementation Details

- **Search Strategy**: The code explicitly prefers SQLite FTS5 over other methods. When modifying search logic, check `src-tauri/src/commands/search.rs`.
- **File Watching**: Handled by `notify` crate in `src-tauri/src/watcher.rs`. Events are emitted to frontend via `file-changed`.
- **Indexing**: Progress is reported via `indexing-progress` event.

## 📂 Key Files

- `src/lib/tauri-adapter.ts`: The API layer.
- `src-tauri/src/commands/search.rs`: Core search logic.
- `src-tauri/src/models.rs`: Shared data structures.
- `src-tauri/tauri.conf.json`: App configuration.
