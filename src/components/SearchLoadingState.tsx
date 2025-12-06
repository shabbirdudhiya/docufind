
import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ElapsedTime } from './ElapsedTime';
import { RotatingTip } from './RotatingTip';

interface SearchLoadingStateProps {
    isScanning: boolean;
    indexingPhase: 'discovering' | 'scanning' | 'indexing' | 'finalizing' | '';
    totalFilesToProcess: number;
    filesProcessed: number;
    scanProgress: number;
    loadingProgress: number;
    loadingMessage: string;
    currentFileName: string;
    indexingStartTime: Date | null;
}

export function SearchLoadingState({
    isScanning,
    indexingPhase,
    totalFilesToProcess,
    filesProcessed,
    scanProgress,
    loadingProgress,
    loadingMessage,
    currentFileName,
    indexingStartTime
}: SearchLoadingStateProps) {
    return (
        <div className="w-full flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-full max-w-lg">
                <div className="flex flex-col items-center text-center space-y-6">
                    {/* Enhanced Animation */}
                    <div className="relative w-28 h-28">
                        {/* Outer rotating ring */}
                        <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" style={{ animationDuration: '2s' }} />
                        {/* Middle pulsing ring */}
                        <div className="absolute inset-2 rounded-full bg-primary/5 animate-pulse" />
                        {/* Inner content */}
                        <div className="absolute inset-4 flex items-center justify-center">
                            <div className="relative w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center overflow-hidden shadow-lg">
                                <FileText className="h-8 w-8 text-primary" />
                                {/* Scanning line effect */}
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/20 to-transparent animate-scan" />
                            </div>
                        </div>
                        {/* Floating document icons */}
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center animate-float">
                            <FileText className="h-3 w-3 text-blue-500" />
                        </div>
                        <div className="absolute -bottom-1 -left-1 w-5 h-5 bg-orange-500/20 rounded-lg flex items-center justify-center animate-float-delayed">
                            <FileText className="h-2.5 w-2.5 text-orange-500" />
                        </div>
                        <div className="absolute top-1/2 -right-3 w-4 h-4 bg-green-500/20 rounded-lg flex items-center justify-center animate-float" style={{ animationDelay: '0.5s' }}>
                            <FileText className="h-2 w-2 text-green-500" />
                        </div>
                    </div>

                    <div className="space-y-2 w-full">
                        <h3 className="text-xl font-bold tracking-tight">
                            {isScanning ? (
                                indexingPhase === 'discovering' ? '🔍 Discovering Files' :
                                    indexingPhase === 'finalizing' ? '✨ Finalizing Index' :
                                        '📚 Building Search Index'
                            ) : '🔎 Searching...'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            {isScanning ? (
                                indexingPhase === 'discovering' ? 'Scanning folder structure...' :
                                    indexingPhase === 'finalizing' ? 'Almost done! Optimizing for fast search...' :
                                        'Indexing your documents for lightning-fast search'
                            ) : (
                                loadingMessage || 'Searching through documents...'
                            )}
                        </p>
                    </div>

                    <div className="w-full space-y-3">
                        {/* Progress stats row */}
                        <div className="flex justify-between text-xs text-muted-foreground font-mono px-1">
                            <span className="flex items-center gap-1">
                                {isScanning && totalFilesToProcess > 0 && (
                                    <span className="text-primary font-semibold">{filesProcessed.toLocaleString()}/{totalFilesToProcess.toLocaleString()} files</span>
                                )}
                                {isScanning && totalFilesToProcess === 0 && indexingPhase === 'discovering' && (
                                    <span className="animate-pulse">Scanning...</span>
                                )}
                                {!isScanning && <span>{loadingMessage ? loadingMessage.split(':')[0] : 'Processing'}</span>}
                            </span>
                            <span className="font-semibold text-primary">{Math.round(isScanning ? scanProgress : loadingProgress)}%</span>
                        </div>

                        {/* Enhanced Progress bar with gradient */}
                        <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-primary/80 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${isScanning ? scanProgress : loadingProgress}%` }}
                            />
                            {/* Shimmer effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                        </div>

                        {/* Current file being processed */}
                        {isScanning && currentFileName && indexingPhase === 'indexing' && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground/80 px-1 py-1 bg-muted/30 rounded-md">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                                <p className="truncate" title={currentFileName}>
                                    {currentFileName}
                                </p>
                            </div>
                        )}

                        {/* Elapsed time for long operations */}
                        {isScanning && indexingStartTime && (
                            <ElapsedTime startTime={indexingStartTime} />
                        )}
                    </div>

                    {/* Rotating tips */}
                    {isScanning && (
                        <div className="w-full pt-2 border-t border-border/50">
                            <RotatingTip />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
