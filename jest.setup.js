require("@testing-library/jest-dom");

// Mock window.electronAPI for tests
Object.defineProperty(window, "electronAPI", {
  value: {
    selectFolder: jest.fn(),
    scanFolder: jest.fn(),
    searchFiles: jest.fn(),
    extractContent: jest.fn(),
    startWatching: jest.fn(),
    stopWatching: jest.fn(),
    openFile: jest.fn(),
    openFileLocation: jest.fn(),
    onFileAdded: jest.fn(),
    onFileUpdated: jest.fn(),
    onFileRemoved: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  writable: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
