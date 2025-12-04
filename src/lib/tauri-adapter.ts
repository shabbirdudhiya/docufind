// Types matching Rust structs
interface RustFileData {
  path: string;
  name: string;
  size: number;
  last_modified: string;
  file_type: string;
  content: string;
}

export interface FileData {
  path: string;
  name: string;
  type: "word" | "powerpoint" | "text" | "pdf" | "excel";
  size: number;
  lastModified: Date;
  content?: string;
}

export interface SearchResult {
  file: FileData;
  matches: Array<{
    text: string;
    index: number;
    context: string;
  }>;
  score: number;
}

export interface FolderInfo {
  path: string;
  fileCount: number;
}

export interface IndexStats {
  totalFiles: number;
  wordFiles: number;
  powerPointFiles: number;
  pdfFiles: number;
  excelFiles: number;
  textFiles: number;
  totalSize: number;
  folderCount: number;
  pdfQueuePending?: number;
}

export interface LoadIndexResult {
  loaded: boolean;
  message?: string;
  fileCount?: number;
  folderCount?: number;
  folders?: string[];
  excludedFolders?: string[];
}

// Folder tree node for hierarchical exclusion UI
export interface FolderNode {
  path: string;
  name: string;
  isExcluded: boolean;
  fileCount: number;
  children: FolderNode[];
}

// Search history entry
export interface SearchHistoryEntry {
  query: string;
  timestamp: string;
  resultCount: number;
}

// Search filters
export interface SearchFilters {
  fileTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  minSize?: number;
  maxSize?: number;
  folderPath?: string;
}

// PDF queue status
export interface PdfQueueStatus {
  pending: number;
  processing: number;
  completed: number;
  total: number;
  isRunning: boolean;
  progressPercent: number;
  isComplete: boolean;
}

// Event listeners
const listeners: Record<string, Function[]> = {};

const emit = (event: string, data: any) => {
  if (listeners[event]) {
    listeners[event].forEach((cb) => cb(null, data));
  }
};

// Setup Tauri event listeners
let fileChangedUnlisten: (() => void) | null = null;
let indexingProgressUnlisten: (() => void) | null = null;
let pdfProgressUnlisten: (() => void) | null = null;
let pdfCompleteUnlisten: (() => void) | null = null;
let pdfIndexedUnlisten: (() => void) | null = null;

interface IndexingProgressPayload {
  current: number;
  total: number;
  filename: string;
  phase: string; // "discovering" | "indexing" | "finalizing" | "pdf-background"
}

interface PdfProgressPayload {
  completed: number;
  total: number;
  current: string;
}

const setupTauriListeners = async () => {
  // Skip on server-side rendering
  if (typeof window === "undefined") return;
  if (fileChangedUnlisten) return;

  try {
    const { listen } = await import("@tauri-apps/api/event");

    fileChangedUnlisten = await listen<{ type: string; path: string }>(
      "file-changed",
      (event) => {
        const { type, path } = event.payload;
        if (type === "modified") {
          emit("file-updated", { filePath: path });
        } else if (type === "removed") {
          emit("file-removed", { filePath: path });
        }
      }
    );

    // Listen for indexing progress events from Rust backend
    indexingProgressUnlisten = await listen<IndexingProgressPayload>(
      "indexing-progress",
      (event) => {
        emit("indexing-progress", event.payload);
      }
    );

    // Listen for PDF background processing progress
    pdfProgressUnlisten = await listen<PdfProgressPayload>(
      "pdf-progress",
      (event) => {
        emit("pdf-progress", event.payload);
      }
    );

    // Listen for PDF processing complete
    pdfCompleteUnlisten = await listen<{ total: number }>(
      "pdf-complete",
      (event) => {
        emit("pdf-complete", event.payload);
      }
    );

    // Listen for individual PDF indexed
    pdfIndexedUnlisten = await listen<RustFileData>("pdf-indexed", (event) => {
      emit("pdf-indexed", event.payload);
    });
  } catch (e) {
    console.error("Failed to setup Tauri listeners:", e);
  }
};

// Initialize listeners only on client
if (typeof window !== "undefined") {
  setupTauriListeners();
}

export const tauriAPI = {
  // Single folder selection
  selectFolder: async (): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
    });
    return selected as string | null;
  },

  // Multiple folder selection
  selectFolders: async (): Promise<string[] | null> => {
    if (typeof window === "undefined") return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: true,
    });
    return selected as string[] | null;
  },

  // Scan single folder
  scanFolder: async (folderPath: string) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      emit("indexing-status", {
        isIndexing: true,
        message: "Scanning folder...",
      });

      const files = await invoke<RustFileData[]>("scan_folder", {
        path: folderPath,
      });

      const mappedFiles: FileData[] = files.map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        content: f.content,
        lastModified: new Date(f.last_modified),
        type: f.file_type as "word" | "powerpoint" | "text" | "pdf" | "excel",
      }));

      emit("indexing-status", { isIndexing: false });
      return { success: true, files: mappedFiles };
    } catch (e: any) {
      emit("indexing-status", { isIndexing: false });
      return { success: false, error: e.message || e };
    }
  },

  // Add multiple folders
  addFolders: async (paths: string[]) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      emit("indexing-status", {
        isIndexing: true,
        message: `Adding ${paths.length} folders...`,
      });

      interface RustFolderInfo {
        path: string;
        file_count: number;
      }

      const result = await invoke<RustFolderInfo[]>("add_folders", { paths });

      const mapped: FolderInfo[] = result.map((f) => ({
        path: f.path,
        fileCount: f.file_count,
      }));

      emit("indexing-status", { isIndexing: false });
      return { success: true, folders: mapped };
    } catch (e: any) {
      emit("indexing-status", { isIndexing: false });
      return { success: false, error: e.message || e };
    }
  },

  // Remove a folder from index
  removeFolder: async (path: string) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("remove_folder", { path });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Get indexed folders
  getIndexedFolders: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      interface RustFolderInfo {
        path: string;
        file_count: number;
      }

      const result = await invoke<RustFolderInfo[]>("get_indexed_folders");
      const mapped: FolderInfo[] = result.map((f) => ({
        path: f.path,
        fileCount: f.file_count,
      }));
      return { success: true, folders: mapped };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Get index statistics
  getIndexStats: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const stats = await invoke<IndexStats>("get_index_stats");
      return { success: true, stats };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Get all indexed files (for Files view)
  getAllFiles: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const files = await invoke<RustFileData[]>("get_all_files");
      const mappedFiles: FileData[] = files.map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        lastModified: new Date(f.last_modified),
        type: f.file_type as "word" | "powerpoint" | "text" | "pdf" | "excel",
      }));
      return { success: true, files: mappedFiles };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Save index to disk for persistence
  saveIndex: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("save_index");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Load index from disk
  loadIndex: async (): Promise<{
    success: boolean;
    loaded?: boolean;
    message?: string;
    fileCount?: number;
    folderCount?: number;
    folders?: string[];
    excludedFolders?: string[];
    error?: string;
  }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const result = await invoke<LoadIndexResult>("load_index");
      return { success: true, ...result };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Get excluded folders
  getExcludedFolders: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const folders = await invoke<string[]>("get_excluded_folders");
      return { success: true, folders };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Add folder to exclusion list (excluded from search results)
  addExcludedFolder: async (path: string) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("add_excluded_folder", { path });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Remove folder from exclusion list
  removeExcludedFolder: async (path: string) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("remove_excluded_folder", { path });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Clear entire index
  clearIndex: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("clear_index");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  searchFiles: async (query: string, folderPath: string | null) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      // Rust returns SearchResult with RustFileData
      interface RustSearchResult {
        file: RustFileData;
        matches: Array<{ text: string; index: number; context: string }>;
        score: number;
      }

      const results = await invoke<RustSearchResult[]>("search_index", {
        query,
      });
      console.log("Raw Rust results:", results);

      const mappedResults: SearchResult[] = results.map((r) => ({
        file: {
          path: r.file?.path || "",
          name: r.file?.name || "",
          size: r.file?.size || 0,
          content: r.file?.content || "",
          lastModified: r.file?.last_modified
            ? new Date(r.file.last_modified)
            : new Date(),
          type:
            (r.file?.file_type as
              | "word"
              | "powerpoint"
              | "text"
              | "pdf"
              | "excel") || "text",
        },
        matches: (r.matches || []).map((m) => ({
          text: m?.text || "",
          index: m?.index || 0,
          context: m?.context || "",
        })),
        score: r.score || 0,
      }));

      return { success: true, results: mappedResults };
    } catch (e: any) {
      console.error("Search error:", e);
      return { success: false, error: e.message || String(e) };
    }
  },

  extractContent: async (filePath: string) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const content = await invoke<string>("extract_file_content", {
        filePath,
      });
      return { success: true, content };
    } catch (e: any) {
      console.error("Extract content error:", e);
      return { success: false, error: e.message || String(e) };
    }
  },

  startWatching: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("start_watching");
      return { success: true };
    } catch (e: any) {
      console.error("Start watching error:", e);
      return { success: false, error: e.message || String(e) };
    }
  },

  stopWatching: async () => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("stop_watching");
      return { success: true };
    } catch (e: any) {
      console.error("Stop watching error:", e);
      return { success: false, error: e.message || String(e) };
    }
  },

  openFile: async (filePath: string) => {
    if (typeof window === "undefined") return;
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("open_file", { filePath });
    } catch (e: any) {
      console.error("Open file error:", e);
      throw e;
    }
  },

  openFileLocation: async (filePath: string) => {
    if (typeof window === "undefined") return;
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("show_in_folder", { filePath });
    } catch (e: any) {
      console.error("Show in folder error:", e);
      throw e;
    }
  },

  deleteFile: async (filePath: string) => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("delete_file", { filePath });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || String(e) };
    }
  },

  onFileAdded: (cb: Function) => {
    listeners["file-added"] = listeners["file-added"] || [];
    listeners["file-added"].push(cb);
  },
  onFileUpdated: (cb: Function) => {
    listeners["file-updated"] = listeners["file-updated"] || [];
    listeners["file-updated"].push(cb);
  },
  onFileRemoved: (cb: Function) => {
    listeners["file-removed"] = listeners["file-removed"] || [];
    listeners["file-removed"].push(cb);
  },
  onIndexingStatus: (cb: Function) => {
    listeners["indexing-status"] = listeners["indexing-status"] || [];
    listeners["indexing-status"].push(cb);
  },
  onIndexingProgress: (cb: Function) => {
    listeners["indexing-progress"] = listeners["indexing-progress"] || [];
    listeners["indexing-progress"].push(cb);
  },
  onPdfProgress: (cb: Function) => {
    listeners["pdf-progress"] = listeners["pdf-progress"] || [];
    listeners["pdf-progress"].push(cb);
  },
  onPdfComplete: (cb: Function) => {
    listeners["pdf-complete"] = listeners["pdf-complete"] || [];
    listeners["pdf-complete"].push(cb);
  },
  onPdfIndexed: (cb: Function) => {
    listeners["pdf-indexed"] = listeners["pdf-indexed"] || [];
    listeners["pdf-indexed"].push(cb);
  },
  onPdfSkipped: (cb: Function) => {
    listeners["pdf-skipped"] = listeners["pdf-skipped"] || [];
    listeners["pdf-skipped"].push(cb);
  },
  removeAllListeners: (channel: string) => {
    delete listeners[channel];
  },

  // ========== NEW APIs ==========

  // Get folder tree for hierarchical exclusion UI
  getFolderTree: async (): Promise<{
    success: boolean;
    tree?: FolderNode[];
    error?: string;
  }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      interface RustFolderNode {
        path: string;
        name: string;
        is_excluded: boolean;
        file_count: number;
        children: RustFolderNode[];
      }

      const mapNode = (node: RustFolderNode): FolderNode => ({
        path: node.path,
        name: node.name,
        isExcluded: node.is_excluded,
        fileCount: node.file_count,
        children: node.children.map(mapNode),
      });

      const result = await invoke<RustFolderNode[]>("get_folder_tree");
      return { success: true, tree: result.map(mapNode) };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Toggle folder exclusion (returns new state)
  toggleFolderExclusion: async (
    path: string
  ): Promise<{ success: boolean; isExcluded?: boolean; error?: string }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const isExcluded = await invoke<boolean>("toggle_folder_exclusion", {
        path,
      });
      return { success: true, isExcluded };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Batch exclude folders
  excludeFoldersBatch: async (
    paths: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("exclude_folders_batch", { paths });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Batch include folders (remove from exclusion)
  includeFoldersBatch: async (
    paths: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("include_folders_batch", { paths });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Get PDF queue status
  getPdfQueueStatus: async (): Promise<{
    success: boolean;
    status?: PdfQueueStatus;
    error?: string;
  }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const status = await invoke<PdfQueueStatus>("get_pdf_queue_status");
      return { success: true, status };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Get search history
  getSearchHistory: async (
    count?: number
  ): Promise<{
    success: boolean;
    history?: SearchHistoryEntry[];
    error?: string;
  }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      const history = await invoke<SearchHistoryEntry[]>("get_search_history", {
        count,
      });
      return { success: true, history };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Clear search history
  clearSearchHistory: async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("clear_search_history");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },

  // Remove specific item from search history
  removeFromSearchHistory: async (
    query: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof window === "undefined") {
      return { success: false, error: "Not available during SSR" };
    }
    const { invoke } = await import("@tauri-apps/api/core");

    try {
      await invoke("remove_from_search_history", { query });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || e };
    }
  },
};
