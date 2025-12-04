"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { FileText, Loader2, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { tauriAPI } from "@/lib/tauri-adapter";

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
  const [currentFile, setCurrentFile] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

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

    // Listen for PDF complete event
    tauriAPI.onPdfComplete((event: any, data: { total: number }) => {
      setIsProcessing(false);
      setIsComplete(true);
      setCompleted(data.total);
      setTotal(data.total);
      onComplete?.();
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setIsDismissed(true);
      }, 5000);
    });

    // Listen for individual PDF indexed
    tauriAPI.onPdfIndexed((event: any, data: any) => {
      onPdfIndexed?.(data);
    });

    return () => {
      tauriAPI.removeAllListeners("pdf-progress");
      tauriAPI.removeAllListeners("pdf-complete");
      tauriAPI.removeAllListeners("pdf-indexed");
    };
  }, [onPdfIndexed, onComplete]);

  // Don't render if no PDFs or dismissed
  if ((total === 0 && !isProcessing) || isDismissed) {
    return null;
  }

  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-background shadow-lg p-4 transition-all",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          <span className="font-medium text-sm">
            {isComplete ? "PDF Processing Complete" : "Processing PDFs..."}
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
          {completed} / {total} PDFs
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
    </div>
  );
}
