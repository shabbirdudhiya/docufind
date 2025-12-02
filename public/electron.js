const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const chokidar = require("chokidar");
const mammoth = require("mammoth");
const pptx2json = require("pptx2json");

let mainWindow;
let fileWatcher;
let indexedFiles = new Map();

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

  // Load the app
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
    const files = await scanFolder(folderPath);
    return { success: true, files };
  } catch (error) {
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
    const results = await searchInFiles(query, folderPath);
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
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
  });

  fileWatcher.on("add", async (filePath) => {
    if (isSupportedFile(filePath)) {
      const content = await extractFileContent(filePath);
      indexedFiles.set(filePath, {
        path: filePath,
        content,
        lastModified: Date.now(),
      });
      mainWindow.webContents.send("file-added", { filePath, content });
    }
  });

  fileWatcher.on("change", async (filePath) => {
    if (isSupportedFile(filePath)) {
      const content = await extractFileContent(filePath);
      indexedFiles.set(filePath, {
        path: filePath,
        content,
        lastModified: Date.now(),
      });
      mainWindow.webContents.send("file-updated", { filePath, content });
    }
  });

  fileWatcher.on("unlink", (filePath) => {
    indexedFiles.delete(filePath);
    mainWindow.webContents.send("file-removed", { filePath });
  });
});

ipcMain.handle("stop-watching", async () => {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
});

async function scanFolder(folderPath) {
  const supportedExtensions = [".docx", ".pptx", ".txt", ".md"];
  const files = [];

  async function scanDirectory(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile()) {
        // Skip temporary files (Word creates ~$ prefixed temp files)
        if (entry.name.startsWith('~$')) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          const stats = await fs.stat(fullPath);
          files.push({
            path: fullPath,
            name: entry.name,
            size: stats.size,
            lastModified: stats.mtime,
            type: getFileType(ext),
          });
        }
      }
    }
  }

  await scanDirectory(folderPath);
  return files;
}

function getFileType(ext) {
  switch (ext) {
    case ".docx":
      return "word";
    case ".pptx":
      return "powerpoint";
    case ".txt":
    case ".md":
      return "text";
    default:
      return "unknown";
  }
}

function isSupportedFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);
  // Skip temporary files (Word creates ~$ prefixed temp files)
  if (fileName.startsWith('~$')) {
    return false;
  }
  return [".docx", ".pptx", ".txt", ".md"].includes(ext);
}

async function extractFileContent(filePath) {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
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
    return textMatches
      .map((match) => match.replace(/<\/?a:t>/g, ""))
      .join("\n");
  } catch (error) {
    return "";
  }
}

async function searchInFiles(query, folderPath) {
  const files = await scanFolder(folderPath);
  const searchTerms = query
    .toLowerCase()
    .split(" ")
    .filter((term) => term.length > 0);
  const results = [];

  for (const file of files) {
    try {
      const content = await extractFileContent(file.path);
      const contentLower = content.toLowerCase();
      const matches = [];
      let totalScore = 0;

      for (const term of searchTerms) {
        const termRegex = new RegExp(term, "gi");
        let match;

        while ((match = termRegex.exec(content)) !== null) {
          const startIndex = Math.max(0, match.index - 100);
          const endIndex = Math.min(
            content.length,
            match.index + match[0].length + 100
          );
          const context = content.substring(startIndex, endIndex);

          matches.push({
            text: match[0],
            index: match.index,
            context: context.trim(),
          });
        }

        const termCount = (contentLower.match(new RegExp(term, "g")) || [])
          .length;
        totalScore += termCount;
      }

      if (matches.length > 0) {
        const density = matches.length / (content.length / 1000);
        const normalizedScore = Math.min(
          1,
          (totalScore * 0.7 + density * 0.3) / 10
        );

        matches.sort((a, b) => {
          const aExact = searchTerms.some(
            (term) => a.text.toLowerCase() === term
          );
          const bExact = searchTerms.some(
            (term) => b.text.toLowerCase() === term
          );
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return a.index - b.index;
        });

        results.push({
          file,
          matches: matches.slice(0, 10),
          score: normalizedScore,
        });
      }
    } catch (error) {
      console.error(`Error searching in ${file.path}:`, error);
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
