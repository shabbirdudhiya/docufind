'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  Search,
  FolderOpen,
  FileText,
  File,
  Play,
  Pause,
  RefreshCw,
  Filter,
  Eye,
  ExternalLink,
  Sparkles,
  History,
  X,
  Keyboard,
  Calendar,
  HardDrive,
  FileType,
  Trash2,
  Eye as EyeIcon,
  AlertCircle,
  TrendingUp,
  Database
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'

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
  onIndexingStatus: (callback: (event: any, data: { isIndexing: boolean; message?: string }) => void) => void
  onIndexingProgress: (callback: (event: any, data: { current: number; total: number; filename: string }) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

interface SearchHistoryItem {
  query: string
  timestamp: number
  resultsCount: number
}

export default function Home() {
  const [isElectron, setIsElectron] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("search")

  // App State
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [files, setFiles] = useState<FileData[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [filteredResults, setFilteredResults] = useState<SearchResult[]>([])
  const [isIndexing, setIsIndexing] = useState(false)
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

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterFileType, setFilterFileType] = useState<string>('all')
  const [filterDateRange, setFilterDateRange] = useState<string>('all')
  const [filterMinSize, setFilterMinSize] = useState<number>(0)
  const [filterMaxSize, setFilterMaxSize] = useState<number>(100)

  // History & Preview
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [showSearchHistory, setShowSearchHistory] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewFile, setPreviewFile] = useState<FileData | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Settings
  const [resultsPerPage, setResultsPerPage] = useState<number>(10)
  const [showFilePreview, setShowFilePreview] = useState<boolean>(true)
  const [autoWatch, setAutoWatch] = useState<boolean>(false)
  const [confirmClearData, setConfirmClearData] = useState<'history' | 'index' | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsMounted(true)
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI)
    const savedDarkMode = localStorage.getItem('darkMode') === 'true'
    setIsDarkMode(savedDarkMode)
    if (savedDarkMode) document.documentElement.classList.add('dark')

    const savedHistory = localStorage.getItem('searchHistory')
    if (savedHistory) {
      try { setSearchHistory(JSON.parse(savedHistory)) } catch (e) { }
    }

    const savedResultsPerPage = localStorage.getItem('resultsPerPage')
    if (savedResultsPerPage) setResultsPerPage(parseInt(savedResultsPerPage))
    const savedShowFilePreview = localStorage.getItem('showFilePreview')
    if (savedShowFilePreview !== null) setShowFilePreview(savedShowFilePreview === 'true')
    const savedAutoWatch = localStorage.getItem('autoWatch')
    if (savedAutoWatch !== null) setAutoWatch(savedAutoWatch === 'true')
    const savedRTL = localStorage.getItem('isRTL')
    if (savedRTL !== null) setIsRTL(savedRTL === 'true')
  }, [])

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onIndexingStatus((event: any, data: { isIndexing: boolean; message?: string }) => {
        setIsIndexing(data.isIndexing)
        if (data.isIndexing) {
          setLoadingMessage(data.message || 'Indexing files for instant search...')
          setShowLoadingOverlay(true)
          setScanProgress(0) // Reset progress on start
        } else {
          setShowLoadingOverlay(false)
        }
      })

      window.electronAPI.onIndexingProgress((event: any, data: { current: number; total: number; filename: string }) => {
        const percentage = Math.round((data.current / data.total) * 100)
        setScanProgress(percentage)
        setLoadingMessage(`Indexing ${data.current}/${data.total}: ${data.filename}`)
      })

      return () => {
        window.electronAPI.removeAllListeners('indexing-status')
        window.electronAPI.removeAllListeners('indexing-progress')
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchInputRef.current?.focus(); setActiveTab('search') }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); if (window.electronAPI) selectFolder() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); setShowSearchHistory(prev => !prev) }
      if (e.key === 'Escape') { setPreviewOpen(false); setShowShortcuts(false); setShowSearchHistory(false); setShowFilters(false) }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); setShowShortcuts(prev => !prev) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); toggleDarkMode() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    let results = [...searchResults]
    if (filterFileType !== 'all') results = results.filter(r => r.file.type === filterFileType)
    if (filterDateRange !== 'all') {
      const now = new Date()
      let cutoffDate = new Date()
      switch (filterDateRange) {
        case 'today': cutoffDate.setHours(0, 0, 0, 0); break
        case 'week': cutoffDate.setDate(now.getDate() - 7); break
        case 'month': cutoffDate.setMonth(now.getMonth() - 1); break
        case 'year': cutoffDate.setFullYear(now.getFullYear() - 1); break
      }
      results = results.filter(r => new Date(r.file.lastModified) >= cutoffDate)
    }
    const minBytes = filterMinSize * 1024 * 1024
    const maxBytes = filterMaxSize * 1024 * 1024
    results = results.filter(r => r.file.size >= minBytes && r.file.size <= maxBytes)
    setFilteredResults(results)
  }, [searchResults, filterFileType, filterDateRange, filterMinSize, filterMaxSize])

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle('dark')
    localStorage.setItem('darkMode', (!isDarkMode).toString())
  }

  const toggleRTL = () => {
    const newRTL = !isRTL
    setIsRTL(newRTL)
    localStorage.setItem('isRTL', newRTL.toString())
  }

  const updateResultsPerPage = (value: number) => {
    setResultsPerPage(value)
    localStorage.setItem('resultsPerPage', value.toString())
  }

  const toggleShowFilePreview = () => {
    const newValue = !showFilePreview
    setShowFilePreview(newValue)
    localStorage.setItem('showFilePreview', newValue.toString())
  }

  const toggleAutoWatch = () => {
    const newValue = !autoWatch
    setAutoWatch(newValue)
    localStorage.setItem('autoWatch', newValue.toString())
  }

  const clearIndexedFiles = () => {
    setFiles([])
    setSearchResults([])
    setFilteredResults([])
    setStats({ totalFiles: 0, wordFiles: 0, powerPointFiles: 0, textFiles: 0, totalSize: 0 })
    setConfirmClearData(null)
  }

  const addToSearchHistory = (query: string, resultsCount: number) => {
    const newItem: SearchHistoryItem = { query, timestamp: Date.now(), resultsCount }
    const updatedHistory = [newItem, ...searchHistory.filter(h => h.query !== query)].slice(0, 10)
    setSearchHistory(updatedHistory)
    localStorage.setItem('searchHistory', JSON.stringify(updatedHistory))
  }

  const clearSearchHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('searchHistory')
    setConfirmClearData(null)
  }

  const previewFileContent = async (file: FileData) => {
    if (!window.electronAPI) return
    setPreviewFile(file)
    setPreviewOpen(true)
    setIsLoadingPreview(true)
    setPreviewContent('')
    try {
      const result = await window.electronAPI.extractContent(file.path)
      if (result.success) setPreviewContent(result.content || 'No content available')
      else setPreviewContent('Failed to load preview: ' + (result.error || 'Unknown error'))
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
        // Loading overlay will be closed by indexing-status event if indexing finishes
        // But if indexing is already done (fast), we might need to close it here?
        // Let's rely on the indexing-status event for closing if it's async.
        // However, scanFolder in electron waits for indexing now?
        // Wait, in my electron code, scanFolder calls indexFile sequentially.
        // So when scanFolder returns, indexing IS done.
        // But I added indexing-status events around it.
        // So the event listener should handle it.
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
      window.electronAPI.onFileAdded((event, data) => { if (selectedFolder) scanFolder(selectedFolder) })
      window.electronAPI.onFileUpdated((event, data) => { if (selectedFolder) scanFolder(selectedFolder) })
      window.electronAPI.onFileRemoved((event, data) => { if (selectedFolder) scanFolder(selectedFolder) })
      return () => {
        window.electronAPI.removeAllListeners('file-added')
        window.electronAPI.removeAllListeners('file-updated')
        window.electronAPI.removeAllListeners('file-removed')
      }
    }
  }, [selectedFolder, scanFolder])

  const selectFolder = async () => {
    if (!window.electronAPI) { setError('Electron API not available'); return }
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
      case 'word': return <FileText className="h-4 w-4 text-blue-600" />
      case 'powerpoint': return <FileText className="h-4 w-4 text-orange-600" />
      default: return <File className="h-4 w-4 text-gray-600" />
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

  const openFile = async (filePath: string) => {
    if (!window.electronAPI?.openFile) { setError('Open file feature not available'); return }
    try { await window.electronAPI.openFile(filePath) } catch (err) { setError('Failed to open file'); console.error(err) }
  }

  const openFileLocation = async (filePath: string) => {
    if (!window.electronAPI?.openFileLocation) { setError('Open location feature not available'); return }
    try { await window.electronAPI.openFileLocation(filePath) } catch (err) { setError('Failed to open file location'); console.error(err) }
  }

  const isRTLText = (text: string) => /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text)
  const getTextDirection = (text: string) => isRTL ? 'rtl' : (isRTLText(text) ? 'rtl' : 'ltr')

  if (!isMounted) return null

  if (!isElectron) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md glass-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-2xl bg-destructive/10 w-fit">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Desktop App Required</CardTitle>
            <CardDescription>This application requires Electron to run as a desktop app.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-xl border border-border">
              <p className="text-sm font-mono text-primary">$ npm run electron-dev</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          isRTL={isRTL}
          toggleRTL={toggleRTL}
        />

        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Header */}
          <header className="h-14 border-b border-border/50 bg-background/50 backdrop-blur-xl flex items-center px-4 justify-between shrink-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-6" />
              <h1 className="font-semibold text-lg">
                {activeTab === 'search' && 'Search Documents'}
                {activeTab === 'files' && 'File Library'}
                {activeTab === 'settings' && 'Settings'}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {selectedFolder && (
                <Button variant="outline" size="sm" onClick={toggleWatching} className={`gap-2 ${isWatching ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' : ''}`}>
                  {isWatching ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isWatching ? 'Watching' : 'Watch'}
                </Button>
              )}
            </div>
          </header>

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">

              {/* Search View */}
              {activeTab === 'search' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Search Bar & Folder Select */}
                  <Card className="glass-card border-none shadow-xl">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex gap-4">
                        <Button onClick={selectFolder} disabled={isScanning} className="h-12 px-6 text-base shadow-lg shadow-primary/20">
                          <FolderOpen className="h-5 w-5 mr-2" />
                          {isScanning ? 'Scanning...' : 'Select Folder'}
                        </Button>
                        <div className="flex-1 relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            ref={searchInputRef}
                            placeholder="Search documents... (Ctrl+F)"
                            className="h-12 pl-12 text-base bg-background/50 border-border/50 focus:bg-background transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchFiles()}
                            disabled={files.length === 0 || isScanning}
                          />
                          {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <Button onClick={searchFiles} disabled={!searchQuery.trim() || files.length === 0} className="h-12 w-12 p-0 rounded-xl">
                          {isSearching ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                        </Button>
                      </div>

                      {selectedFolder && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                          <div className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span className="font-mono truncate max-w-xl">{selectedFolder}</span>
                          <span className="mx-2">•</span>
                          <span>{files.length} files indexed</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Results Area */}
                  {isSearching ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-8 w-24" />
                      </div>
                      <div className="grid gap-4">
                        {[1, 2, 3].map((i) => (
                          <Card key={i} className="border-border/50 bg-card/50 backdrop-blur-sm">
                            <CardContent className="p-5">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-4">
                                  <Skeleton className="h-10 w-10 rounded-xl" />
                                  <div className="space-y-2">
                                    <Skeleton className="h-5 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ) : filteredResults.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-medium text-muted-foreground">Found {filteredResults.length} results</h3>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} className={showFilters ? 'bg-accent' : ''}>
                            <Filter className="h-4 w-4 mr-2" /> Filters
                          </Button>
                        </div>
                      </div>

                      {showFilters && (
                        <Card className="glass-card animate-in slide-in-from-top-2">
                          <CardContent className="p-4 grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-medium">File Type</label>
                              <Select value={filterFileType} onValueChange={setFilterFileType}>
                                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Types</SelectItem>
                                  <SelectItem value="word">Word</SelectItem>
                                  <SelectItem value="powerpoint">PowerPoint</SelectItem>
                                  <SelectItem value="text">Text</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Add other filters here if needed */}
                          </CardContent>
                        </Card>
                      )}

                      <div className="grid gap-4">
                        {filteredResults.map((result, index) => (
                          <Card key={index} className="group hover:shadow-xl hover:scale-[1.01] transition-all duration-200 border-border/50 bg-card/50 backdrop-blur-sm cursor-default">
                            <CardContent className="p-5">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-4">
                                  <div className="p-3 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-colors">
                                    {getFileIcon(result.file.type)}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-lg leading-none mb-1 group-hover:text-primary transition-colors">{result.file.name}</h4>
                                    <p className="text-xs text-muted-foreground font-mono">{result.file.path}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => previewFileContent(result.file)} title="Preview" className="text-muted-foreground hover:bg-primary/10 hover:text-primary">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => openFile(result.file.path)} title="Open" className="text-muted-foreground hover:bg-primary/10 hover:text-primary">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => openFileLocation(result.file.path)} title="Location" className="text-muted-foreground hover:bg-primary/10 hover:text-primary">
                                    <FolderOpen className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2 bg-muted/30 rounded-xl p-3 border border-border/10">
                                {result.matches.slice(0, 2).map((match, i) => (
                                  <p key={i} className="text-sm text-muted-foreground leading-relaxed font-mono">
                                    ...{highlightText(match.context, searchQuery)}...
                                  </p>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ) : (
                    files.length > 0 && !isSearching && (
                      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mb-6 ring-1 ring-primary/20">
                          <Search className="h-10 w-10 text-primary/40" />
                        </div>
                        <h3 className="text-2xl font-semibold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Ready to search</h3>
                        <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                          Enter keywords above to instantly search through your <span className="font-medium text-foreground">{files.length}</span> indexed documents.
                        </p>
                        <div className="mt-8 flex gap-2 text-xs text-muted-foreground">
                          <span className="px-2 py-1 rounded-md bg-muted border border-border">Ctrl + F</span>
                          <span>to focus search</span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Files View */}
              {activeTab === 'files' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="glass-card">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Files</p>
                          <p className="text-2xl font-bold">{stats.totalFiles}</p>
                        </div>
                        <Database className="h-8 w-8 text-primary/20" />
                      </CardContent>
                    </Card>
                    <Card className="glass-card">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Word</p>
                          <p className="text-2xl font-bold text-blue-500">{stats.wordFiles}</p>
                        </div>
                        <FileText className="h-8 w-8 text-blue-500/20" />
                      </CardContent>
                    </Card>
                    <Card className="glass-card">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">PowerPoint</p>
                          <p className="text-2xl font-bold text-orange-500">{stats.powerPointFiles}</p>
                        </div>
                        <FileText className="h-8 w-8 text-orange-500/20" />
                      </CardContent>
                    </Card>
                    <Card className="glass-card">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Text</p>
                          <p className="text-2xl font-bold text-emerald-500">{stats.textFiles}</p>
                        </div>
                        <File className="h-8 w-8 text-emerald-500/20" />
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle>Indexed Files</CardTitle>
                      <CardDescription>List of all documents currently in the index</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-2">
                          {files.map((file, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                              <div className="flex items-center gap-3">
                                {getFileIcon(file.type)}
                                <div>
                                  <p className="font-medium text-sm">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)} • {new Date(file.lastModified).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => openFile(file.path)}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Settings View */}
              {activeTab === 'settings' && (
                <div className="space-y-6 max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle>Appearance</CardTitle>
                      <CardDescription>Customize how DocuFind looks</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">Dark Mode</label>
                          <p className="text-xs text-muted-foreground">Switch between light and dark themes</p>
                        </div>
                        <Button variant="outline" onClick={toggleDarkMode}>
                          {isDarkMode ? 'Dark' : 'Light'}
                        </Button>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">RTL Support</label>
                          <p className="text-xs text-muted-foreground">Right-to-left text direction</p>
                        </div>
                        <Button variant="outline" onClick={toggleRTL}>
                          {isRTL ? 'Enabled' : 'Disabled'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle>Data Management</CardTitle>
                      <CardDescription>Manage your search index and history</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">Clear History</label>
                          <p className="text-xs text-muted-foreground">Remove all search history</p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmClearData('history')}>
                          <Trash2 className="h-4 w-4 mr-2" /> Clear
                        </Button>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">Clear Index</label>
                          <p className="text-xs text-muted-foreground">Remove all indexed files</p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmClearData('index')}>
                          <Trash2 className="h-4 w-4 mr-2" /> Clear
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md border-none shadow-2xl">
            <CardContent className="pt-8 pb-6 flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold">{loadingMessage}</h3>
                <p className="text-sm text-muted-foreground">Please wait...</p>
              </div>
              <Progress value={isScanning ? scanProgress : loadingProgress} className="h-2 w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewFile && getFileIcon(previewFile.type)}
              {previewFile?.name}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs truncate">
              {previewFile?.path}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] mt-4 rounded-md border bg-muted/50 p-4">
            {isLoadingPreview ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : (
              <pre className="text-sm whitespace-pre-wrap font-mono" dir={getTextDirection(previewContent)}>
                {previewContent}
              </pre>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmClearData !== null} onOpenChange={(open) => !open && setConfirmClearData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmClearData === 'history') clearSearchHistory()
                if (confirmClearData === 'index') clearIndexedFiles()
                setConfirmClearData(null)
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
}