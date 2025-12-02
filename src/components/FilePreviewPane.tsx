import React, { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ExternalLink, FolderOpen, ChevronUp, ChevronDown, X, FileText, File } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileData {
    path: string
    name: string
    type: 'word' | 'powerpoint' | 'text'
    size: number
    lastModified: Date
}

interface FilePreviewPaneProps {
    file: FileData | null
    content: string
    searchQuery: string
    isOpen: boolean
    onClose: () => void
    onOpenFile: (path: string) => void
    onOpenLocation: (path: string) => void
    isLoading: boolean
}

export function FilePreviewPane({
    file,
    content,
    searchQuery,
    isOpen,
    onClose,
    onOpenFile,
    onOpenLocation,
    isLoading
}: FilePreviewPaneProps) {
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
    const [totalMatches, setTotalMatches] = useState(0)
    const contentRef = useRef<HTMLDivElement>(null)
    const matchRefs = useRef<(HTMLElement | null)[]>([])

    // Reset state when file or query changes
    useEffect(() => {
        setCurrentMatchIndex(0)
        setTotalMatches(0)
        matchRefs.current = []
    }, [file, searchQuery])

    // Count matches and scroll to first match
    useEffect(() => {
        if (!content || !searchQuery) return

        const regex = new RegExp(`(${searchQuery})`, 'gi')
        const matches = content.match(regex)
        const count = matches ? matches.length : 0
        setTotalMatches(count)

        if (count > 0) {
            // Small delay to ensure rendering is done
            setTimeout(() => {
                scrollToMatch(0)
            }, 100)
        }
    }, [content, searchQuery, isOpen])

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
        scrollToMatch(nextIndex)
    }

    const handlePrevMatch = () => {
        const prevIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches
        scrollToMatch(prevIndex)
    }

    const getFileIcon = (type: 'word' | 'powerpoint' | 'text') => {
        switch (type) {
            case 'word': return <FileText className="h-5 w-5 text-blue-600" />
            case 'powerpoint': return <FileText className="h-5 w-5 text-orange-600" />
            default: return <File className="h-5 w-5 text-gray-600" />
        }
    }

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    const renderContent = () => {
        if (!content) return null
        if (!searchQuery) return content

        const regex = new RegExp(`(${searchQuery})`, 'gi')
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
            <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0 border-none shadow-2xl bg-background overflow-hidden flex flex-col">
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
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-4">
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
                        <div className="p-8 min-h-full">
                            <div className="bg-card border border-border/50 shadow-sm rounded-xl p-8 min-h-[500px]">
                                {isLoading ? (
                                    <div className="space-y-4 animate-pulse max-w-3xl mx-auto">
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
                                ) : (
                                    <div className="w-full" ref={contentRef}>
                                        <pre className="text-sm md:text-base leading-7 whitespace-pre-wrap font-sans text-foreground/90 break-words">
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
