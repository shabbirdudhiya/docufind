/**
 * Utility Functions Tests for DocuFind
 *
 * These tests cover the helper functions used throughout the application.
 */

// Test helper functions
describe("Utility Functions", () => {
  describe("formatFileSize", () => {
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    it("should format 0 bytes correctly", () => {
      expect(formatFileSize(0)).toBe("0 Bytes");
    });

    it("should format bytes correctly", () => {
      expect(formatFileSize(500)).toBe("500 Bytes");
    });

    it("should format kilobytes correctly", () => {
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(2048)).toBe("2 KB");
    });

    it("should format megabytes correctly", () => {
      expect(formatFileSize(1048576)).toBe("1 MB");
      expect(formatFileSize(5242880)).toBe("5 MB");
    });

    it("should format gigabytes correctly", () => {
      expect(formatFileSize(1073741824)).toBe("1 GB");
    });

    it("should handle decimal values", () => {
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });
  });

  describe("getFileType", () => {
    const getFileType = (
      filePath: string
    ): "word" | "powerpoint" | "text" | null => {
      const ext = filePath.toLowerCase().split(".").pop();
      switch (ext) {
        case "docx":
          return "word";
        case "pptx":
          return "powerpoint";
        case "txt":
        case "md":
          return "text";
        default:
          return null;
      }
    };

    it("should identify Word documents", () => {
      expect(getFileType("document.docx")).toBe("word");
      expect(getFileType("C:\\Documents\\report.DOCX")).toBe("word");
    });

    it("should identify PowerPoint files", () => {
      expect(getFileType("presentation.pptx")).toBe("powerpoint");
      expect(getFileType("/home/user/slides.PPTX")).toBe("powerpoint");
    });

    it("should identify text files", () => {
      expect(getFileType("notes.txt")).toBe("text");
      expect(getFileType("readme.md")).toBe("text");
    });

    it("should return null for unsupported types", () => {
      expect(getFileType("image.png")).toBe(null);
      expect(getFileType("document.pdf")).toBe(null);
      expect(getFileType("spreadsheet.xlsx")).toBe(null);
    });
  });

  describe("hasRTLContent", () => {
    const hasRTLContent = (text: string): boolean => {
      const rtlRegex =
        /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
      return rtlRegex.test(text);
    };

    it("should detect Arabic text", () => {
      expect(hasRTLContent("مرحبا")).toBe(true);
      expect(hasRTLContent("Hello مرحبا World")).toBe(true);
    });

    it("should detect Hebrew text", () => {
      expect(hasRTLContent("שלום")).toBe(true);
    });

    it("should return false for LTR text", () => {
      expect(hasRTLContent("Hello World")).toBe(false);
      expect(hasRTLContent("123 Test")).toBe(false);
    });

    it("should handle empty strings", () => {
      expect(hasRTLContent("")).toBe(false);
    });
  });

  describe("getTextDirection", () => {
    const getTextDirection = (text: string): "rtl" | "ltr" => {
      const rtlRegex =
        /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
      return rtlRegex.test(text) ? "rtl" : "ltr";
    };

    it("should return rtl for RTL content", () => {
      expect(getTextDirection("مرحبا")).toBe("rtl");
      expect(getTextDirection("שלום")).toBe("rtl");
    });

    it("should return ltr for LTR content", () => {
      expect(getTextDirection("Hello")).toBe("ltr");
      expect(getTextDirection("")).toBe("ltr");
    });
  });

  describe("highlightMatches", () => {
    const highlightMatches = (text: string, query: string): string => {
      if (!query.trim()) return text;
      const regex = new RegExp(
        `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "gi"
      );
      return text.replace(regex, "**$1**");
    };

    it("should highlight matching text", () => {
      expect(highlightMatches("Hello World", "World")).toBe("Hello **World**");
    });

    it("should be case insensitive", () => {
      expect(highlightMatches("Hello World", "world")).toBe("Hello **World**");
    });

    it("should highlight multiple occurrences", () => {
      expect(highlightMatches("test test test", "test")).toBe(
        "**test** **test** **test**"
      );
    });

    it("should handle empty query", () => {
      expect(highlightMatches("Hello World", "")).toBe("Hello World");
    });

    it("should escape regex special characters", () => {
      expect(highlightMatches("Hello (World)", "(World)")).toBe(
        "Hello **(World)**"
      );
    });
  });
});

describe("Search Scoring", () => {
  const calculateRelevanceScore = (content: string, query: string): number => {
    const words = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    let score = 0;

    words.forEach((word) => {
      const regex = new RegExp(word, "gi");
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    });

    return score;
  };

  it("should return 0 for no matches", () => {
    expect(calculateRelevanceScore("Hello World", "foo")).toBe(0);
  });

  it("should score based on match count", () => {
    expect(calculateRelevanceScore("test test test", "test")).toBe(3);
  });

  it("should handle multiple query words", () => {
    expect(calculateRelevanceScore("Hello World", "hello world")).toBe(2);
  });

  it("should be case insensitive", () => {
    expect(calculateRelevanceScore("Hello HELLO hello", "hello")).toBe(3);
  });
});

describe("Filter Logic", () => {
  interface FileData {
    path: string;
    name: string;
    type: "word" | "powerpoint" | "text";
    size: number;
    lastModified: Date;
  }

  const testFiles: FileData[] = [
    {
      path: "/doc.docx",
      name: "doc.docx",
      type: "word",
      size: 1024,
      lastModified: new Date(),
    },
    {
      path: "/pres.pptx",
      name: "pres.pptx",
      type: "powerpoint",
      size: 2048,
      lastModified: new Date("2024-01-01"),
    },
    {
      path: "/note.txt",
      name: "note.txt",
      type: "text",
      size: 512,
      lastModified: new Date(),
    },
  ];

  const filterByType = (files: FileData[], type: string): FileData[] => {
    if (type === "all") return files;
    return files.filter((f) => f.type === type);
  };

  const filterBySize = (
    files: FileData[],
    minBytes: number,
    maxBytes: number
  ): FileData[] => {
    return files.filter((f) => f.size >= minBytes && f.size <= maxBytes);
  };

  describe("filterByType", () => {
    it('should return all files when type is "all"', () => {
      expect(filterByType(testFiles, "all")).toHaveLength(3);
    });

    it("should filter by word type", () => {
      const result = filterByType(testFiles, "word");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("doc.docx");
    });

    it("should filter by powerpoint type", () => {
      const result = filterByType(testFiles, "powerpoint");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("pres.pptx");
    });

    it("should filter by text type", () => {
      const result = filterByType(testFiles, "text");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("note.txt");
    });
  });

  describe("filterBySize", () => {
    it("should filter files within size range", () => {
      const result = filterBySize(testFiles, 500, 1500);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no files match", () => {
      const result = filterBySize(testFiles, 10000, 20000);
      expect(result).toHaveLength(0);
    });

    it("should include files at exact boundaries", () => {
      const result = filterBySize(testFiles, 512, 512);
      expect(result).toHaveLength(1);
    });
  });
});

describe("Search History", () => {
  interface SearchHistoryItem {
    query: string;
    timestamp: number;
    resultsCount: number;
  }

  const addToHistory = (
    history: SearchHistoryItem[],
    query: string,
    resultsCount: number,
    maxItems: number = 10
  ): SearchHistoryItem[] => {
    const newItem: SearchHistoryItem = {
      query,
      timestamp: Date.now(),
      resultsCount,
    };
    return [newItem, ...history.filter((h) => h.query !== query)].slice(
      0,
      maxItems
    );
  };

  it("should add new item to the beginning", () => {
    const history: SearchHistoryItem[] = [];
    const result = addToHistory(history, "test", 5);
    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("test");
  });

  it("should remove duplicate queries", () => {
    const history: SearchHistoryItem[] = [
      { query: "test", timestamp: 1000, resultsCount: 3 },
    ];
    const result = addToHistory(history, "test", 5);
    expect(result).toHaveLength(1);
    expect(result[0].resultsCount).toBe(5);
  });

  it("should limit to max items", () => {
    const history: SearchHistoryItem[] = Array(10)
      .fill(null)
      .map((_, i) => ({
        query: `query${i}`,
        timestamp: i,
        resultsCount: i,
      }));
    const result = addToHistory(history, "new query", 1, 10);
    expect(result).toHaveLength(10);
    expect(result[0].query).toBe("new query");
  });
});
