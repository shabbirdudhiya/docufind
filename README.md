# DocuFind

<p align="center">
  <img src="public/icon.svg" width="128" height="128" alt="DocuFind Logo">
</p>

<p align="center">
  <strong>A blazing-fast desktop app for searching through local documents instantly</strong>
</p>

<p align="center">
  Built with Tauri + Next.js + Rust for maximum performance and minimal footprint
</p>

---

## ✨ Features

- 🔍 **Instant Full-Text Search** - Powered by [Tantivy](https://github.com/quickwit-oss/tantivy) (Rust's Lucene equivalent)
- 📄 **Multiple Formats** - Search through `.doc`, `.docx`, `.pptx`, `.xlsx`, `.txt`, and `.md` files
- 📁 **Multi-Folder Support** - Index multiple folders simultaneously
- 👁️ **File Preview** - Preview document contents without opening them
- 🔄 **Real-time Watching** - Automatic re-indexing when files change
- 🗑️ **Safe Delete** - Move files to system trash
- 📂 **Quick Access** - Open files or reveal in explorer
- 🔄 **Auto-Update** - Automatic updates via GitHub releases
- 🚀 **Blazing Fast** - Rust backend with parallel processing
- 💾 **Tiny Footprint** - ~10MB installer vs 100MB+ for Electron

## 📸 Screenshots

_Coming soon_

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri Prerequisites](https://tauri.app/v2/guides/getting-started/prerequisites/)

### Installation

```bash
# Clone the repository
git clone https://github.com/shabbirdudhiya/docufind.git
cd docufind

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Building for Production

```bash
# Build the app
npm run tauri build
```

The installer will be in `src-tauri/target/release/bundle/`.

## 🏗️ Architecture

```
docufind-tauri/
├── src/                    # Next.js frontend
│   ├── app/               # App router pages
│   ├── components/        # React components
│   └── lib/               # Utilities & Tauri adapter
├── src-tauri/             # Rust backend
│   ├── src/
│   │   └── lib.rs        # Core logic (search, indexing, file ops)
│   └── tauri.conf.json   # Tauri configuration
└── public/               # Static assets
```

### Tech Stack

| Layer            | Technology                                   |
| ---------------- | -------------------------------------------- |
| Frontend         | Next.js 15, React 19, TailwindCSS, shadcn/ui |
| Backend          | Rust, Tauri v2                               |
| Search Engine    | Tantivy (full-text search)                   |
| File Watching    | notify crate                                 |
| Document Parsing | xml-rs, zip                                  |

## 🔧 Configuration

### Supported File Types

| Extension | Type                   |
| --------- | ---------------------- |
| `.doc`    | Microsoft Word 97-2003 |
| `.docx`   | Microsoft Word         |
| `.pptx`   | Microsoft PowerPoint   |
| `.xlsx`   | Microsoft Excel        |
| `.txt`    | Plain Text             |
| `.md`     | Markdown               |

### Auto-Update

Auto-update is configured to check GitHub releases. See [PUBLISHING.md](./PUBLISHING.md) for details.

## 📦 Publishing

See [PUBLISHING.md](./PUBLISHING.md) for detailed instructions on:

- Code signing (self-signed & OV certificates)
- Building release packages
- Setting up GitHub Actions CI/CD
- Managing auto-updates

## 🛠️ Development

### Commands

| Command                     | Description                 |
| --------------------------- | --------------------------- |
| `npm run tauri dev`         | Start development server    |
| `npm run tauri build`       | Build for production        |
| `npm run tauri icon <path>` | Generate app icons from PNG |

### Project Structure

- **Frontend** (`src/`): React components, pages, and styling
- **Backend** (`src-tauri/src/lib.rs`): All Rust logic including:
  - File scanning with `walkdir`
  - Content extraction (DOCX, PPTX via XML parsing)
  - Tantivy full-text search
  - File watching with `notify`
  - Trash support with `trash` crate

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing desktop framework
- [Tantivy](https://github.com/quickwit-oss/tantivy) - For the powerful search engine
- [shadcn/ui](https://ui.shadcn.com/) - For beautiful UI components

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/shabbirdudhiya">Shabbir Dudhiya</a>
</p>
