"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { FileText, Loader2, CheckCircle2, X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { tauriAPI } from "@/lib/tauri-adapter";

interface SkippedPdf {
  name: string;
  path: string;
  reason: string;
}

interface PdfProgressIndicatorProps {
  className?: string;
  onPdfIndexed?: (file: any) => void;
  onComplete?: () => void;
}

export function PdfProgressIndicator({ 
  className, 
  onPdfIndexed,
  onComplete 
}: PdfProgressIndicatorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [indexed, setIndexed] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [skippedPdfs, setSkippedPdfs] = useState<SkippedPdf[]>([]);
  const [showSkipped, setShowSkipped] = useState(false);

  useEffect(() => {
    // Listen for PDF progress events
    tauriAPI.onPdfProgress((event: any, data: { completed: number; total: number; current: string }) => {
      setIsProcessing(true);
      setCompleted(data.completed);
      setTotal(data.total);
      setCurrentFile(data.current);
      setIsComplete(false);
      setIsDismissed(false);
    });

    // Listen for PDF skipped event
    tauriAPI.onPdfSkipped?.((event: any, data: SkippedPdf) => {
      setSkippedPdfs(prev => [...prev, data]);
    });

    // Listen for PDF complete event
    tauriAPI.onPdfComplete((event: any, data: { total: number; indexed?: number; skipped?: number; skippedFiles?: SkippedPdf[] }) => {
      setIsProcessing(false);
      setIsComplete(true);
      setCompleted(data.total);
      setTotal(data.total);
      setIndexed(data.indexed || data.total);
      
      if (data.skippedFiles && data.skippedFiles.length > 0) {
        setSkippedPdfs(data.skippedFiles);
      }
      
      onComplete?.();
      
      // Auto-dismiss after 10 seconds if no skipped PDFs, otherwise keep visible
      if (!data.skipped || data.skipped === 0) {
        setTimeout(() => {
          setIsDismissed(true);
        }, 5000);
      }
    });

    // Listen for individual PDF indexed
    tauriAPI.onPdfIndexed((event: any, data: any) => {
      onPdfIndexed?.(data);
    });

    return () => {
      tauriAPI.removeAllListeners("pdf-progress");
      tauriAPI.removeAllListeners("pdf-complete");
      tauriAPI.removeAllListeners("pdf-indexed");
      tauriAPI.removeAllListeners("pdf-skipped");
    };
  }, [onPdfIndexed, onComplete]);

  // Reset skipped PDFs when new processing starts
  useEffect(() => {
    if (isProcessing && !isComplete) {
      setSkippedPdfs([]);
      setShowSkipped(false);
    }
  }, [isProcessing, isComplete]);

  // Don't render if no PDFs or dismissed
  if ((total === 0 && !isProcessing) || isDismissed) {
    return null;
  }

  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const hasSkipped = skippedPdfs.length > 0;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-96 rounded-lg border bg-background shadow-lg p-4 transition-all",
        hasSkipped && isComplete && "border-yellow-500/50",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isComplete ? (
            hasSkipped ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          <span className="font-medium text-sm">
            {isComplete 
              ? hasSkipped 
                ? "PDF Processing Complete (with issues)" 
                : "PDF Processing Complete"
              : "Processing PDFs..."}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-2 mb-2" />

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {isComplete ? (
            <>
              {indexed} indexed
              {hasSkipped && <span className="text-yellow-500 ml-1">• {skippedPdfs.length} skipped</span>}
            </>
          ) : (
            <>{completed} / {total} PDFs</>
          )}
        </span>
        <span>{progress}%</span>
      </div>

      {/* Current file */}
      {!isComplete && currentFile && (
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span className="truncate">{currentFile}</span>
        </div>
      )}

      {/* Info text */}
      {!isComplete && (
        <p className="text-xs text-muted-foreground mt-2">
          PDFs are being indexed in the background. You can continue searching.
        </p>
      )}

      {/* Skipped PDFs section */}
      {isComplete && hasSkipped && (
        <div className="mt-3 border-t pt-3">
          <button
            className="flex items-center justify-between w-full text-xs text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
            onClick={() => setShowSkipped(!showSkipped)}
          >
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {skippedPdfs.length} PDF{skippedPdfs.length !== 1 ? 's' : ''} could not be indexed
            </span>
            {showSkipped ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          
          {showSkipped && (
            <ScrollArea className="mt-2 max-h-40">
              <div className="space-y-2">
                {skippedPdfs.map((pdf, idx) => (
                  <div key={idx} className="text-xs bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
                    <p className="font-medium truncate" title={pdf.path}>{pdf.name}</p>
                    <p className="text-muted-foreground mt-0.5">{pdf.reason}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          
          <p className="text-xs text-muted-foreground mt-2">
            These are likely scanned documents or image-only PDFs. Consider using OCR software to make them searchable.
          </p>
        </div>
      )}
    </div>
  );
}
