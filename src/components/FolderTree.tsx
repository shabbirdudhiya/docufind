"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Folder, FolderX, FolderCheck, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { tauriAPI, FolderNode } from "@/lib/tauri-adapter";

interface FolderTreeProps {
  onExclusionChange?: () => void;
  className?: string;
}

interface TreeNodeProps {
  node: FolderNode;
  level: number;
  onToggle: (path: string) => Promise<void>;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
}

function TreeNode({ node, level, onToggle, expandedPaths, toggleExpanded }: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedPaths.has(node.path);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleExclusion = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToggling(true);
    try {
      await onToggle(node.path);
    } finally {
      setIsToggling(false);
    }
  };

  const handleExpandToggle = () => {
    if (hasChildren) {
      toggleExpanded(node.path);
    }
  };

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-accent/50 transition-colors",
          node.isExcluded && "opacity-60"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleExpandToggle}
      >
        {/* Expand/Collapse button */}
        <div className="w-4 h-4 flex items-center justify-center">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-4" />
          )}
        </div>

        {/* Checkbox for exclusion */}
        <Checkbox
          checked={!node.isExcluded}
          disabled={isToggling}
          onClick={handleToggleExclusion}
          className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
        />

        {/* Folder icon */}
        {node.isExcluded ? (
          <FolderX className="h-4 w-4 text-muted-foreground" />
        ) : (
          <FolderCheck className="h-4 w-4 text-green-500" />
        )}

        {/* Folder name */}
        <span className={cn(
          "flex-1 truncate text-sm",
          node.isExcluded && "text-muted-foreground line-through"
        )}>
          {node.name}
        </span>

        {/* File count badge */}
        {node.fileCount > 0 && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
            <FileText className="h-3 w-3 mr-1" />
            {node.fileCount}
          </Badge>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              onToggle={onToggle}
              expandedPaths={expandedPaths}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({ onExclusionChange, className }: FolderTreeProps) {
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Load folder tree
  const loadTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tauriAPI.getFolderTree();
      if (result.success && result.tree) {
        setTree(result.tree);
        // Auto-expand root folders
        const rootPaths = new Set(result.tree.map((n) => n.path));
        setExpandedPaths(rootPaths);
      } else {
        setError(result.error || "Failed to load folder tree");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load folder tree");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  const toggleExpanded = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleToggleExclusion = async (path: string) => {
    const result = await tauriAPI.toggleFolderExclusion(path);
    if (result.success) {
      // Reload tree to reflect changes
      await loadTree();
      onExclusionChange?.();
    }
  };

  // Expand all folders
  const expandAll = () => {
    const allPaths = new Set<string>();
    const collectPaths = (nodes: FolderNode[]) => {
      for (const node of nodes) {
        allPaths.add(node.path);
        if (node.children) {
          collectPaths(node.children);
        }
      }
    };
    collectPaths(tree);
    setExpandedPaths(allPaths);
  };

  // Collapse all folders
  const collapseAll = () => {
    setExpandedPaths(new Set());
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4 text-center", className)}>
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadTree} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className={cn("p-4 text-center text-muted-foreground", className)}>
        <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No folders indexed yet</p>
        <p className="text-xs mt-1">Add a folder to see the tree</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b">
        <Button variant="ghost" size="sm" onClick={expandAll}>
          Expand All
        </Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>
          Collapse All
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={loadTree}>
          Refresh
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 text-xs text-muted-foreground border-b">
        <div className="flex items-center gap-1">
          <Checkbox checked className="h-3 w-3 data-[state=checked]:bg-green-500" disabled />
          <span>Included in search</span>
        </div>
        <div className="flex items-center gap-1">
          <Checkbox className="h-3 w-3" disabled />
          <span>Excluded from search</span>
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              level={0}
              onToggle={handleToggleExclusion}
              expandedPaths={expandedPaths}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
