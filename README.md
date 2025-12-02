# DocuFind

<p align="center">
  <img src="public/icon.svg" alt="DocuFind Logo" width="128" height="128">
</p>

<p align="center">
  <strong>A powerful desktop app for searching through your local documents instantly</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#keyboard-shortcuts">Shortcuts</a> •
  <a href="#development">Development</a> •
  <a href="#building">Building</a>
</p>

---

## ✨ Features

### 🔍 Powerful Search

- **Full-text search** across Word (.docx), PowerPoint (.pptx), Text (.txt), and Markdown (.md) files
- **Real-time indexing** - automatically updates when files change
- **Relevance scoring** - results sorted by match quality
- **Context highlighting** - see where your search terms appear

### 🎛️ Advanced Filters

- **File type filter** - Search only Word, PowerPoint, or Text files
- **Date range filter** - Find files modified today, this week, month, or year
- **File size filter** - Set minimum and maximum file size ranges

### 📚 Search History

- Saves your last 10 searches for quick access
- One-click to re-run previous searches
- Clear history when needed

### 👁️ Document Preview

- Preview full document content without opening external apps
- RTL language support for Arabic, Hebrew, and Persian text
- Quick actions to open file or reveal in explorer

### ⌨️ Keyboard Shortcuts

| Shortcut   | Action                |
| ---------- | --------------------- |
| `Ctrl + F` | Focus search input    |
| `Ctrl + O` | Open folder           |
| `Ctrl + H` | Toggle search history |
| `Ctrl + D` | Toggle dark mode      |
| `Ctrl + /` | Show shortcuts help   |
| `Escape`   | Close modals          |

### 🎨 Modern UI

- **Glassmorphism design** with 2025 trends
- **Dark/Light mode** with system preference detection
- **RTL support** for right-to-left languages
- **Smooth animations** and micro-interactions

---

## 📦 Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Download Pre-built Release

Download the latest release for your platform:

- **Windows**: `DocuFind-Setup-1.0.0.exe`
- **macOS**: `DocuFind-1.0.0.dmg`
- **Linux**: `DocuFind-1.0.0.AppImage`

### Install from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/docufind.git
cd docufind

# Install dependencies
npm install

# Run in development mode
npm run electron-dev
```

---

## 🚀 Usage

### Getting Started

1. **Launch DocuFind** - Open the application
2. **Select a Folder** - Click "Select Folder" to choose a directory containing your documents
3. **Wait for Indexing** - DocuFind will scan and index all supported files
4. **Search** - Type your search query and press Enter or click Search

### Supported File Types

| Type           | Extensions | Features                 |
| -------------- | ---------- | ------------------------ |
| Word Documents | `.docx`    | Full text extraction     |
| PowerPoint     | `.pptx`    | Slide content extraction |
| Text Files     | `.txt`     | Plain text search        |
| Markdown       | `.md`      | Plain text search        |

### Using Filters

1. Click the **Filter** button in the search bar
2. Select your preferred filters:
   - **File Type**: All, Word, PowerPoint, or Text
   - **Date Modified**: Any time, Today, Week, Month, Year
   - **File Size**: Drag the slider to set size range
3. Click "Reset Filters" to clear all filters

### Real-time Watching

Enable "Watch" mode to automatically update the index when files are added, modified, or deleted in the selected folder.

---

## 💻 Development

### Project Structure

```
docufind/
├── public/
│   ├── electron.js      # Electron main process
│   ├── preload.js       # Electron preload script
│   └── icon.svg         # App icon
├── src/
│   ├── app/
│   │   ├── page.tsx     # Main app component
│   │   ├── layout.tsx   # Root layout
│   │   └── globals.css  # Global styles
│   ├── components/
│   │   └── ui/          # shadcn/ui components
│   └── lib/
│       └── utils.ts     # Utility functions
├── package.json
└── README.md
```

### Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **UI**: Tailwind CSS, shadcn/ui, Radix UI
- **Desktop**: Electron 39
- **Document Parsing**: mammoth (Word), pptx2json (PowerPoint)
- **File Watching**: chokidar

### Scripts

```bash
# Development
npm run dev              # Start Next.js dev server
npm run electron-dev     # Start Electron + Next.js

# Building
npm run build           # Build Next.js
npm run electron-build  # Build Electron app
npm run dist            # Create distributable

# Testing
npm run test            # Run tests
npm run lint            # Run ESLint
```

---

## 🏗️ Building

### Build for Current Platform

```bash
npm run dist
```

### Build for Specific Platform

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

### Build Output

Distributable files will be created in the `dist/` folder:

| Platform         | File                          |
| ---------------- | ----------------------------- |
| Windows          | `DocuFind-Setup-1.0.0.exe`    |
| Windows Portable | `DocuFind-1.0.0-portable.exe` |
| macOS            | `DocuFind-1.0.0.dmg`          |
| Linux            | `DocuFind-1.0.0.AppImage`     |
| Linux Debian     | `docufind_1.0.0_amd64.deb`    |

---

## 📤 Publishing

### GitHub Releases

1. Create a new release on GitHub
2. Upload the built files from `dist/`
3. Add release notes

### Windows Store

1. Create a Windows Developer account
2. Package as MSIX using electron-builder
3. Submit to Microsoft Store

### Mac App Store

1. Enroll in Apple Developer Program
2. Sign the app with your certificate
3. Submit via App Store Connect

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Shabbir Dudhiya**

---

## 🙏 Acknowledgments

- [Electron](https://electronjs.org/)
- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [mammoth.js](https://github.com/mwilliamson/mammoth.js)

---

<p align="center">
  Made with ❤️ by Shabbir Dudhiya
</p>

1. **Electron Main Process** (`public/electron.js`):

   - Handles file system access
   - Manages folder selection dialogs
   - Scans and indexes files
   - Processes file content extraction
   - Watches for file changes

2. **Electron Preload Script** (`public/preload.js`):

   - Provides secure bridge between main and renderer processes
   - Exposes file system APIs to the frontend

3. **React Frontend** (`src/app/page.tsx`):
   - Modern UI with file selection and search
   - Real-time statistics and progress indicators
   - Search results with highlighting and relevance scoring

## Security

The app uses Electron's context isolation and secure preload scripts to ensure safe file system access while maintaining security best practices.

## Performance

- Efficient file scanning with progress indicators
- Optimized search with relevance scoring
- Real-time file watching without blocking the UI
- Memory-efficient content extraction

## Troubleshooting

**App doesn't start**: Make sure you have Node.js installed and run `npm install` first.

**File access denied**: Ensure the app has permission to access the selected folder.

**Search not working**: Make sure files are properly indexed and supported formats are used.

**Build issues**: Clear the `node_modules` and `.next` folders, then reinstall dependencies.

## License

This project is for local use and demonstration purposes.
