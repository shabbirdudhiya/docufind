Local Document Search Desktop App
A modern, powerful desktop application for searching through your local Microsoft Word, PowerPoint, and text files instantly.

Features
Local File System Access: Direct access to your local folders and files
Multiple File Formats: Support for .docx, .pptx, .txt, and .md files
Real-time Search: Instant search with relevance scoring
File Watching: Automatic updates when files change
Modern UI: Clean, professional interface with statistics
Cross-platform: Works on Windows, macOS, and Linux
Installation
Install dependencies:
bash

Line Wrapping

Collapse
Copy
1
npm install
Running the Application
Development Mode
To run the desktop app in development mode:

bash

Line Wrapping

Collapse
Copy
1
npm run electron-dev
This will:

Start the Next.js development server
Launch the Electron desktop app
Enable hot reloading for both frontend and backend
Production Build
To build the application for distribution:

bash

Line Wrapping

Collapse
Copy
1
2
3
4
5

# Build the Next.js app

npm run build

# Package the Electron app

npm run electron-build
This will create distributable packages in the dist/ folder for your platform.

Usage
Select a Folder: Click "Select Folder" to choose a directory containing your documents
Scan Files: The app will automatically scan and index supported file types
Search: Enter your search terms and click "Search" to find matching content
View Results: Browse through search results with highlighted matches and relevance scores
Real-time Updates: Enable "Watch" to automatically update the index when files change
Supported File Types
Microsoft Word: .docx files
Microsoft PowerPoint: .pptx files
Text Files: .txt, .md files
Architecture
Frontend: Next.js 15 with TypeScript and Tailwind CSS
Desktop Framework: Electron for cross-platform desktop functionality
UI Components: shadcn/ui component library
File Processing: mammoth (Word), pptx2json (PowerPoint)
File Watching: chokidar for real-time file system monitoring
Development Scripts
npm run dev - Start Next.js development server only
npm run electron-dev - Start Electron app with development server
npm run electron - Run Electron app (requires built Next.js app)
npm run build - Build Next.js app for production
npm run electron-build - Build Electron app for distribution
npm run lint - Run ESLint code quality check
File Structure

Line Wrapping

Collapse
Copy
1
2
3
4
5
6
7
8
9
├── public/
│ ├── electron.js # Main Electron process
│ ├── preload.js # Electron preload script
│ └── icon.png # App icon
├── src/
│ └── app/
│ └── page.tsx # Main React component
├── package.json # Dependencies and scripts
└── README.md # This file
How It Works
Electron Main Process (public/electron.js):
Handles file system access
Manages folder selection dialogs
Scans and indexes files
Processes file content extraction
Watches for file changes
Electron Preload Script (public/preload.js):
Provides secure bridge between main and renderer processes
Exposes file system APIs to the frontend
React Frontend (src/app/page.tsx):
Modern UI with file selection and search
Real-time statistics and progress indicators
Search results with highlighting and relevance scoring
Security
The app uses Electron's context isolation and secure preload scripts to ensure safe file system access while maintaining security best practices.

Performance
Efficient file scanning with progress indicators
Optimized search with relevance scoring
Real-time file watching without blocking the UI
Memory-efficient content extraction
Troubleshooting
App doesn't start: Make sure you have Node.js installed and run npm install first.

File access denied: Ensure the app has permission to access the selected folder.

Search not working: Make sure files are properly indexed and supported formats are used.

Build issues: Clear the node_modules and .next folders, then reinstall dependencies.

License
This project is for local use and demonstration purposes.
