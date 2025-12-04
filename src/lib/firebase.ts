import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Analytics instance (initialized lazily)
let analytics: ReturnType<typeof getAnalytics> | null = null;

// Initialize analytics only if supported (won't work in SSR/Node)
export const initAnalytics = async () => {
  if (typeof window !== "undefined" && (await isSupported())) {
    analytics = getAnalytics(app);
    console.log("📊 Firebase Analytics initialized");
    return analytics;
  }
  return null;
};

// Track custom events
export const trackEvent = (
  eventName: string,
  params?: Record<string, unknown>
) => {
  if (analytics) {
    logEvent(analytics, eventName, params);
  }
};

// Pre-defined events for DocuFind
export const Analytics = {
  // App lifecycle
  appLaunched: () => trackEvent("app_launched"),
  appClosed: () => trackEvent("app_closed"),

  // Folder events
  folderAdded: (fileCount: number) =>
    trackEvent("folder_added", { file_count: fileCount }),
  folderRemoved: () => trackEvent("folder_removed"),
  folderExcluded: () => trackEvent("folder_excluded"),

  // Search events
  searchPerformed: (resultCount: number, queryLength: number) =>
    trackEvent("search_performed", {
      result_count: resultCount,
      query_length: queryLength,
    }),

  // File events
  fileOpened: (fileType: string) =>
    trackEvent("file_opened", { file_type: fileType }),
  fileDeleted: () => trackEvent("file_deleted"),

  // Feature usage
  indexCleared: () => trackEvent("index_cleared"),
  indexLoaded: (fileCount: number) =>
    trackEvent("index_loaded", { file_count: fileCount }),
};

export default app;
