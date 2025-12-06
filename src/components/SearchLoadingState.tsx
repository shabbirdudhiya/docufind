
import React from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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

    // Fast Search Mode: Show Skeleton Grid (Immediate Feedback)
    if (!isScanning) {
        return (
            <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-xs font-semibold flex items-center gap-2 animate-shimmer-text">
                        <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                        {loadingMessage || 'Thinking...'}
                    </span>
                </div>

                {/* Skeleton Results Grid */}
                <div className="grid gap-4">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="flex items-start justify-between p-5 rounded-xl border border-border/40 bg-gradient-to-r from-card/50 via-card/80 to-card/50 backdrop-blur-[2px] animate-gradient-x"
                            style={{ opacity: 1 - (i * 0.15), animationDelay: `${i * 0.1}s` }}
                        >
                            <div className="flex items-center gap-4 w-full">
                                <Skeleton className="h-10 w-10 rounded-lg shrink-0 bg-primary/10 animate-pulse" />
                                <div className="space-y-2.5 flex-1">
                                    <Skeleton className="h-4 w-[40%] bg-primary/10 animate-pulse" style={{ animationDelay: '0.1s' }} />
                                    <Skeleton className="h-3 w-[70%] bg-primary/5 animate-pulse" style={{ animationDelay: '0.2s' }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Indexing Mode: Full Progress Overlay (Long Running)
    return (
        <div className="w-full flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-lg">
                <div className="flex flex-col items-center text-center space-y-6">
                    {/* Enhanced Indexing Animation */}
                    <div className="relative w-32 h-32">
                        {/* Outer rotating ring */}
                        <div className="absolute inset-0 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" style={{ animationDuration: '3s' }} />

                        {/* Inner rotating ring (reverse) */}
                        <div className="absolute inset-3 rounded-full border-[2px] border-primary/10 border-b-primary/60 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '5s' }} />

                        {/* Middle pulsing ring */}
                        <div className="absolute inset-6 rounded-full bg-primary/5 animate-pulse" />

                        {/* Inner content */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="relative w-16 h-16 bg-gradient-to-br from-background to-muted rounded-2xl flex items-center justify-center overflow-hidden shadow-sm border border-border/50">
                                <FileText className="h-8 w-8 text-primary animate-pulse" />
                                {/* Scanning line effect */}
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/10 to-transparent animate-scan" />
                            </div>
                        </div>

                        {/* Floating particles */}
                        <div className="absolute -top-2 right-4"><Sparkles className="h-4 w-4 text-amber-400 animate-bounce" style={{ animationDuration: '2s' }} /></div>
                        <div className="absolute bottom-4 -left-2"><Sparkles className="h-3 w-3 text-blue-400 animate-bounce" style={{ animationDuration: '3s', animationDelay: '1s' }} /></div>
                    </div>

                    <div className="space-y-2 w-full">
                        <h3 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
                            {indexingPhase === 'discovering' ? 'Discovering Files' :
                                indexingPhase === 'finalizing' ? 'Finalizing Index' :
                                    'Building Search Index'}
                        </h3>
                        <p className="text-sm text-muted-foreground/80">
                            {indexingPhase === 'discovering' ? 'Scanning folder structure...' :
                                indexingPhase === 'finalizing' ? 'Optimizing database for speed...' :
                                    'Reading and extracting text content...'}
                        </p>
                    </div>

                    <div className="w-full space-y-4 pt-2">
                        {/* Progress bar */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-medium text-muted-foreground font-mono">
                                <span>{indexingPhase === 'discovering' ? 'Scanning...' : `${filesProcessed.toLocaleString()} / ${totalFilesToProcess.toLocaleString()}`}</span>
                                <span className="text-primary">{Math.round(scanProgress)}%</span>
                            </div>
                            <div className="relative h-2.5 w-full bg-muted/60 rounded-full overflow-hidden border border-border/20">
                                <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-blue-500 to-primary rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${scanProgress}%` }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                                </div>
                            </div>
                        </div>

                        {/* Current file (truncated) */}
                        {currentFileName && indexingPhase === 'indexing' && (
                            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 h-6">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="truncate max-w-[250px] font-mono">{currentFileName}</span>
                            </div>
                        )}

                        {/* Elapsed time */}
                        {indexingStartTime && (
                            <div className="flex justify-center">
                                <ElapsedTime startTime={indexingStartTime} />
                            </div>
                        )}

                        <div className="pt-4 border-t border-border/40">
                            <RotatingTip />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
