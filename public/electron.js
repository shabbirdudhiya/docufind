const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const chokidar = require("chokidar");
const mammoth = require("mammoth");
const pptx2json = require("pptx2json");
const { Document } = require("flexsearch");

let mainWindow;
let fileWatcher;
let indexedFiles = new Map();
let searchIndex = new Document({
  document: {
    id: "id",
    index: ["content", "name"],
    store: ["path", "name", "size", "lastModified", "type", "content"]
  },
  tokenize: "forward"
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    titleBarStyle: "hiddenInset",
    show: false,
    icon: path.join(__dirname, "../public/icon.png"),
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../build/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (fileWatcher) {
      fileWatcher.close();
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select a folder to search documents",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle("scan-folder", async (event, folderPath) => {
  try {
    // Reset index on new scan
    indexedFiles.clear();
    searchIndex = new Document({
      document: {
        id: "id",
        index: ["content", "name"],
        store: ["path", "name", "size", "lastModified", "type", "content"]
      },
      tokenize: "forward"
    });
    
    mainWindow.webContents.send("indexing-status", { isIndexing: true });
    const files = await scanFolder(folderPath);
    mainWindow.webContents.send("indexing-status", { isIndexing: false });
    
    return { success: true, files };
  } catch (error) {
    mainWindow.webContents.send("indexing-status", { isIndexing: false });
    return { success: false, error: error.message };
  }
});

ipcMain.handle("extract-content", async (event, filePath) => {
  try {
    const content = await extractFileContent(filePath);
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("search-files", async (event, query, folderPath) => {
  try {
    const results = await searchInFiles(query);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-file", async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-file-location", async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("start-watching", async (event, folderPath) => {
  if (fileWatcher) {
    fileWatcher.close();
  }

  fileWatcher = chokidar.watch(folderPath, {
    ignored: [/(^|[\/\\])\../, /(^|[\/\\])~\$/],
    persistent: true,
    ignoreInitial: true,
  });

  fileWatcher.on("add", async (filePath) => {
    if (isSupportedFile(filePath)) {
      await indexFile(filePath);
      const fileData = indexedFiles.get(filePath);
      if (fileData) {
        mainWindow.webContents.send("file-added", { filePath, content: fileData.content });
      }
    }
  });

  fileWatcher.on("change", async (filePath) => {
    if (isSupportedFile(filePath)) {
      await indexFile(filePath);
      const fileData = indexedFiles.get(filePath);
      if (fileData) {
        mainWindow.webContents.send("file-updated", { filePath, content: fileData.content });
      }
    }
  });

  fileWatcher.on("unlink", (filePath) => {
    indexedFiles.delete(filePath);
    searchIndex.remove(filePath); // Assuming path is used as ID, but we use generated ID. Need map.
    // For simplicity in this version, we might need to re-scan or handle ID mapping better.
    // Re-scanning is safest for now to keep IDs in sync, or we map path -> ID.
    // Let's implement path -> ID mapping.
    const id = Buffer.from(filePath).toString('base64');
    searchIndex.remove(id);
    mainWindow.webContents.send("file-removed", { filePath });
  });
});

ipcMain.handle("stop-watching", async () => {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
});

async function indexFile(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size === 0) return null;

    const content = await extractFileContent(filePath);
    if (!content) return null;

    const name = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = getFileType(ext);
    const id = Buffer.from(filePath).toString('base64');

    const doc = {
      id,
      path: filePath,
      name,
      size: stats.size,
      lastModified: stats.mtime,
      type,
      content
    };

    searchIndex.add(doc);
    
    // Optimization: Do not store full content in indexedFiles map to save memory
    // We only need metadata for the file list
    const metadata = { ...doc };
    delete metadata.content;
    indexedFiles.set(filePath, metadata);
    
    return doc;
  } catch (err) {
    console.error(`Failed to index ${filePath}:`, err);
    return null;
  }
}

async function scanFolder(folderPath) {
  const supportedExtensions = [".docx", ".pptx", ".txt", ".md"];
  
  // Phase 1: Discovery (Fast)
  mainWindow.webContents.send("indexing-status", { isIndexing: true, message: "Discovering files..." });
  const filePaths = await getAllFilePaths(folderPath, supportedExtensions);
  
  const totalFiles = filePaths.length;
  const files = [];

  // Phase 2: Indexing (Slow)
  for (let i = 0; i < totalFiles; i++) {
    const filePath = filePaths[i];
    const fileName = path.basename(filePath);
    
    // Emit progress
    mainWindow.webContents.send("indexing-progress", {
      current: i + 1,
      total: totalFiles,
      filename: fileName
    });

    const doc = await indexFile(filePath);
    if (doc) {
      files.push({
        path: doc.path,
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        type: doc.type,
      });
    }
  }

  return files;
}

async function getAllFilePaths(dirPath, supportedExtensions) {
  let results = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) { // Skip hidden folders
          results = results.concat(await getAllFilePaths(fullPath, supportedExtensions));
        }
      } else if (entry.isFile()) {
        if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          // Check for 0-byte files here to avoid adding them to the list
          try {
            const stats = await fs.stat(fullPath);
            if (stats.size > 0) {
              results.push(fullPath);
            }
          } catch (e) {
            // Ignore file if stat fails
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}:`, err);
  }
  return results;
}

function getFileType(ext) {
  switch (ext) {
    case ".docx": return "word";
    case ".pptx": return "powerpoint";
    case ".txt":
    case ".md": return "text";
    default: return "unknown";
  }
}

function isSupportedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  if (fileName.startsWith('~$') || fileName.startsWith('.')) {
    return false;
  }
  return [".docx", ".pptx", ".txt", ".md"].includes(ext);
}

async function extractFileContent(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    if (!buffer || buffer.length === 0) return "";

    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".docx") {
      try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch (err) {
        return "";
      }
    } else if (ext === ".pptx") {
      try {
        const pptx = await pptx2json.parse(buffer);
        return extractTextFromPptx(pptx);
      } catch (error) {
        return extractPptxFallback(buffer);
      }
    } else if (ext === ".txt" || ext === ".md") {
      return buffer.toString("utf-8");
    }
  } catch (error) {
    return "";
  }
  return "";
}

function extractTextFromPptx(pptx) {
  try {
    const textContent = [];
    if (pptx.slides && Array.isArray(pptx.slides)) {
      pptx.slides.forEach((slide) => {
        if (slide.elements && Array.isArray(slide.elements)) {
          slide.elements.forEach((element) => {
            if (element.type === "text" && element.content) {
              textContent.push(element.content);
            }
          });
        }
      });
    }
    return textContent.join("\n");
  } catch (error) {
    return "";
  }
}

function extractPptxFallback(buffer) {
  try {
    const text = buffer.toString("utf-8");
    const textMatches = text.match(/<a:t>([^<]+)<\/a:t>/g) || [];
    return textMatches.map((match) => match.replace(/<\/?a:t>/g, "")).join("\n");
  } catch (error) {
    return "";
  }
}

async function searchInFiles(query) {
  if (!query) return [];
  
  // Search in FlexSearch
  const searchResults = searchIndex.search(query, {
    limit: 100,
    enrich: true
  });

  // Flatten results from different fields (content, name)
  const uniqueDocs = new Map();
  
  searchResults.forEach(fieldResult => {
    fieldResult.result.forEach(doc => {
      if (!uniqueDocs.has(doc.id)) {
        uniqueDocs.set(doc.id, doc.doc);
      }
    });
  });

  const results = [];
  const searchTerms = query.toLowerCase().split(" ").filter(t => t.length > 0);

  for (const doc of uniqueDocs.values()) {
    const content = doc.content;
    const matches = [];
    
    // Generate snippets (FlexSearch doesn't provide context snippets automatically in a way we want)
    for (const term of searchTerms) {
      const termRegex = new RegExp(term, "gi");
      let match;
      let count = 0;
      while ((match = termRegex.exec(content)) !== null && count < 5) { // Limit matches per term
        const startIndex = Math.max(0, match.index - 60);
        const endIndex = Math.min(content.length, match.index + match[0].length + 60);
        const context = content.substring(startIndex, endIndex);
        matches.push({
          text: match[0],
          index: match.index,
          context: context.trim()
        });
        count++;
      }
    }

    if (matches.length > 0 || searchTerms.some(t => doc.name.toLowerCase().includes(t))) {
       results.push({
        file: {
          path: doc.path,
          name: doc.name,
          size: doc.size,
          lastModified: doc.lastModified,
          type: doc.type
        },
        matches: matches.slice(0, 5), // Limit total matches returned
        score: 1 // FlexSearch handles ranking, but we can refine if needed
      });
    }
  }

  return results;
}
