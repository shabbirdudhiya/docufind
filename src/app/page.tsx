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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  EyeOff,
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
  Database,
  HelpCircle,
  Info,
  Download,
  User,
  Github,
  Plus
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { FilePreviewPane } from '@/components/FilePreviewPane'
import { FolderTree } from '@/components/FolderTree'

import { tauriAPI } from '@/lib/tauri-adapter'
import { checkForUpdates, downloadAndInstallUpdate, UpdateInfo, UpdateProgress } from '@/lib/updater'
import { initAnalytics, Analytics } from '@/lib/firebase'

interface FileData {
  path: string
  name: string
  type: 'word' | 'powerpoint' | 'text' | 'excel'
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

interface SearchHistoryItem {
  query: string
  timestamp: number
  resultsCount: number
}

// Elapsed time component that updates every second
function ElapsedTime({ startTime }: { startTime: Date }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <p className="text-xs text-muted-foreground/60 mt-2">
      Elapsed: {formatTime(elapsed)}
      {elapsed > 30 && <span className="ml-2 text-yellow-500/80">• Large folder detected</span>}
    </p>
  )
}

export default function Home() {
  const [isElectron, setIsElectron] = useState(true) // Always true for Tauri app context
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("search")

  // App State
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [indexedFolders, setIndexedFolders] = useState<string[]>([])
  const [excludedFolders, setExcludedFolders] = useState<string[]>([]) // Folders excluded from search
  const [files, setFiles] = useState<FileData[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [filteredResults, setFilteredResults] = useState<SearchResult[]>([])
  const [isIndexing, setIsIndexing] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isWatching, setIsWatching] = useState(false)
  const [isLoadingIndex, setIsLoadingIndex] = useState(true) // Loading saved index on startup
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
  const [indexingPhase, setIndexingPhase] = useState<'discovering' | 'indexing' | 'finalizing' | ''>('')
  const [filesProcessed, setFilesProcessed] = useState(0)
  const [totalFilesToProcess, setTotalFilesToProcess] = useState(0)
  const [currentFileName, setCurrentFileName] = useState('')
  const [indexingStartTime, setIndexingStartTime] = useState<Date | null>(null)

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
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)

  // Update state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const progressInterval = useRef<NodeJS.Timeout | null>(null)

  // Load saved index on startup
  useEffect(() => {
    const loadSavedIndex = async () => {
      setIsLoadingIndex(true)
      try {
        const result = await tauriAPI.loadIndex()
        console.log('📂 Load index result:', result)
        if (result.success && result.loaded) {
          // Index was loaded from disk
          if (result.folders && result.folders.length > 0) {
            setIndexedFolders(result.folders)
            setSelectedFolder(result.folders[0])
          }
          if (result.excludedFolders) {
            setExcludedFolders(result.excludedFolders)
          }
          // Get the stats from the backend
          const statsResult = await tauriAPI.getIndexStats()
          if (statsResult.success && statsResult.stats) {
            setStats({
              totalFiles: statsResult.stats.totalFiles,
              wordFiles: statsResult.stats.wordFiles,
              powerPointFiles: statsResult.stats.powerPointFiles,
              textFiles: statsResult.stats.textFiles,
              totalSize: statsResult.stats.totalSize
            })
          }
          // Get all indexed files for the Files view
          const filesResult = await tauriAPI.getAllFiles()
          if (filesResult.success && filesResult.files) {
            setFiles(filesResult.files)
            // Track index loaded
            Analytics.indexLoaded(filesResult.files.length)
          }
          console.log(`✅ Loaded ${result.fileCount} files from ${result.folderCount} folders`)
        } else {
          console.log('📭 No saved index found, starting fresh')
        }
      } catch (e) {
        console.error('Failed to load saved index:', e)
      } finally {
        setIsLoadingIndex(false)
      }
    }
    loadSavedIndex()
  }, [])

  useEffect(() => {
    setIsMounted(true)
    setIsElectron(true)
    
    // Initialize Firebase Analytics
    initAnalytics().then(() => {
      Analytics.appLaunched()
    })
    
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

    // Check for updates on startup (with small delay to not block UI)
    const checkUpdates = async () => {
      try {
        const info = await checkForUpdates()
        if (info.available) {
          setUpdateInfo(info)
          // Don't show dialog immediately if user dismissed it before in this session
          const dismissedVersion = sessionStorage.getItem('dismissedUpdateVersion')
          if (dismissedVersion !== info.version) {
            setShowUpdateDialog(true)
          }
        }
      } catch (e) {
        console.error('Failed to check for updates:', e)
      }
    }
    setTimeout(checkUpdates, 2000) // Check after 2 seconds
  }, [])

  useEffect(() => {
    tauriAPI.onIndexingStatus((event: any, data: { isIndexing: boolean; message?: string }) => {
      setIsIndexing(data.isIndexing)
      if (data.isIndexing) {
        setLoadingMessage(data.message || 'Indexing files for instant search...')
        setShowLoadingOverlay(true)
        setScanProgress(0) // Reset progress on start
        setIndexingStartTime(new Date())
      } else {
        setShowLoadingOverlay(false)
        setIndexingPhase('')
        setIndexingStartTime(null)
      }
    })

    tauriAPI.onIndexingProgress((event: any, data: { current: number; total: number; filename: string; phase?: string }) => {
      const phase = data.phase || 'indexing'
      setIndexingPhase(phase as 'discovering' | 'indexing' | 'finalizing')
      setFilesProcessed(data.current)
      setTotalFilesToProcess(data.total)
      setCurrentFileName(data.filename)
      
      if (phase === 'discovering') {
        setScanProgress(5) // Show some progress during discovery
        setLoadingMessage('Discovering files...')
      } else if (phase === 'finalizing') {
        setScanProgress(98)
        setLoadingMessage('Building search index...')
      } else {
        // Indexing phase - calculate real percentage
        const percentage = data.total > 0 ? Math.round((data.current / data.total) * 95) + 3 : 0
        setScanProgress(Math.min(percentage, 97))
        setLoadingMessage(`Processing: ${data.filename}`)
      }
    })

    return () => {
      tauriAPI.removeAllListeners('indexing-status')
      tauriAPI.removeAllListeners('indexing-progress')
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchInputRef.current?.focus(); setActiveTab('search') }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); selectFolder() }
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

  const clearIndexedFiles = async () => {
    try {
      // Clear backend index
      await tauriAPI.clearIndex()
      // Clear frontend state
      setFiles([])
      setSearchResults([])
      setFilteredResults([])
      setIndexedFolders([])
      setExcludedFolders([])
      setSelectedFolder(null)
      setStats({ totalFiles: 0, wordFiles: 0, powerPointFiles: 0, textFiles: 0, totalSize: 0 })
    } catch (err) {
      setError('Failed to clear index')
      console.error(err)
    }
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

  // Excluded folders management
  const toggleFolderExclusion = async (folderPath: string) => {
    try {
      if (excludedFolders.includes(folderPath)) {
        // Remove from exclusion
        const result = await tauriAPI.removeExcludedFolder(folderPath)
        if (result.success) {
          setExcludedFolders(prev => prev.filter(f => f !== folderPath))
        }
      } else {
        // Add to exclusion
        const result = await tauriAPI.addExcludedFolder(folderPath)
        if (result.success) {
          setExcludedFolders(prev => [...prev, folderPath])
        }
      }
    } catch (err) {
      setError('Failed to update folder exclusion')
      console.error(err)
    }
  }

  const previewFileContent = async (file: FileData) => {
    setIsLoadingPreview(true)
    setPreviewFile(file)
    setPreviewOpen(true)
    setPreviewContent('')
    
    try {
      const result = await tauriAPI.extractContent(file.path)
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
    setIsScanning(true)
    setShowLoadingOverlay(true)
    setScanProgress(0)
    setLoadingProgress(0)
    setLoadingMessage('Scanning folder for documents...')

    // Simulate progress animation
    let progress = 0
    progressInterval.current = setInterval(() => {
      progress += Math.random() * 10
      if (progress > 85) progress = 85
      setScanProgress(progress)
      setLoadingProgress(progress)
    }, 300)

    try {
      const result = await tauriAPI.scanFolder(folderPath)
      if (progressInterval.current) clearInterval(progressInterval.current)

      if (result.success && result.files) {
        setLoadingMessage(`Found ${result.files.length} files! Indexing...`)
        setScanProgress(95)
        setLoadingProgress(95)
        
        // Track folder added analytics
        Analytics.folderAdded(result.files.length)
        
        // Append new files to existing files (for multi-folder support)
        setFiles(prevFiles => {
          // Remove any existing files from this folder to avoid duplicates
          const otherFiles = prevFiles.filter(f => !f.path.startsWith(folderPath))
          const allFiles = [...otherFiles, ...result.files]
          updateStats(allFiles)
          return allFiles
        })
        
        setScanProgress(100)
        setLoadingProgress(100)

        // Close loading overlay after a brief delay
        setTimeout(() => setShowLoadingOverlay(false), 500)
      } else {
        setError(result.error || 'Failed to scan folder')
        setShowLoadingOverlay(false)
      }
    } catch (err) {
      if (progressInterval.current) clearInterval(progressInterval.current)
      setError('Scanning failed')
      console.error(err)
      setShowLoadingOverlay(false)
    } finally {
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    tauriAPI.onFileAdded((event: any, data: any) => { if (selectedFolder) scanFolder(selectedFolder) })
    tauriAPI.onFileUpdated((event: any, data: any) => { if (selectedFolder) scanFolder(selectedFolder) })
    tauriAPI.onFileRemoved((event: any, data: any) => { if (selectedFolder) scanFolder(selectedFolder) })
    return () => {
      tauriAPI.removeAllListeners('file-added')
      tauriAPI.removeAllListeners('file-updated')
      tauriAPI.removeAllListeners('file-removed')
    }
  }, [selectedFolder, scanFolder])

  const selectFolder = async () => {
    try {
      const folderPath = await tauriAPI.selectFolder()
      if (folderPath) {
        // Check if folder is already indexed
        if (indexedFolders.includes(folderPath)) {
          setError('This folder is already indexed')
          return
        }
        setSelectedFolder(folderPath)
        setIndexedFolders(prev => [...prev, folderPath])
        setError(null)
        await scanFolder(folderPath)
      }
    } catch (err) {
      setError('Failed to select folder')
      console.error(err)
    }
  }

  const removeFolder = async (folderPath: string) => {
    try {
      await tauriAPI.removeFolder(folderPath)
      setIndexedFolders(prev => prev.filter(f => f !== folderPath))
      // Remove files from this folder
      setFiles(prev => prev.filter(f => !f.path.startsWith(folderPath)))
      if (selectedFolder === folderPath) {
        setSelectedFolder(indexedFolders.find(f => f !== folderPath) || null)
      }
    } catch (err) {
      setError('Failed to remove folder')
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
    if (!searchQuery.trim() || files.length === 0) return

    console.log(`🔎 Searching for "${searchQuery}" in ${files.length} files`)
    setIsSearching(true)
    setShowLoadingOverlay(true)
    setLoadingProgress(0)
    setLoadingMessage('Searching through documents...')

    // Simulate progress animation
    let progress = 0
    progressInterval.current = setInterval(() => {
      progress += Math.random() * 15
      if (progress > 90) progress = 90
      setLoadingProgress(progress)
    }, 200)

    try {
      const result = await tauriAPI.searchFiles(searchQuery, selectedFolder)
      console.log('🎯 Search result:', result)
      if (progressInterval.current) clearInterval(progressInterval.current)
      setLoadingProgress(100)
      if (result.success && result.results) {
        console.log(`✅ Found ${result.results.length} results`, result.results)
        setLoadingMessage(`Found ${result.results.length} results!`)
        setSearchResults(result.results)
        addToSearchHistory(searchQuery, result.results.length)
        // Track search analytics
        Analytics.searchPerformed(result.results.length, searchQuery.length)
        setTimeout(() => setShowLoadingOverlay(false), 300)
      } else {
        console.error('❌ Search failed:', result.error)
        setError(result.error || 'Search failed')
        setShowLoadingOverlay(false)
      }
    } catch (err) {
      if (progressInterval.current) clearInterval(progressInterval.current)
      setError('Search failed')
      console.error(err)
      setShowLoadingOverlay(false)
    } finally {
      setIsSearching(false)
    }
  }

  const toggleWatching = async () => {
    if (!selectedFolder) return
    try {
      if (isWatching) {
        await tauriAPI.stopWatching()
        setIsWatching(false)
      } else {
        await tauriAPI.startWatching()
        setIsWatching(true)
      }
    } catch (err) {
      setError('Failed to toggle file watching')
      console.error(err)
    }
  }

  const handleUpdate = async () => {
    setIsUpdating(true)
    setUpdateProgress(null)
    try {
      await downloadAndInstallUpdate((progress) => {
        setUpdateProgress(progress)
      })
      // App will restart automatically after update
    } catch (err) {
      console.error('Update failed:', err)
      setError('Failed to install update. Please try again later.')
      setIsUpdating(false)
    }
  }

  const dismissUpdate = () => {
    setShowUpdateDialog(false)
    setUpdateDismissed(true)
    if (updateInfo?.version) {
      sessionStorage.setItem('dismissedUpdateVersion', updateInfo.version)
    }
  }

  const getFileIcon = (type: 'word' | 'powerpoint' | 'text' | 'excel') => {
    switch (type) {
      case 'word': return <FileText className="h-4 w-4 text-blue-600" />
      case 'powerpoint': return <FileText className="h-4 w-4 text-orange-600" />
      case 'excel': return <FileText className="h-4 w-4 text-green-600" />
      default: return <File className="h-4 w-4 text-gray-600" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Extract searchable terms from an advanced query (removes operators, extracts phrases and words)
  const extractSearchTerms = (query: string): string[] => {
    const terms: string[] = []
    
    // Extract exact phrases (quoted strings)
    const phraseMatches = query.match(/"([^"]+)"/g)
    if (phraseMatches) {
      phraseMatches.forEach(match => {
        terms.push(match.replace(/"/g, ''))
      })
    }
    
    // Remove quotes and operators, then extract remaining words
    let remaining = query
      .replace(/"[^"]+"/g, '') // Remove quoted phrases
      .replace(/\b(AND|OR|NOT)\b/gi, '') // Remove operators
      .replace(/[+\-*?:]/g, ' ') // Remove special chars
      .trim()
    
    // Add individual words (filter out empty strings)
    remaining.split(/\s+/).forEach(word => {
      if (word && word.length > 1) {
        terms.push(word)
      }
    })
    
    return terms
  }

  const highlightText = (text: string, query: string) => {
    if (!query) return text
    
    // Extract actual search terms from the query
    const terms = extractSearchTerms(query)
    if (terms.length === 0) return text
    
    // Create regex pattern that matches any of the terms
    const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 px-1 rounded text-black dark:text-white font-medium">{part}</mark> : part
    )
  }

  const openFile = async (filePath: string, withSearchTerm?: string) => {
    try { 
      // If a search term is provided, use the smart open that navigates to the match
      if (withSearchTerm && withSearchTerm.trim()) {
        await tauriAPI.openFileAndSearch(filePath, withSearchTerm)
      } else {
        await tauriAPI.openFile(filePath)
      }
      // Track file open - extract file type from extension
      const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown'
      Analytics.fileOpened(ext)
    } catch (err) { setError('Failed to open file'); console.error(err) }
  }

  const openFileLocation = async (filePath: string) => {
    try { await tauriAPI.openFileLocation(filePath) } catch (err) { setError('Failed to open file location'); console.error(err) }
  }

  const handleDeleteFile = async () => {
    if (!fileToDelete) return
    try {
      const result = await tauriAPI.deleteFile(fileToDelete)
      if (result.success) {
        // Track file deletion
        Analytics.fileDeleted()
        // Remove from local state immediately
        setFiles(prev => prev.filter(f => f.path !== fileToDelete))
        setSearchResults(prev => prev.filter(r => r.file.path !== fileToDelete))
        setFilteredResults(prev => prev.filter(r => r.file.path !== fileToDelete))
        updateStats(files.filter(f => f.path !== fileToDelete))
        setFileToDelete(null)
      } else {
        setError('Failed to delete file: ' + result.error)
      }
    } catch (err) {
      setError('Failed to delete file')
      console.error(err)
    }
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
                {activeTab === 'help' && 'Help & About'}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Status indicator */}
              {files.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className={`h-2 w-2 rounded-full ${isWatching ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                  <span>{files.length} files</span>
                </div>
              )}
            </div>
          </header>

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">

              {/* Error Alert */}
              {error && (
                <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>{error}</span>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-6 px-2">
                      <X className="h-4 w-4" />
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Search View */}
              {activeTab === 'search' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Search Bar & Folder Select */}
                  <Card className="glass-card border-none shadow-xl">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex gap-4">
                        <Button onClick={selectFolder} disabled={isScanning} className="h-12 px-6 text-base shadow-lg shadow-primary/20 transition-all hover:scale-105">
                          {isScanning ? (
                            <>
                              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <FolderOpen className="h-5 w-5 mr-2" />
                              {indexedFolders.length > 0 ? 'Add Folder' : 'Select Folder'}
                            </>
                          )}
                        </Button>
                        <div className="flex-1 relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            ref={searchInputRef}
                            placeholder="Search documents... (Ctrl+F)"
                            className="h-12 pl-12 pr-12 text-base bg-background/50 border-border/50 focus:bg-background transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchFiles()}
                            disabled={files.length === 0 || isScanning}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {searchQuery && (
                              <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                                <X className="h-4 w-4" />
                              </button>
                            )}
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-muted-foreground hover:text-primary transition-colors p-1" title="Search syntax help">
                                  <HelpCircle className="h-4 w-4" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80" align="end">
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-sm">Advanced Search Syntax</h4>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center gap-2">
                                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono">word1 AND word2</code>
                                      <span className="text-muted-foreground">Both terms required</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2">
                                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono">word1 OR word2</code>
                                      <span className="text-muted-foreground">Either term</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2">
                                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono">&quot;exact phrase&quot;</code>
                                      <span className="text-muted-foreground">Exact match</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2">
                                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono">-word</code>
                                      <span className="text-muted-foreground">Exclude term</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2">
                                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono">repo*</code>
                                      <span className="text-muted-foreground">Wildcard prefix</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-2">
                                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono">name:report</code>
                                      <span className="text-muted-foreground">Search filename</span>
                                    </div>
                                  </div>
                                  <Separator />
                                  <p className="text-xs text-muted-foreground">
                                    Example: <code className="bg-muted px-1 rounded">&quot;annual report&quot; AND budget -draft</code>
                                  </p>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        <Button onClick={searchFiles} disabled={!searchQuery.trim() || files.length === 0} className="h-12 w-12 p-0 rounded-xl transition-all hover:scale-105">
                          {isSearching ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                        </Button>
                      </div>

                      {/* Loading saved index indicator */}
                      {isLoadingIndex && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1 animate-pulse">
                          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                          <span>Loading saved index...</span>
                        </div>
                      )}

                      {selectedFolder && !isLoadingIndex && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                          <div className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span className="font-mono truncate max-w-xl">{selectedFolder}</span>
                          <span className="mx-2">•</span>
                          <span>{files.length} files indexed</span>
                          {excludedFolders.length > 0 && (
                            <>
                              <span className="mx-2">•</span>
                              <span className="text-muted-foreground/60">{excludedFolders.length} folder{excludedFolders.length !== 1 ? 's' : ''} excluded</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Indexed Folders List */}
                      {indexedFolders.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Indexed Folders ({indexedFolders.length})</span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={selectFolder}
                              disabled={isScanning}
                              className="h-7 px-2 text-xs"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Folder
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {indexedFolders.map((folder) => {
                              const isExcluded = excludedFolders.includes(folder)
                              return (
                                <TooltipProvider key={folder}>
                                  <div 
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${
                                      isExcluded 
                                        ? 'bg-muted text-muted-foreground opacity-60' 
                                        : 'bg-primary/10 text-primary'
                                    }`}
                                  >
                                    <FolderOpen className="h-3 w-3" />
                                    <span className={`truncate max-w-[200px] ${isExcluded ? 'line-through' : ''}`} title={folder}>
                                      {folder.split(/[/\\]/).pop()}
                                    </span>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => toggleFolderExclusion(folder)}
                                          className={`rounded-full p-0.5 transition-colors ${
                                            isExcluded 
                                              ? 'hover:bg-primary/20 text-muted-foreground' 
                                              : 'hover:bg-primary/20'
                                          }`}
                                          title={isExcluded ? "Include in search" : "Exclude from search"}
                                        >
                                          {isExcluded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {isExcluded ? "Include in search results" : "Exclude from search results"}
                                      </TooltipContent>
                                    </Tooltip>
                                    <button
                                      onClick={() => removeFolder(folder)}
                                      className="hover:bg-destructive/20 hover:text-destructive rounded-full p-0.5"
                                      title="Remove folder from index"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </TooltipProvider>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Results Area */}
                  {isSearching ? (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm text-muted-foreground">Searching documents...</span>
                        </div>
                        <Skeleton className="h-8 w-24" />
                      </div>
                      <div className="grid gap-4">
                        {[1, 2, 3, 4].map((i) => (
                          <Card key={i} className="border-border/50 bg-card/50 backdrop-blur-sm animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                            <CardContent className="p-5">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-4">
                                  <Skeleton className="h-12 w-12 rounded-xl" />
                                  <div className="space-y-2">
                                    <Skeleton className="h-5 w-56" />
                                    <Skeleton className="h-3 w-40" />
                                  </div>
                                </div>
                                <Skeleton className="h-6 w-16 rounded-full" />
                              </div>
                              <div className="space-y-2 mt-4">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-5/6" />
                                <Skeleton className="h-4 w-2/3" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ) : filteredResults.length > 0 ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Found <span className="text-foreground font-semibold">{filteredResults.length}</span> results
                        </h3>
                        <div className="flex gap-2">
                          <Popover open={showSearchHistory} onOpenChange={setShowSearchHistory}>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className={`transition-colors ${showSearchHistory ? 'bg-accent' : ''}`}>
                                <History className="h-4 w-4 mr-2" /> History
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80" align="end">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-sm">Recent Searches</h4>
                                  {searchHistory.length > 0 && (
                                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSearchHistory([])}>
                                      Clear
                                    </Button>
                                  )}
                                </div>
                                {searchHistory.length > 0 ? (
                                  <div className="space-y-1 max-h-64 overflow-y-auto">
                                    {searchHistory.slice(0, 10).map((item, idx) => (
                                      <button
                                        key={idx}
                                        className="w-full flex items-center justify-between p-2 rounded-md hover:bg-accent text-sm text-left transition-colors"
                                        onClick={() => {
                                          setSearchQuery(item.query)
                                          setShowSearchHistory(false)
                                          searchFiles()
                                        }}
                                      >
                                        <span className="truncate flex-1">{item.query}</span>
                                        <span className="text-xs text-muted-foreground ml-2">{item.resultsCount} results</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center py-4">No recent searches</p>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} className={`transition-colors ${showFilters ? 'bg-accent' : ''}`}>
                            <Filter className="h-4 w-4 mr-2" /> Filters
                          </Button>
                        </div>
                      </div>

                      {showFilters && (
                        <Card className="glass-card animate-in slide-in-from-top-2 duration-300">
                          <CardContent className="p-4 grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-medium">File Type</label>
                              <Select value={filterFileType} onValueChange={setFilterFileType}>
                                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Types</SelectItem>
                                  <SelectItem value="word">Word</SelectItem>
                                  <SelectItem value="powerpoint">PowerPoint</SelectItem>
                                  <SelectItem value="excel">Excel</SelectItem>
                                  <SelectItem value="text">Text</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium">Date Range</label>
                              <Select value={filterDateRange} onValueChange={setFilterDateRange}>
                                <SelectTrigger><SelectValue placeholder="Any time" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Any time</SelectItem>
                                  <SelectItem value="today">Today</SelectItem>
                                  <SelectItem value="week">Past week</SelectItem>
                                  <SelectItem value="month">Past month</SelectItem>
                                  <SelectItem value="year">Past year</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium">File Size</label>
                              <Select 
                                value={filterMinSize === 0 && filterMaxSize === 100 ? 'all' : 'custom'} 
                                onValueChange={(val) => {
                                  if (val === 'all') { setFilterMinSize(0); setFilterMaxSize(100); }
                                  else if (val === 'small') { setFilterMinSize(0); setFilterMaxSize(1); }
                                  else if (val === 'medium') { setFilterMinSize(1); setFilterMaxSize(10); }
                                  else if (val === 'large') { setFilterMinSize(10); setFilterMaxSize(100); }
                                }}
                              >
                                <SelectTrigger><SelectValue placeholder="Any size" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Any size</SelectItem>
                                  <SelectItem value="small">Small (&lt;1MB)</SelectItem>
                                  <SelectItem value="medium">Medium (1-10MB)</SelectItem>
                                  <SelectItem value="large">Large (&gt;10MB)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="grid gap-4">
                        {filteredResults.map((result, index) => (
                          <Card 
                            key={index} 
                            className="group hover:shadow-xl hover:scale-[1.01] transition-all duration-200 border-border/50 bg-card/50 backdrop-blur-sm cursor-pointer animate-in fade-in slide-in-from-bottom-2"
                            style={{ animationDelay: `${Math.min(index * 50, 300)}ms`, animationFillMode: 'both' }}
                            onClick={() => previewFileContent(result.file)}
                          >
                            <CardContent className="p-5">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-4">
                                  <div className="p-3 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-colors">
                                    {getFileIcon(result.file?.type)}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-lg leading-none mb-1 group-hover:text-primary transition-colors">{result.file?.name}</h4>
                                    <p className="text-xs text-muted-foreground font-mono truncate max-w-md">{result.file?.path}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" onClick={() => openFile(result.file?.path)} title="Open in app" className="text-muted-foreground hover:bg-primary/10 hover:text-primary">
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => openFileLocation(result.file?.path)} title="Show in folder" className="text-muted-foreground hover:bg-primary/10 hover:text-primary">
                                    <FolderOpen className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2 bg-muted/30 rounded-xl p-3 border border-border/10">
                                {(result.matches || []).slice(0, 2).map((match, i) => (
                                  <p key={i} className="text-sm text-muted-foreground leading-relaxed font-mono">
                                    ...{highlightText(match?.context || '', searchQuery)}...
                                  </p>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ) : (
                    !isSearching && !isLoadingIndex && (
                      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mb-6 ring-1 ring-primary/20">
                          <Search className="h-10 w-10 text-primary/40" />
                        </div>
                        {files.length > 0 ? (
                          <>
                            <h3 className="text-2xl font-semibold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Ready to search</h3>
                            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                              Enter keywords above to instantly search through your <span className="font-medium text-foreground">{files.length}</span> indexed documents.
                            </p>
                          </>
                        ) : (
                          <>
                            <h3 className="text-2xl font-semibold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Welcome to DocuFind</h3>
                            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                              Select a folder to get started. Your index will be saved automatically so you don't have to re-index every time.
                            </p>
                          </>
                        )}
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
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => openFile(file.path)} title="Open">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => setFileToDelete(file.path)} title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
                      <CardTitle>File Watching</CardTitle>
                      <CardDescription>Automatically detect changes in your indexed folders</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">Watch for Changes</label>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            When enabled, DocuFind will automatically update the search index when files are added, modified, or deleted in your indexed folders.
                          </p>
                        </div>
                        <Button 
                          variant={isWatching ? "default" : "outline"} 
                          onClick={toggleWatching}
                          disabled={indexedFolders.length === 0}
                          className={`gap-2 transition-all ${isWatching ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                        >
                          {isWatching ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          {isWatching ? 'Watching' : 'Start Watching'}
                        </Button>
                      </div>
                      {isWatching && (
                        <div className="text-xs text-emerald-600 flex items-center gap-2 animate-in fade-in">
                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Monitoring {indexedFolders.length} folder{indexedFolders.length !== 1 ? 's' : ''} for changes
                        </div>
                      )}
                      {indexedFolders.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">Add folders to enable file watching</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Folder Exclusions Section - Hierarchical Tree */}
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5" />
                        Folder Exclusions
                      </CardTitle>
                      <CardDescription>
                        Toggle folders on/off to include or exclude them from search results.
                        Unchecked folders won't appear in search results but remain in the index.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {indexedFolders.length > 0 ? (
                        <FolderTree 
                          onExclusionChange={async () => {
                            // Refresh excluded folders list
                            const result = await tauriAPI.getExcludedFolders()
                            if (result.success && result.folders) {
                              setExcludedFolders(result.folders)
                            }
                          }}
                          className="max-h-[400px]"
                        />
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No folders indexed yet</p>
                          <p className="text-xs mt-1">Add folders to see the folder tree</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Data Management
                      </CardTitle>
                      <CardDescription>Manage your search index and history</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <Database className="h-4 w-4" />
                          <span className="text-sm font-medium">Persistent Storage Enabled</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Your index is automatically saved and restored when you reopen the app. No need to re-index!
                        </p>
                      </div>
                      <Separator />
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
                          <p className="text-xs text-muted-foreground">Remove all indexed files and saved data</p>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => setConfirmClearData('index')}>
                          <Trash2 className="h-4 w-4 mr-2" /> Clear
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Help View */}
              {activeTab === 'help' && (
                <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Hero Section */}
                  <div className="text-center py-8 space-y-4">
                    <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-primary/20">
                      <Database className="h-10 w-10 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight">DocuFind</h2>
                      <p className="text-muted-foreground mt-2">Your intelligent local document search engine</p>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <span className="px-2 py-1 rounded-md bg-muted border border-border">v1.0.0</span>
                      <span>•</span>
                      <span>Built with ❤️ by Shabbir Dudhiya</span>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {/* How to Use */}
                    <Card className="glass-card h-full">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <HelpCircle className="h-5 w-5 text-primary" />
                          How to Use
                        </CardTitle>
                        <CardDescription>Get started in 4 simple steps</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="flex gap-4">
                          <div className="flex-none w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">1</div>
                          <div>
                            <h4 className="font-medium mb-1">Select a Folder</h4>
                            <p className="text-sm text-muted-foreground">Click the "Select Folder" button to choose the directory you want to search.</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-none w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">2</div>
                          <div>
                            <h4 className="font-medium mb-1">Index Once</h4>
                            <p className="text-sm text-muted-foreground">DocuFind indexes your documents once and saves them. Next time you open the app, it's instant!</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-none w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">3</div>
                          <div>
                            <h4 className="font-medium mb-1">Search Instantly</h4>
                            <p className="text-sm text-muted-foreground">Type any keyword in the search bar. Results appear instantly as you type.</p>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-none w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">4</div>
                          <div>
                            <h4 className="font-medium mb-1">Preview & Open</h4>
                            <p className="text-sm text-muted-foreground">Click results to preview, or use icons to open files. Exclude folders from search using the eye icon.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      {/* Features */}
                      <Card className="glass-card">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Key Features
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded-md bg-emerald-500/10">
                              <Database className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Persistent Index</p>
                              <p className="text-xs text-muted-foreground">Your index is saved automatically — no re-indexing needed!</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded-md bg-orange-500/10">
                              <EyeOff className="h-4 w-4 text-orange-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">Search Exclusions</p>
                              <p className="text-xs text-muted-foreground">Hide folders from search without removing them from the index.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="p-1.5 rounded-md bg-blue-500/10">
                              <Eye className="h-4 w-4 text-blue-500" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">File Watching</p>
                              <p className="text-xs text-muted-foreground">Auto-update index when files change in watched folders.</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Updates */}
                      <Card className="glass-card">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5 text-primary" />
                            Updates
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                            <p className="font-medium">How to update DocuFind:</p>
                            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                              <li>Download the latest version installer.</li>
                              <li>Run the installer (no need to uninstall first).</li>
                              <li>The app will update and restart automatically.</li>
                            </ol>
                            <div className="pt-2 mt-2 border-t border-border/50">
                              <p className="text-xs text-muted-foreground">
                                Current Version: <span className="font-mono text-foreground">1.0.0</span>
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Tips Section */}
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-primary" />
                        Tips & Shortcuts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                          <p className="font-medium">Keyboard Shortcuts</p>
                          <div className="space-y-1 text-muted-foreground">
                            <div className="flex justify-between"><span>Focus search</span><kbd className="px-2 py-0.5 bg-muted rounded text-xs">Ctrl+F</kbd></div>
                            <div className="flex justify-between"><span>Open folder</span><kbd className="px-2 py-0.5 bg-muted rounded text-xs">Ctrl+O</kbd></div>
                            <div className="flex justify-between"><span>Toggle dark mode</span><kbd className="px-2 py-0.5 bg-muted rounded text-xs">Ctrl+D</kbd></div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="font-medium">Search Tips</p>
                          <div className="space-y-1 text-muted-foreground text-xs">
                            <p>• Use <code className="bg-muted px-1 rounded">AND</code> for multiple required terms</p>
                            <p>• Use <code className="bg-muted px-1 rounded">"quotes"</code> for exact phrases</p>
                            <p>• Use <code className="bg-muted px-1 rounded">-word</code> to exclude terms</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Author Footer */}
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    <p>
                      DocuFind v1.0.0 • Created by <span className="font-medium text-foreground">Shabbir Dudhiya</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Loading Overlay */}
      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-none shadow-2xl bg-card/90 backdrop-blur-xl ring-1 ring-border/50">
            <CardContent className="pt-10 pb-8 flex flex-col items-center text-center space-y-6">

              {/* Animation */}
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping opacity-20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center overflow-hidden">
                    <FileText className="h-8 w-8 text-primary animate-bounce" />
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/30 animate-pulse" />
                  </div>
                </div>
                {/* Flying particles */}
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500/20 rounded-full animate-bounce delay-100" />
                <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-orange-500/20 rounded-full animate-bounce delay-300" />
              </div>

              <div className="space-y-2 w-full">
                <h3 className="text-xl font-bold tracking-tight">
                  {isScanning ? (
                    indexingPhase === 'discovering' ? 'Discovering Files' :
                    indexingPhase === 'finalizing' ? 'Finalizing Index' :
                    'Building Search Index'
                  ) : 'Searching...'}
                </h3>
                {isScanning && (
                  <p className="text-sm text-muted-foreground font-medium text-primary/80">
                    {indexingPhase === 'discovering' ? 'Scanning folder structure...' :
                     indexingPhase === 'finalizing' ? 'Almost done!' :
                     'This process only happens once'}
                  </p>
                )}
              </div>

              <div className="w-full space-y-3">
                {/* Progress stats row */}
                <div className="flex justify-between text-xs text-muted-foreground font-mono px-1">
                  <span className="flex items-center gap-1">
                    {isScanning && totalFilesToProcess > 0 && (
                      <span className="text-primary font-semibold">{filesProcessed}/{totalFilesToProcess} files</span>
                    )}
                    {isScanning && totalFilesToProcess === 0 && indexingPhase === 'discovering' && (
                      <span className="animate-pulse">Scanning...</span>
                    )}
                    {!isScanning && <span>{loadingMessage.split(':')[0]}</span>}
                  </span>
                  <span className="font-semibold">{Math.round(isScanning ? scanProgress : loadingProgress)}%</span>
                </div>
                
                {/* Progress bar */}
                <Progress value={isScanning ? scanProgress : loadingProgress} className="h-2.5 w-full" />
                
                {/* Current file being processed */}
                {isScanning && currentFileName && indexingPhase === 'indexing' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/80 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <p className="truncate max-w-[320px]" title={currentFileName}>
                      {currentFileName}
                    </p>
                  </div>
                )}
                
                {/* Elapsed time for long operations */}
                {isScanning && indexingStartTime && (
                  <ElapsedTime startTime={indexingStartTime} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preview Modal */}
      <FilePreviewPane
        file={previewFile}
        content={previewContent}
        searchQuery={searchQuery}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onOpenFile={(path) => openFile(path, searchQuery)}
        onOpenLocation={(path) => openFileLocation(path)}
        isLoading={isLoadingPreview}
      />

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

      {/* Delete File Confirmation */}
      <AlertDialog open={fileToDelete !== null} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to move this file to the trash?
              <br />
              <span className="font-mono text-xs text-muted-foreground mt-2 block break-all">{fileToDelete}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteFile}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Available Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-green-500" />
              Update Available!
            </DialogTitle>
            <DialogDescription>
              A new version of DocuFind is ready to install.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {updateInfo && (
              <>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">New Version</span>
                  <Badge variant="secondary" className="font-mono">
                    v{updateInfo.version}
                  </Badge>
                </div>
                
                {updateInfo.body && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">What's New:</span>
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg max-h-32 overflow-y-auto">
                      {updateInfo.body}
                    </div>
                  </div>
                )}
              </>
            )}

            {isUpdating && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {updateProgress ? 'Downloading...' : 'Preparing...'}
                  </span>
                  <span className="font-mono">
                    {updateProgress ? `${updateProgress.percentage}%` : '...'}
                  </span>
                </div>
                <Progress value={updateProgress?.percentage || 0} className="h-2" />
                {updateProgress && (
                  <p className="text-xs text-muted-foreground text-center">
                    {(updateProgress.downloaded / 1024 / 1024).toFixed(1)} MB / {(updateProgress.total / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button 
              variant="outline" 
              onClick={dismissUpdate}
              disabled={isUpdating}
            >
              Later
            </Button>
            <Button 
              onClick={handleUpdate}
              disabled={isUpdating}
              className="gap-2"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Update Now
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Available Banner (shows after dismissing dialog) */}
      {updateInfo?.available && updateDismissed && !showUpdateDialog && (
        <div 
          className="fixed bottom-4 right-4 z-40 cursor-pointer"
          onClick={() => setShowUpdateDialog(true)}
        >
          <Card className="bg-green-500/10 border-green-500/30 hover:bg-green-500/20 transition-colors">
            <CardContent className="p-3 flex items-center gap-3">
              <Download className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">
                Update v{updateInfo.version} available
              </span>
              <Badge variant="outline" className="text-xs">Click to install</Badge>
            </CardContent>
          </Card>
        </div>
      )}
    </SidebarProvider>
  )
}