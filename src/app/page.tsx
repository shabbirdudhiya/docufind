'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { 
  Search, 
  FolderOpen, 
  FileText, 
  File, 
  Play, 
  Pause, 
  RefreshCw, 
  Settings,
  Filter,
  Eye,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  Zap,
  Database,
  TrendingUp,
  ExternalLink,
  Sparkles,
  Moon,
  Sun,
  Languages,
  History,
  X,
  Keyboard,
  Calendar,
  HardDrive,
  FileType,
  Trash2,
  LayoutList,
  Eye as EyeIcon
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface FileData {
  path: string
  name: string
  type: 'word' | 'powerpoint' | 'text'
  size: number
  lastModified: Date
}

interface SearchResult {
  file: FileData
  matches: Array<{
    text: string
    index: number
    context: string
  }>
  score: number
}

interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  scanFolder: (folderPath: string) => Promise<{ success: boolean; files?: FileData[]; error?: string }>
  searchFiles: (query: string, folderPath: string) => Promise<{ success: boolean; results?: SearchResult[]; error?: string }>
  extractContent: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  startWatching: (folderPath: string) => Promise<void>
  stopWatching: () => Promise<void>
  openFile: (filePath: string) => Promise<void>
  openFileLocation: (filePath: string) => Promise<void>
  onFileAdded: (callback: (event: any, data: { filePath: string; content: string }) => void) => void
  onFileUpdated: (callback: (event: any, data: { filePath: string; content: string }) => void) => void
  onFileRemoved: (callback: (event: any, data: { filePath: string }) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// Search history item interface
interface SearchHistoryItem {
  query: string
  timestamp: number
  resultsCount: number
}

export default function Home() {
  const [isElectron, setIsElectron] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [files, setFiles] = useState<FileData[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [filteredResults, setFilteredResults] = useState<SearchResult[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isWatching, setIsWatching] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    totalFiles: 0,
    wordFiles: 0,
    powerPointFiles: 0,
    textFiles: 0,
    totalSize: 0
  })
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isRTL, setIsRTL] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false)
  
  // New state for filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterFileType, setFilterFileType] = useState<string>('all')
  const [filterDateRange, setFilterDateRange] = useState<string>('all')
  const [filterMinSize, setFilterMinSize] = useState<number>(0)
  const [filterMaxSize, setFilterMaxSize] = useState<number>(100) // in MB
  
  // Search history
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [showSearchHistory, setShowSearchHistory] = useState(false)
  
  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewFile, setPreviewFile] = useState<FileData | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  
  // Keyboard shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false)
  
  // Additional settings
  const [resultsPerPage, setResultsPerPage] = useState<number>(10)
  const [showFilePreview, setShowFilePreview] = useState<boolean>(true)
  const [autoWatch, setAutoWatch] = useState<boolean>(false)
  const [confirmClearData, setConfirmClearData] = useState<'history' | 'index' | null>(null)
  
  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Detect Electron environment on client-side only
  useEffect(() => {
    setIsMounted(true)
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI)
    // Check for saved dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode') === 'true'
    setIsDarkMode(savedDarkMode)
    if (savedDarkMode) {
      document.documentElement.classList.add('dark')
    }
    // Load search history from localStorage
    const savedHistory = localStorage.getItem('searchHistory')
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to parse search history')
      }
    }
    // Load additional settings from localStorage
    const savedResultsPerPage = localStorage.getItem('resultsPerPage')
    if (savedResultsPerPage) setResultsPerPage(parseInt(savedResultsPerPage))
    const savedShowFilePreview = localStorage.getItem('showFilePreview')
    if (savedShowFilePreview !== null) setShowFilePreview(savedShowFilePreview === 'true')
    const savedAutoWatch = localStorage.getItem('autoWatch')
    if (savedAutoWatch !== null) setAutoWatch(savedAutoWatch === 'true')
    const savedRTL = localStorage.getItem('isRTL')
    if (savedRTL !== null) setIsRTL(savedRTL === 'true')
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Ctrl/Cmd + O: Open folder
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        if (window.electronAPI) {
          selectFolder()
        }
      }
      // Ctrl/Cmd + H: Show search history
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        setShowSearchHistory(prev => !prev)
      }
      // Escape: Close modals
      if (e.key === 'Escape') {
        setPreviewOpen(false)
        setShowShortcuts(false)
        setShowSearchHistory(false)
        setShowFilters(false)
      }
      // Ctrl/Cmd + /: Show shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setShowShortcuts(prev => !prev)
      }
      // Ctrl/Cmd + D: Toggle dark mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        toggleDarkMode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Apply filters to search results
  useEffect(() => {
    let results = [...searchResults]
    
    // Filter by file type
    if (filterFileType !== 'all') {
      results = results.filter(r => r.file.type === filterFileType)
    }
    
    // Filter by date range
    if (filterDateRange !== 'all') {
      const now = new Date()
      let cutoffDate = new Date()
      
      switch (filterDateRange) {
        case 'today':
          cutoffDate.setHours(0, 0, 0, 0)
          break
        case 'week':
          cutoffDate.setDate(now.getDate() - 7)
          break
        case 'month':
          cutoffDate.setMonth(now.getMonth() - 1)
          break
        case 'year':
          cutoffDate.setFullYear(now.getFullYear() - 1)
          break
      }
      
      results = results.filter(r => new Date(r.file.lastModified) >= cutoffDate)
    }
    
    // Filter by file size (in bytes, filterMinSize and filterMaxSize are in MB)
    const minBytes = filterMinSize * 1024 * 1024
    const maxBytes = filterMaxSize * 1024 * 1024
    results = results.filter(r => r.file.size >= minBytes && r.file.size <= maxBytes)
    
    setFilteredResults(results)
  }, [searchResults, filterFileType, filterDateRange, filterMinSize, filterMaxSize])

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle('dark')
    localStorage.setItem('darkMode', (!isDarkMode).toString())
  }

  // Toggle RTL
  const toggleRTL = () => {
    const newRTL = !isRTL
    setIsRTL(newRTL)
    localStorage.setItem('isRTL', newRTL.toString())
  }

  // Update results per page setting
  const updateResultsPerPage = (value: number) => {
    setResultsPerPage(value)
    localStorage.setItem('resultsPerPage', value.toString())
  }

  // Toggle file preview setting
  const toggleShowFilePreview = () => {
    const newValue = !showFilePreview
    setShowFilePreview(newValue)
    localStorage.setItem('showFilePreview', newValue.toString())
  }

  // Toggle auto watch setting
  const toggleAutoWatch = () => {
    const newValue = !autoWatch
    setAutoWatch(newValue)
    localStorage.setItem('autoWatch', newValue.toString())
  }

  // Clear all indexed files
  const clearIndexedFiles = () => {
    setFiles([])
    setSearchResults([])
    setFilteredResults([])
    setStats({
      totalFiles: 0,
      wordFiles: 0,
      powerPointFiles: 0,
      textFiles: 0,
      totalSize: 0
    })
    setConfirmClearData(null)
  }

  // Add to search history
  const addToSearchHistory = (query: string, resultsCount: number) => {
    const newItem: SearchHistoryItem = {
      query,
      timestamp: Date.now(),
      resultsCount
    }
    const updatedHistory = [newItem, ...searchHistory.filter(h => h.query !== query)].slice(0, 10)
    setSearchHistory(updatedHistory)
    localStorage.setItem('searchHistory', JSON.stringify(updatedHistory))
  }

  // Clear search history
  const clearSearchHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('searchHistory')
    setConfirmClearData(null)
  }

  // Preview file content
  const previewFileContent = async (file: FileData) => {
    if (!window.electronAPI) return
    
    setPreviewFile(file)
    setPreviewOpen(true)
    setIsLoadingPreview(true)
    setPreviewContent('')
    
    try {
      const result = await window.electronAPI.extractContent(file.path)
      if (result.success) {
        setPreviewContent(result.content || 'No content available')
      } else {
        setPreviewContent('Failed to load preview: ' + (result.error || 'Unknown error'))
      }
    } catch (err) {
      setPreviewContent('Failed to load preview')
      console.error(err)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const scanFolder = useCallback(async (folderPath: string) => {
    if (!window.electronAPI) return

    setIsScanning(true)
    setError(null)
    setScanProgress(0)
    setShowLoadingOverlay(true)
    setLoadingMessage('Initializing scan...')

    // Simulate progressive loading for better UX
    const progressInterval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 90) return prev
        const increment = Math.random() * 15
        return Math.min(prev + increment, 90)
      })
    }, 200)

    try {
      setLoadingMessage('Scanning folder for documents...')
      const result = await window.electronAPI.scanFolder(folderPath)
      clearInterval(progressInterval)
      
      if (result.success && result.files) {
        setLoadingMessage(`Found ${result.files.length} files! Indexing...`)
        setScanProgress(95)
        setFiles(result.files)
        updateStats(result.files)
        setScanProgress(100)
        setLoadingMessage('Scan complete!')
        // Keep overlay briefly to show completion
        setTimeout(() => setShowLoadingOverlay(false), 500)
      } else {
        setError(result.error || 'Failed to scan folder')
        setShowLoadingOverlay(false)
      }
    } catch (err) {
      clearInterval(progressInterval)
      setError('Scanning failed')
      console.error(err)
      setShowLoadingOverlay(false)
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (window.electronAPI) {
      // Set up file system event listeners
      window.electronAPI.onFileAdded((event, data) => {
        console.log('File added:', data.filePath)
        // Refresh file list
        if (selectedFolder) {
          scanFolder(selectedFolder)
        }
      })

      window.electronAPI.onFileUpdated((event, data) => {
        console.log('File updated:', data.filePath)
        // Refresh file list
        if (selectedFolder) {
          scanFolder(selectedFolder)
        }
      })

      window.electronAPI.onFileRemoved((event, data) => {
        console.log('File removed:', data.filePath)
        // Refresh file list
        if (selectedFolder) {
          scanFolder(selectedFolder)
        }
      })

      return () => {
        window.electronAPI.removeAllListeners('file-added')
        window.electronAPI.removeAllListeners('file-updated')
        window.electronAPI.removeAllListeners('file-removed')
      }
    }
  }, [selectedFolder, scanFolder])

  const selectFolder = async () => {
    if (!window.electronAPI) {
      setError('Electron API not available')
      return
    }

    try {
      const folderPath = await window.electronAPI.selectFolder()
      if (folderPath) {
        setSelectedFolder(folderPath)
        setError(null)
        await scanFolder(folderPath)
      }
    } catch (err) {
      setError('Failed to select folder')
      console.error(err)
    }
  }

  const updateStats = (fileList: FileData[]) => {
    const stats = {
      totalFiles: fileList.length,
      wordFiles: fileList.filter(f => f.type === 'word').length,
      powerPointFiles: fileList.filter(f => f.type === 'powerpoint').length,
      textFiles: fileList.filter(f => f.type === 'text').length,
      totalSize: fileList.reduce((acc, f) => acc + f.size, 0)
    }
    setStats(stats)
  }

  const searchFiles = async () => {
    if (!window.electronAPI || !selectedFolder || !searchQuery.trim()) return

    setIsSearching(true)
    setError(null)
    setLoadingProgress(0)
    setShowLoadingOverlay(true)
    setLoadingMessage('Searching documents...')

    // Simulate search progress
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 85) return prev
        return prev + Math.random() * 20
      })
    }, 150)

    try {
      const result = await window.electronAPI.searchFiles(searchQuery, selectedFolder)
      clearInterval(progressInterval)
      setLoadingProgress(100)
      
      if (result.success && result.results) {
        setLoadingMessage(`Found ${result.results.length} results!`)
        setSearchResults(result.results)
        addToSearchHistory(searchQuery, result.results.length)
        setTimeout(() => setShowLoadingOverlay(false), 300)
      } else {
        setError(result.error || 'Search failed')
        setShowLoadingOverlay(false)
      }
    } catch (err) {
      clearInterval(progressInterval)
      setError('Search failed')
      console.error(err)
      setShowLoadingOverlay(false)
    } finally {
      setIsSearching(false)
    }
  }

  const toggleWatching = async () => {
    if (!window.electronAPI || !selectedFolder) return

    try {
      if (isWatching) {
        await window.electronAPI.stopWatching()
        setIsWatching(false)
      } else {
        await window.electronAPI.startWatching(selectedFolder)
        setIsWatching(true)
      }
    } catch (err) {
      setError('Failed to toggle file watching')
      console.error(err)
    }
  }

  const getFileIcon = (type: 'word' | 'powerpoint' | 'text') => {
    switch (type) {
      case 'word':
        return <FileText className="h-4 w-4 text-blue-600" />
      case 'powerpoint':
        return <FileText className="h-4 w-4 text-orange-600" />
      default:
        return <File className="h-4 w-4 text-gray-600" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const highlightText = (text: string, query: string) => {
    if (!query) return text
    const regex = new RegExp(`(${query})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 px-1 rounded text-black dark:text-white font-medium">{part}</mark> : part
    )
  }

  // Open file with default application
  const openFile = async (filePath: string) => {
    if (!window.electronAPI?.openFile) {
      setError('Open file feature not available')
      return
    }
    try {
      await window.electronAPI.openFile(filePath)
    } catch (err) {
      setError('Failed to open file')
      console.error(err)
    }
  }

  // Open file location in explorer
  const openFileLocation = async (filePath: string) => {
    if (!window.electronAPI?.openFileLocation) {
      setError('Open location feature not available')
      return
    }
    try {
      await window.electronAPI.openFileLocation(filePath)
    } catch (err) {
      setError('Failed to open file location')
      console.error(err)
    }
  }

  // Detect if text contains RTL characters
  const isRTLText = (text: string) => {
    const rtlChars = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/
    return rtlChars.test(text)
  }

  // Get text direction based on content or user preference
  const getTextDirection = (text: string) => {
    if (isRTL) return 'rtl'
    return isRTLText(text) ? 'rtl' : 'ltr'
  }

  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted) {
    return null
  }

  if (!isElectron) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md backdrop-blur-xl bg-white/70 dark:bg-slate-900/70 border-white/20 shadow-2xl shadow-blue-500/10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 w-fit shadow-lg shadow-orange-500/30">
              <AlertCircle className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">Desktop App Required</CardTitle>
            <CardDescription className="text-base">
              This application requires Electron to run as a desktop app. Please run it using the Electron launcher.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 dark:bg-slate-800 p-4 rounded-xl border border-slate-700">
              <p className="text-sm font-mono text-emerald-400">$ npm run electron-dev</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-500">
      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center">
          <Card className="w-full max-w-md mx-4 backdrop-blur-xl bg-white/90 dark:bg-slate-900/90 border-white/20 shadow-2xl">
            <CardContent className="pt-8 pb-6">
              <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
                    <Sparkles className="h-10 w-10 text-white" />
                  </div>
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 opacity-20 animate-ping" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">{loadingMessage}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Please wait...</p>
                </div>
                <div className="w-full space-y-2">
                  <Progress value={isScanning ? scanProgress : loadingProgress} className="h-2" />
                  <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">
                    {Math.round(isScanning ? scanProgress : loadingProgress)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-200/50 dark:border-slate-700/50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-shadow duration-300">
                <Database className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-blue-800 to-purple-800 dark:from-white dark:via-blue-200 dark:to-purple-200 bg-clip-text text-transparent">
                  Searchify
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Search through your documents instantly</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedFolder && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleWatching}
                  className={`flex items-center gap-2 rounded-xl border-2 transition-all duration-300 ${
                    isWatching 
                      ? 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20' 
                      : 'hover:border-blue-500/50'
                  }`}
                >
                  {isWatching ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isWatching ? 'Watching' : 'Watch'}
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={toggleRTL}
                className="rounded-xl border-2 hover:border-blue-500/50 transition-all duration-300"
                title="Toggle RTL"
              >
                <Languages className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={toggleDarkMode}
                className="rounded-xl border-2 hover:border-blue-500/50 transition-all duration-300"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl border-2 hover:border-blue-500/50 transition-all duration-300">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats Cards */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Files</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{stats.totalFiles}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 group-hover:from-blue-500/20 group-hover:to-purple-500/20 transition-colors duration-300">
                    <Database className="h-8 w-8 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Word</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.wordFiles}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors duration-300">
                    <FileText className="h-8 w-8 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">PowerPoint</p>
                    <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.powerPointFiles}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors duration-300">
                    <FileText className="h-8 w-8 text-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Text</p>
                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.textFiles}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors duration-300">
                    <File className="h-8 w-8 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="backdrop-blur-xl bg-red-50/80 dark:bg-red-950/50 border-red-200 dark:border-red-800">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="search" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border border-white/20 dark:border-slate-700/50 p-1 rounded-2xl">
            <TabsTrigger value="search" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white transition-all duration-300">Search</TabsTrigger>
            <TabsTrigger value="files" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white transition-all duration-300">File Library</TabsTrigger>
            <TabsTrigger value="settings" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white transition-all duration-300">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            {/* Folder Selection */}
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                    <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  Select Folder
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Choose a folder to search for documents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <Button 
                    onClick={selectFolder}
                    disabled={isScanning}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {isScanning ? 'Scanning...' : 'Select Folder'}
                  </Button>
                  {selectedFolder && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="font-mono bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg text-xs">
                        {selectedFolder}
                      </span>
                    </div>
                  )}
                </div>

                {isScanning && !showLoadingOverlay && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">Scanning files...</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{Math.round(scanProgress)}%</span>
                    </div>
                    <Progress value={scanProgress} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Search Interface */}
            {selectedFolder && (
              <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10">
                        <Search className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      Search Documents
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSearchHistory(!showSearchHistory)}
                        className="rounded-lg"
                        title="Search History (Ctrl+H)"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                        className={`rounded-lg ${showFilters ? 'bg-blue-500/10 border-blue-500' : ''}`}
                        title="Filters"
                      >
                        <Filter className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowShortcuts(true)}
                        className="rounded-lg"
                        title="Keyboard Shortcuts (Ctrl+/)"
                      >
                        <Keyboard className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Search through {files.length} indexed documents
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search History Dropdown */}
                  {showSearchHistory && searchHistory.length > 0 && (
                    <Card className="p-3 bg-white/80 dark:bg-slate-700/80 border-slate-200 dark:border-slate-600">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Recent Searches</span>
                        <Button variant="ghost" size="sm" onClick={clearSearchHistory} className="text-xs text-red-500 hover:text-red-600">
                          Clear
                        </Button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {searchHistory.map((item, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setSearchQuery(item.query)
                              setShowSearchHistory(false)
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">{item.query}</span>
                            </div>
                            <span className="text-xs text-slate-500">{item.resultsCount} results</span>
                          </button>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Filter Panel */}
                  {showFilters && (
                    <Card className="p-4 bg-white/80 dark:bg-slate-700/80 border-slate-200 dark:border-slate-600">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* File Type Filter */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <FileType className="h-4 w-4" />
                            File Type
                          </label>
                          <Select value={filterFileType} onValueChange={setFilterFileType}>
                            <SelectTrigger className="rounded-lg">
                              <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Types</SelectItem>
                              <SelectItem value="word">Word (.docx)</SelectItem>
                              <SelectItem value="powerpoint">PowerPoint (.pptx)</SelectItem>
                              <SelectItem value="text">Text (.txt, .md)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Date Range Filter */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Date Modified
                          </label>
                          <Select value={filterDateRange} onValueChange={setFilterDateRange}>
                            <SelectTrigger className="rounded-lg">
                              <SelectValue placeholder="Any time" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Any Time</SelectItem>
                              <SelectItem value="today">Today</SelectItem>
                              <SelectItem value="week">Past Week</SelectItem>
                              <SelectItem value="month">Past Month</SelectItem>
                              <SelectItem value="year">Past Year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* File Size Filter */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <HardDrive className="h-4 w-4" />
                            Size: {filterMinSize}MB - {filterMaxSize}MB
                          </label>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[filterMinSize, filterMaxSize]}
                              onValueChange={([min, max]) => {
                                setFilterMinSize(min)
                                setFilterMaxSize(max)
                              }}
                              min={0}
                              max={100}
                              step={1}
                              className="flex-1"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-end mt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFilterFileType('all')
                            setFilterDateRange('all')
                            setFilterMinSize(0)
                            setFilterMaxSize(100)
                          }}
                          className="text-sm"
                        >
                          Reset Filters
                        </Button>
                      </div>
                    </Card>
                  )}

                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Input
                        ref={searchInputRef}
                        placeholder="Enter search terms... (Ctrl+F)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchFiles()}
                        disabled={files.length === 0 || isSearching}
                        className="rounded-xl border-2 border-slate-200 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white/80 dark:bg-slate-700/80 transition-all duration-300 pr-10"
                        dir={isRTL ? 'rtl' : 'ltr'}
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Button 
                      onClick={searchFiles} 
                      disabled={!searchQuery.trim() || files.length === 0 || isSearching}
                      className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300"
                    >
                      {isSearching ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Search
                        </>
                      )}
                    </Button>
                  </div>

                  <ScrollArea className="h-96">
                    {isSearching && !showLoadingOverlay && (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <Card key={i} className="p-4 backdrop-blur-xl bg-white/40 dark:bg-slate-700/40">
                            <div className="flex items-start gap-3 mb-3">
                              <Skeleton className="h-10 w-10 rounded-xl" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-3 w-1/2" />
                              </div>
                            </div>
                            <Skeleton className="h-16 w-full rounded-lg" />
                          </Card>
                        ))}
                      </div>
                    )}

                    {filteredResults.length > 0 && !isSearching && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            Found <span className="font-semibold text-blue-600 dark:text-blue-400">{filteredResults.length}</span> result{filteredResults.length !== 1 ? 's' : ''}
                            {filteredResults.length !== searchResults.length && (
                              <span className="text-slate-400 ml-1">(filtered from {searchResults.length})</span>
                            )}
                          </p>
                          <Badge variant="secondary" className="flex items-center gap-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-700 dark:text-blue-300 border-0">
                            <TrendingUp className="h-3 w-3" />
                            Sorted by Relevance
                          </Badge>
                        </div>
                        {filteredResults.map((result, index) => (
                          <Card key={index} className="p-5 backdrop-blur-xl bg-white/60 dark:bg-slate-700/60 border-white/20 dark:border-slate-600/50 shadow-md hover:shadow-lg hover:scale-[1.01] transition-all duration-300 group">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 group-hover:from-blue-500/20 group-hover:to-purple-500/20 transition-colors duration-300">
                                  {getFileIcon(result.file.type)}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900 dark:text-white">{result.file.name}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                    {result.file.path.split('\\').slice(-2).join('/')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={`text-xs ${
                                  result.score > 0.7 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' :
                                  result.score > 0.4 ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300' :
                                  'bg-slate-500/20 text-slate-700 dark:text-slate-300'
                                } border-0`}>
                                  {Math.round(result.score * 100)}% match
                                </Badge>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                  {formatFileSize(result.file.size)}
                                </span>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => previewFileContent(result.file)}
                                  className="rounded-lg hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  title="Preview content"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => openFile(result.file.path)}
                                  className="rounded-lg hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  title="Open file"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => openFileLocation(result.file.path)}
                                  className="rounded-lg hover:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                  title="Open file location"
                                >
                                  <FolderOpen className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <Separator className="mb-4 bg-slate-200 dark:bg-slate-600" />
                            <div className="space-y-3" dir={getTextDirection(result.matches[0]?.context || '')}>
                              {result.matches.slice(0, 3).map((match, matchIndex) => (
                                <div key={matchIndex} className="text-sm p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed" dir={getTextDirection(match.context)}>
                                    ...{highlightText(match.context, searchQuery)}...
                                  </p>
                                </div>
                              ))}
                              {result.matches.length > 3 && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 pl-3">
                                  +{result.matches.length - 3} more matches
                                </p>
                              )}
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {searchQuery && searchResults.length === 0 && !isSearching && files.length > 0 && (
                      <div className="text-center py-16">
                        <div className="mx-auto mb-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 w-fit">
                          <Search className="h-12 w-12 text-slate-400" />
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 font-medium">No results found for "{searchQuery}"</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                          Try different keywords or check your spelling
                        </p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                    <File className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  File Library
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  {files.length} files indexed from {selectedFolder || 'No folder selected'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {files.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="mx-auto mb-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800 w-fit">
                      <File className="h-12 w-12 text-slate-400" />
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-medium">No files indexed yet</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      Select a folder to start indexing documents
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-96">
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-4 backdrop-blur-xl bg-white/40 dark:bg-slate-700/40 rounded-xl border border-white/20 dark:border-slate-600/50 hover:bg-white/60 dark:hover:bg-slate-700/60 transition-all duration-300 group">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 group-hover:from-blue-500/20 group-hover:to-purple-500/20 transition-colors duration-300">
                              {getFileIcon(file.type)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{file.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {formatFileSize(file.size)} • {new Date(file.lastModified).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openFile(file.path)}
                              className="rounded-lg hover:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              title="Open file"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openFileLocation(file.path)}
                              className="rounded-lg hover:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              title="Open file location"
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            {/* Appearance Settings */}
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10">
                    <Settings className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  Appearance
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Customize the look and feel of DocuFind
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Dark Mode</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Toggle dark/light theme
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleDarkMode}
                      className="rounded-xl"
                    >
                      {isDarkMode ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                      {isDarkMode ? 'Light' : 'Dark'}
                    </Button>
                  </div>
                  
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">RTL Support</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Force right-to-left text direction for all content
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleRTL}
                      className={`rounded-xl transition-all duration-300 ${
                        isRTL 
                          ? 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400' 
                          : ''
                      }`}
                    >
                      <Languages className="h-4 w-4 mr-2" />
                      {isRTL ? 'RTL On' : 'LTR'}
                    </Button>
                  </div>
                  
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Results Per Page</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Number of search results to display
                      </p>
                    </div>
                    <Select value={resultsPerPage.toString()} onValueChange={(value) => updateResultsPerPage(parseInt(value))}>
                      <SelectTrigger className="w-24 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Search & Indexing Settings */}
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
                    <Search className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  Search & Indexing
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Configure search behavior and file indexing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Real-time Watching</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Automatically update index when files change
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleWatching}
                      disabled={!selectedFolder}
                      className={`rounded-xl transition-all duration-300 ${
                        isWatching 
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400' 
                          : ''
                      }`}
                    >
                      {isWatching ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                  
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Auto-Watch on Folder Select</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Automatically enable watching when selecting a folder
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleAutoWatch}
                      className={`rounded-xl transition-all duration-300 ${
                        autoWatch 
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400' 
                          : ''
                      }`}
                    >
                      {autoWatch ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                  
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Show File Preview</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Show preview button on search results
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleShowFilePreview}
                      className={`rounded-xl transition-all duration-300 ${
                        showFilePreview 
                          ? 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400' 
                          : ''
                      }`}
                    >
                      <EyeIcon className="h-4 w-4 mr-2" />
                      {showFilePreview ? 'Enabled' : 'Disabled'}
                    </Button>
                  </div>
                  
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Supported File Types</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        .docx, .pptx, .txt, .md
                      </p>
                    </div>
                    <Badge className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-700 dark:text-blue-300 border-0">4 types</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Data & Storage Settings */}
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                    <Database className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  Data & Storage
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">
                  Manage indexed data and search history
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Index Size</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {stats.totalFiles} files indexed
                      </p>
                    </div>
                    <Badge className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-700 dark:text-emerald-300 border-0">
                      {formatFileSize(stats.totalSize)}
                    </Badge>
                  </div>
                  
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Search History</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {searchHistory.length} searches saved
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmClearData('history')}
                      disabled={searchHistory.length === 0}
                      className="rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear History
                    </Button>
                  </div>
                  
                  <Separator className="bg-slate-200 dark:bg-slate-700" />
                  
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">Clear Index</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Remove all indexed files from memory
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmClearData('index')}
                      disabled={files.length === 0}
                      className="rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Index
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* About Section */}
            <Card className="backdrop-blur-xl bg-white/60 dark:bg-slate-800/60 border-white/20 dark:border-slate-700/50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-pink-500/10 to-rose-500/10">
                    <Sparkles className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                  </div>
                  About DocuFind
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-white/40 dark:bg-slate-700/40 border border-white/20 dark:border-slate-600/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium text-slate-900 dark:text-white">Version</p>
                    <Badge className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-700 dark:text-blue-300 border-0">1.0.0</Badge>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    A powerful desktop app for searching through your local documents instantly.
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Made with ❤️ by Shabbir Dudhiya
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] backdrop-blur-xl bg-white/95 dark:bg-slate-900/95">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {previewFile && getFileIcon(previewFile.type)}
              <span>{previewFile?.name || 'Preview'}</span>
            </DialogTitle>
            <DialogDescription>
              {previewFile && (
                <span className="font-mono text-xs">{previewFile.path}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] mt-4">
            {isLoadingPreview ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : (
              <pre 
                className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono p-4 bg-slate-50 dark:bg-slate-800 rounded-xl"
                dir={getTextDirection(previewContent)}
              >
                {previewContent}
              </pre>
            )}
          </ScrollArea>
          <div className="flex justify-end gap-2 mt-4">
            {previewFile && (
              <>
                <Button
                  variant="outline"
                  onClick={() => openFile(previewFile.path)}
                  className="rounded-xl"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open File
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openFileLocation(previewFile.path)}
                  className="rounded-xl"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Open Location
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Modal */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-md backdrop-blur-xl bg-white/95 dark:bg-slate-900/95">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Quick navigation shortcuts for power users
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {[
              { keys: 'Ctrl + F', action: 'Focus search input' },
              { keys: 'Ctrl + O', action: 'Open folder' },
              { keys: 'Ctrl + H', action: 'Toggle search history' },
              { keys: 'Ctrl + D', action: 'Toggle dark mode' },
              { keys: 'Ctrl + /', action: 'Show shortcuts' },
              { keys: 'Escape', action: 'Close modals' },
            ].map((shortcut, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <span className="text-sm text-slate-600 dark:text-slate-300">{shortcut.action}</span>
                <kbd className="px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-600">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Clear Data Dialog */}
      <AlertDialog open={confirmClearData !== null} onOpenChange={(open) => !open && setConfirmClearData(null)}>
        <AlertDialogContent className="backdrop-blur-xl bg-white/95 dark:bg-slate-900/95">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              {confirmClearData === 'history' ? 'Clear Search History' : 'Clear Indexed Files'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmClearData === 'history' 
                ? 'This will permanently delete all your search history. This action cannot be undone.'
                : 'This will remove all indexed files from memory. You will need to rescan the folder to search again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="rounded-xl bg-red-500 hover:bg-red-600 text-white"
              onClick={() => confirmClearData === 'history' ? clearSearchHistory() : clearIndexedFiles()}
            >
              {confirmClearData === 'history' ? 'Clear History' : 'Clear Index'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}