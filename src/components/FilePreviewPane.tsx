import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExternalLink, FolderOpen, ChevronUp, ChevronDown, X, FileText, File, Eye, AlignLeft, Loader2, Type } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StructuredContentRenderer } from './StructuredContentRenderer'
import type { DocumentContent } from '@/lib/tauri-adapter'

interface FileData {
    path: string
    name: string
    type: 'word' | 'powerpoint' | 'text' | 'pdf' | 'excel'
    size: number
    lastModified: Date
}

type ViewMode = 'text' | 'rich'

// Available font options for preview
const FONT_OPTIONS = [
    // Custom Arabic fonts (default)
    { value: 'kanz-marjaan', label: 'Kanz Al Marjaan', family: '"Kanz Al Marjaan", "Traditional Arabic", serif', group: 'arabic' },
    { value: 'al-kanz', label: 'Al-Kanz', family: '"Al-Kanz", "Traditional Arabic", serif', group: 'arabic' },
    { value: 'amiri', label: 'Amiri', family: 'Amiri, "Traditional Arabic", "Simplified Arabic", serif', group: 'arabic' },
    { value: 'noto-arabic', label: 'Noto Sans Arabic', family: '"Noto Sans Arabic", "Segoe UI", sans-serif', group: 'arabic' },
    // Standard system fonts
    { value: 'system', label: 'System Default', family: 'ui-sans-serif, system-ui, sans-serif', group: 'standard' },
    { value: 'arial', label: 'Arial', family: 'Arial, sans-serif', group: 'standard' },
    { value: 'times', label: 'Times New Roman', family: '"Times New Roman", Times, serif', group: 'standard' },
    { value: 'georgia', label: 'Georgia', family: 'Georgia, serif', group: 'standard' },
    { value: 'verdana', label: 'Verdana', family: 'Verdana, sans-serif', group: 'standard' },
    { value: 'tahoma', label: 'Tahoma', family: 'Tahoma, sans-serif', group: 'standard' },
    { value: 'courier', label: 'Courier New', family: '"Courier New", Courier, monospace', group: 'standard' },
    { value: 'calibri', label: 'Calibri', family: 'Calibri, sans-serif', group: 'standard' },
    { value: 'segoe', label: 'Segoe UI', family: '"Segoe UI", sans-serif', group: 'standard' },
] as const

// Default font for preview
const DEFAULT_FONT = 'kanz-marjaan'

// Regex to detect Arabic/RTL text (Arabic Unicode range)
const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

// Helper to detect if content contains significant RTL text
const detectRTL = (text: string): boolean => {
    if (!text) return false
    // Count Arabic characters
    const arabicMatches = text.match(RTL_REGEX)
    if (!arabicMatches) return false
    // If more than 10% of first 1000 chars are Arabic, consider it RTL
    const sampleText = text.slice(0, 1000)
    const arabicCount = (sampleText.match(new RegExp(RTL_REGEX, 'g')) || []).length
    return arabicCount / sampleText.length > 0.1
}

interface FilePreviewPaneProps {
    file: FileData | null
    content: string
    structuredContent?: DocumentContent | null
    searchQuery: string
    isOpen: boolean
    onClose: () => void
    onOpenFile: (path: string) => void
    onOpenLocation: (path: string) => void
    isLoading: boolean
    isOpeningFile?: boolean  // New: show spinner when opening file in external app
}

export function FilePreviewPane({
    file,
    content,
    structuredContent,
    searchQuery,
    isOpen,
    onClose,
    onOpenFile,
    onOpenLocation,
    isLoading,
    isOpeningFile = false
}: FilePreviewPaneProps) {
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
    const [totalMatches, setTotalMatches] = useState(0)
    const [viewMode, setViewMode] = useState<ViewMode>('text')
    const [selectedFont, setSelectedFont] = useState<string>(DEFAULT_FONT)
    const contentRef = useRef<HTMLDivElement>(null)
    const matchRefs = useRef<(HTMLElement | null)[]>([])

    // Detect RTL content using regex
    const isRTL = useMemo(() => detectRTL(content), [content])

    // Get the font family for the selected font
    const fontFamily = useMemo(() => {
        const font = FONT_OPTIONS.find(f => f.value === selectedFont)
        return font?.family || FONT_OPTIONS[0].family
    }, [selectedFont])

    // Check if rich view is available (structured content exists with sections)
    const richViewAvailable = structuredContent && structuredContent.sections && structuredContent.sections.length > 0

    // If rich view not available, force text mode
    const effectiveViewMode = richViewAvailable ? viewMode : 'text'

    // Reset state when file or query changes
    useEffect(() => {
        setCurrentMatchIndex(0)
        setTotalMatches(0)
        matchRefs.current = []
    }, [file, searchQuery])

    // Count matches and scroll to first match
    // Helper to extract terms for match counting
    const getSearchRegex = (query: string): RegExp | null => {
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
            .replace(/"[^"]+"/g, '')
            .replace(/\b(AND|OR|NOT)\b/gi, '')
            .replace(/[+\-*?:]/g, ' ')
            .trim()

        remaining.split(/\s+/).forEach(word => {
            if (word && word.length > 1) {
                terms.push(word)
            }
        })

        if (terms.length === 0) return null

        const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        return new RegExp(`(${escapedTerms.join('|')})`, 'gi')
    }

    // Count matches for text view only (rich view handles its own counting)
    useEffect(() => {
        if (effectiveViewMode !== 'text') return
        if (!content || !searchQuery) return

        const regex = getSearchRegex(searchQuery)
        if (!regex) {
            setTotalMatches(0)
            return
        }

        const matches = content.match(regex)
        const count = matches ? matches.length : 0
        setTotalMatches(count)

        if (count > 0) {
            // Small delay to ensure rendering is done
            setTimeout(() => {
                scrollToMatch(0)
            }, 100)
        }
    }, [content, searchQuery, isOpen, effectiveViewMode])

    // Handler for match count from StructuredContentRenderer
    const handleStructuredMatchCount = (count: number) => {
        if (effectiveViewMode === 'rich') {
            setTotalMatches(count)
        }
    }

    const scrollToMatch = (index: number) => {
        if (index >= 0 && index < matchRefs.current.length) {
            const element = matchRefs.current[index]
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                setCurrentMatchIndex(index)
            }
        }
    }

    const handleNextMatch = () => {
        const nextIndex = (currentMatchIndex + 1) % totalMatches
        setCurrentMatchIndex(nextIndex)
        // For text view, also scroll
        if (effectiveViewMode === 'text') {
            scrollToMatch(nextIndex)
        }
    }

    const handlePrevMatch = () => {
        const prevIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches
        setCurrentMatchIndex(prevIndex)
        // For text view, also scroll
        if (effectiveViewMode === 'text') {
            scrollToMatch(prevIndex)
        }
    }

    const getFileIcon = (type: 'word' | 'powerpoint' | 'text' | 'pdf' | 'excel') => {
        switch (type) {
            case 'word': return <FileText className="h-5 w-5 text-blue-600" />
            case 'powerpoint': return <FileText className="h-5 w-5 text-orange-600" />
            case 'pdf': return <FileText className="h-5 w-5 text-red-600" />
            case 'excel': return <FileText className="h-5 w-5 text-green-600" />
            default: return <File className="h-5 w-5 text-gray-600" />
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

    const renderContent = () => {
        if (!content) return null
        if (!searchQuery) return content

        // Extract actual search terms from the query
        const terms = extractSearchTerms(searchQuery)
        if (terms.length === 0) return content

        // Create regex pattern that matches any of the terms
        const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi')
        const parts = content.split(regex)
        let matchCount = 0

        return parts.map((part, i) => {
            if (regex.test(part)) {
                const index = matchCount++
                const isCurrent = index === currentMatchIndex
                return (
                    <mark
                        key={i}
                        ref={el => { matchRefs.current[index] = el }}
                        className={cn(
                            "rounded px-0.5 font-medium transition-all duration-200",
                            isCurrent
                                ? "bg-orange-500 text-white ring-2 ring-orange-500/50 z-10 relative"
                                : "bg-yellow-200 dark:bg-yellow-500/40 text-black dark:text-white"
                        )}
                    >
                        {part}
                    </mark>
                )
            }
            return part
        })
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-7xl w-[95vw] h-[90vh] p-0 gap-0 border-none shadow-2xl bg-background overflow-hidden flex flex-col">
                {/* Opening File Overlay */}
                {isOpeningFile && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-card border border-border shadow-lg">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <div className="text-center">
                                <p className="font-medium text-foreground">Opening file...</p>
                                <p className="text-sm text-muted-foreground mt-1">Launching application and navigating to match</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="bg-background/80 backdrop-blur-xl border-b border-border/50 p-4 flex items-center justify-between shrink-0 z-20">
                    <div className="flex items-center gap-4 overflow-hidden">
                        <div className="p-3 rounded-xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
                            {file && getFileIcon(file.type)}
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-semibold truncate">
                                {file?.name}
                            </DialogTitle>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mt-1">
                                <span className="truncate max-w-[300px]">{file?.path}</span>
                                <span className="shrink-0">•</span>
                                <span className="shrink-0">{file && formatFileSize(file.size)}</span>
                                <span className="shrink-0">•</span>
                                <span className="shrink-0">{file && new Date(file.lastModified).toLocaleDateString()}</span>
                                {isRTL && (
                                    <>
                                        <span className="shrink-0">•</span>
                                        <span className="shrink-0 text-primary">RTL</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-4">
                        {/* Font Selector */}
                        <div className="flex items-center gap-1 mr-2">
                            <Type className="h-4 w-4 text-muted-foreground" />
                            <Select value={selectedFont} onValueChange={setSelectedFont}>
                                <SelectTrigger className="h-8 w-[150px] text-xs bg-muted/50 border-border/50">
                                    <SelectValue placeholder="Font" />
                                </SelectTrigger>
                                <SelectContent>
                                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Arabic Fonts</div>
                                    {FONT_OPTIONS.filter(f => f.group === 'arabic').map(font => (
                                        <SelectItem key={font.value} value={font.value} className="text-xs">
                                            <span style={{ fontFamily: font.family }}>{font.label}</span>
                                        </SelectItem>
                                    ))}
                                    <div className="my-1 border-t border-border/50" />
                                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Standard Fonts</div>
                                    {FONT_OPTIONS.filter(f => f.group === 'standard').map(font => (
                                        <SelectItem key={font.value} value={font.value} className="text-xs">
                                            <span style={{ fontFamily: font.family }}>{font.label}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* View Mode Toggle */}
                        {richViewAvailable && (
                            <div className="flex items-center bg-muted/50 rounded-lg border border-border/50 mr-2 p-0.5">
                                <Button
                                    variant={viewMode === 'rich' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="h-7 px-2 gap-1 rounded-md"
                                    onClick={() => setViewMode('rich')}
                                    title="Rich View"
                                >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span className="text-xs">Rich</span>
                                </Button>
                                <Button
                                    variant={viewMode === 'text' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="h-7 px-2 gap-1 rounded-md"
                                    onClick={() => setViewMode('text')}
                                    title="Text View"
                                >
                                    <AlignLeft className="h-3.5 w-3.5" />
                                    <span className="text-xs">Text</span>
                                </Button>
                            </div>
                        )}

                        {/* Search Navigation */}
                        {totalMatches > 0 && (
                            <div className="flex items-center bg-muted/50 rounded-lg border border-border/50 mr-4 px-1">
                                <span className="text-xs font-mono text-muted-foreground px-3 border-r border-border/50">
                                    {currentMatchIndex + 1} of {totalMatches}
                                </span>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={handlePrevMatch} title="Previous Match">
                                    <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={handleNextMatch} title="Next Match">
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                            </div>
                        )}

                        <Button variant="outline" size="sm" className="h-9 gap-2 bg-background/50 hover:bg-background/80" onClick={() => file && onOpenFile(file.path)}>
                            <ExternalLink className="h-4 w-4" />
                            <span className="hidden sm:inline">Open</span>
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 gap-2 bg-background/50 hover:bg-background/80" onClick={() => file && onOpenLocation(file.path)}>
                            <FolderOpen className="h-4 w-4" />
                            <span className="hidden sm:inline">Location</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 ml-2" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-muted/30 relative">
                    <ScrollArea className="h-full w-full">
                        <div className="p-6 min-h-full">
                            <div
                                className="bg-card border border-border/50 shadow-sm rounded-xl p-6 md:p-8 min-h-[500px] overflow-x-auto"
                                style={{ fontFamily }}
                                dir={isRTL ? 'rtl' : 'ltr'}
                            >
                                {isLoading ? (
                                    <div className="space-y-4 animate-pulse">
                                        <div className="h-4 bg-muted rounded w-3/4" />
                                        <div className="h-4 bg-muted rounded w-full" />
                                        <div className="h-4 bg-muted rounded w-5/6" />
                                        <div className="h-4 bg-muted rounded w-2/3" />
                                        <div className="space-y-2 pt-4">
                                            <div className="h-3 bg-muted/50 rounded w-full" />
                                            <div className="h-3 bg-muted/50 rounded w-full" />
                                            <div className="h-3 bg-muted/50 rounded w-full" />
                                        </div>
                                    </div>
                                ) : effectiveViewMode === 'rich' && structuredContent ? (
                                    <div className="w-full">
                                        <StructuredContentRenderer
                                            content={structuredContent}
                                            searchQuery={searchQuery}
                                            onMatchCountChange={handleStructuredMatchCount}
                                            currentMatchIndex={currentMatchIndex}
                                            isRTL={isRTL}
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full" ref={contentRef}>
                                        <pre className={cn(
                                            "text-sm md:text-base leading-7 whitespace-pre-wrap text-foreground/90 break-words",
                                            isRTL ? "text-right" : "text-left"
                                        )}>
                                            {renderContent()}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    )
}
