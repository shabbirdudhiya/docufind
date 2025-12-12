import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  DocumentContent,
  ContentSection,
  TextRun,
  SectionType
} from '@/lib/tauri-adapter';

interface StructuredContentRendererProps {
  content: DocumentContent;
  searchQuery?: string;
  onMatchCountChange?: (count: number) => void;
  currentMatchIndex?: number;
  isRTL?: boolean;
}

// Helper to extract search terms from query
const extractSearchTerms = (query: string): string[] => {
  const terms: string[] = [];

  // Extract exact phrases (quoted strings)
  const phraseMatches = query.match(/"([^"]+)"/g);
  if (phraseMatches) {
    phraseMatches.forEach(match => {
      terms.push(match.replace(/"/g, ''));
    });
  }

  // Remove quotes and operators, then extract remaining words
  let remaining = query
    .replace(/"[^"]+"/g, '')
    .replace(/\b(AND|OR|NOT)\b/gi, '')
    .replace(/[+\-*?:]/g, ' ')
    .trim();

  remaining.split(/\s+/).forEach(word => {
    if (word && word.length > 1) {
      terms.push(word);
    }
  });

  return terms;
};

// Render text with search highlighting
interface HighlightedTextProps {
  text: string;
  searchRegex: RegExp | null;
  currentMatchIndex: number;
  matchCountRef: { current: number };
  matchRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  style?: React.CSSProperties;
  className?: string;
}

const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  searchRegex,
  currentMatchIndex,
  matchCountRef,
  matchRefs,
  style,
  className
}) => {
  if (!searchRegex) {
    return <span style={style} className={className}>{text}</span>;
  }

  const parts = text.split(searchRegex);

  return (
    <span style={style} className={className}>
      {parts.map((part, i) => {
        if (searchRegex.test(part)) {
          const index = matchCountRef.current++;
          const isCurrent = index === currentMatchIndex;
          return (
            <mark
              key={i}
              ref={el => { matchRefs.current[index] = el; }}
              className={cn(
                "rounded px-0.5 font-medium transition-all duration-200",
                isCurrent
                  ? "bg-orange-500 text-white ring-2 ring-orange-500/50 z-10 relative"
                  : "bg-yellow-200 dark:bg-yellow-500/40 text-black dark:text-white"
              )}
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
};

// Render a text run with formatting
interface TextRunRendererProps {
  run: TextRun;
  searchRegex: RegExp | null;
  currentMatchIndex: number;
  matchCountRef: { current: number };
  matchRefs: React.MutableRefObject<(HTMLElement | null)[]>;
}

const TextRunRenderer: React.FC<TextRunRendererProps> = ({
  run,
  searchRegex,
  currentMatchIndex,
  matchCountRef,
  matchRefs
}) => {
  const style: React.CSSProperties = {};
  let className = '';

  if (run.style.bold) {
    className += 'font-bold ';
  }
  if (run.style.italic) {
    className += 'italic ';
  }
  if (run.style.underline) {
    className += 'underline ';
  }
  if (run.style.strikethrough) {
    className += 'line-through ';
  }
  if (run.style.color) {
    style.color = run.style.color;
  }
  if (run.style.highlight) {
    style.backgroundColor = run.style.highlight;
  }

  return (
    <HighlightedText
      text={run.text}
      searchRegex={searchRegex}
      currentMatchIndex={currentMatchIndex}
      matchCountRef={matchCountRef}
      matchRefs={matchRefs}
      style={style}
      className={className.trim()}
    />
  );
};

// Render a content section
interface SectionRendererProps {
  section: ContentSection;
  searchRegex: RegExp | null;
  currentMatchIndex: number;
  matchCountRef: { current: number };
  matchRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  depth?: number;
}

const SectionRenderer: React.FC<SectionRendererProps> = ({
  section,
  searchRegex,
  currentMatchIndex,
  matchCountRef,
  matchRefs,
  depth = 0
}) => {
  const sectionType = section.section_type;

  const renderRuns = () => {
    if (section.runs && section.runs.length > 0) {
      return section.runs.map((run, i) => (
        <TextRunRenderer
          key={i}
          run={run}
          searchRegex={searchRegex}
          currentMatchIndex={currentMatchIndex}
          matchCountRef={matchCountRef}
          matchRefs={matchRefs}
        />
      ));
    }
    if (section.content) {
      return (
        <HighlightedText
          text={section.content}
          searchRegex={searchRegex}
          currentMatchIndex={currentMatchIndex}
          matchCountRef={matchCountRef}
          matchRefs={matchRefs}
        />
      );
    }
    return null;
  };

  const renderChildren = () => {
    if (!section.children) return null;
    return section.children.map((child, i) => (
      <SectionRenderer
        key={i}
        section={child}
        searchRegex={searchRegex}
        currentMatchIndex={currentMatchIndex}
        matchCountRef={matchCountRef}
        matchRefs={matchRefs}
        depth={depth + 1}
      />
    ));
  };

  // Helper function to render heading with proper level
  const renderHeading = (level: number, children: React.ReactNode) => {
    const sizeClasses: Record<number, string> = {
      1: 'text-3xl font-bold mt-8 mb-4',
      2: 'text-2xl font-bold mt-6 mb-3',
      3: 'text-xl font-semibold mt-5 mb-2',
      4: 'text-lg font-semibold mt-4 mb-2',
      5: 'text-base font-semibold mt-3 mb-1',
      6: 'text-sm font-semibold mt-3 mb-1'
    };
    const className = cn("text-foreground", sizeClasses[level] || sizeClasses[6]);

    switch (level) {
      case 1: return <h1 className={className}>{children}</h1>;
      case 2: return <h2 className={className}>{children}</h2>;
      case 3: return <h3 className={className}>{children}</h3>;
      case 4: return <h4 className={className}>{children}</h4>;
      case 5: return <h5 className={className}>{children}</h5>;
      default: return <h6 className={className}>{children}</h6>;
    }
  };

  // Render based on section type
  switch (sectionType.type) {
    case 'Heading': {
      return renderHeading(sectionType.level, renderRuns());
    }

    case 'Paragraph':
      return (
        <p className="text-foreground/90 leading-7 mb-4">
          {renderRuns()}
        </p>
      );

    case 'ListItem': {
      const { ordered, depth: listDepth } = sectionType;
      const indent = `pl-${Math.min(listDepth * 4 + 4, 16)}`;
      return (
        <li className={cn("text-foreground/90 leading-7 mb-1", indent)}>
          {renderRuns()}
        </li>
      );
    }

    case 'Table':
      return (
        <div className="my-6 overflow-hidden rounded-xl border border-border/40 shadow-sm bg-card/30 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border/40">
              <tbody className="divide-y divide-border/40">
                {renderChildren()}
              </tbody>
            </table>
          </div>
        </div>
      );

    case 'TableRow':
      return (
        <tr className="hover:bg-muted/40 transition-colors group">
          {renderChildren()}
        </tr>
      );

    case 'TableCell':
      return (
        <td className="px-6 py-4 text-sm align-top leading-relaxed group-first:font-semibold group-first:bg-muted/20">
          {renderRuns()}
        </td>
      );

    case 'PageBreak':
      return (
        <div className="my-8 flex items-center justify-center gap-4">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-xs text-muted-foreground font-mono">Page Break</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>
      );

    case 'SlideBreak':
      return (
        <div className="my-8 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-primary font-medium">
            <span>Slide {sectionType.slide_number}</span>
          </div>
        </div>
      );

    case 'HorizontalRule':
      return <hr className="my-6 border-border/50" />;

    case 'CodeBlock':
      return (
        <pre className="my-4 p-4 bg-muted rounded-lg overflow-x-auto font-mono text-sm">
          {renderRuns()}
        </pre>
      );

    case 'Link':
      return (
        <a
          href={sectionType.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {renderRuns()}
        </a>
      );

    case 'Image':
      if (section.properties?.image_data) {
        return (
          <figure className="my-4">
            <img
              src={section.properties.image_data}
              alt={section.properties.alt_text || 'Image'}
              className="max-w-full h-auto rounded"
              style={{
                width: section.properties.width,
                height: section.properties.height
              }}
            />
            {section.properties.alt_text && (
              <figcaption className="text-sm text-muted-foreground mt-2 text-center">
                {section.properties.alt_text}
              </figcaption>
            )}
          </figure>
        );
      }
      return (
        <div className="my-4 p-4 border border-dashed border-border rounded text-center text-muted-foreground text-sm">
          [Image]
        </div>
      );

    default:
      // Fallback for unknown types
      return (
        <div className="my-2">
          {renderRuns()}
        </div>
      );
  }
};

export const StructuredContentRenderer: React.FC<StructuredContentRendererProps> = ({
  content,
  searchQuery,
  onMatchCountChange,
  currentMatchIndex = 0,
  isRTL = false
}) => {
  const matchRefs = useRef<(HTMLElement | null)[]>([]);
  const matchCountRef = useRef(0);
  const [searchRegex, setSearchRegex] = useState<RegExp | null>(null);

  // Build search regex when query changes
  useEffect(() => {
    if (!searchQuery) {
      setSearchRegex(null);
      return;
    }

    const terms = extractSearchTerms(searchQuery);
    if (terms.length === 0) {
      setSearchRegex(null);
      return;
    }

    const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    setSearchRegex(new RegExp(`(${escapedTerms.join('|')})`, 'gi'));
  }, [searchQuery]);

  // Reset match count on each render
  matchCountRef.current = 0;
  matchRefs.current = [];

  // Count matches after render
  useEffect(() => {
    if (onMatchCountChange) {
      // Small delay to ensure all matches are counted
      const timer = setTimeout(() => {
        onMatchCountChange(matchRefs.current.filter(Boolean).length);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [content, searchRegex, onMatchCountChange]);

  // Scroll to current match
  useEffect(() => {
    if (currentMatchIndex >= 0 && currentMatchIndex < matchRefs.current.length) {
      const element = matchRefs.current[currentMatchIndex];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, searchRegex]);

  // Render metadata if available
  const renderMetadata = () => {
    const { metadata } = content;
    const hasMetadata = metadata.title || metadata.author;

    if (!hasMetadata) return null;

    return (
      <div className="mb-6 pb-4 border-b border-border/50">
        {metadata.title && (
          <h1 className="text-2xl font-bold text-foreground mb-1">{metadata.title}</h1>
        )}
        {metadata.author && (
          <p className="text-sm text-muted-foreground">By {metadata.author}</p>
        )}
      </div>
    );
  };

  // Group consecutive list items for proper rendering
  const groupSections = (sections: ContentSection[]): (ContentSection | ContentSection[])[] => {
    const result: (ContentSection | ContentSection[])[] = [];
    let currentList: ContentSection[] = [];
    let currentListOrdered: boolean | null = null;

    for (const section of sections) {
      if (section.section_type.type === 'ListItem') {
        const ordered = section.section_type.ordered;
        if (currentList.length === 0 || currentListOrdered === ordered) {
          currentList.push(section);
          currentListOrdered = ordered;
        } else {
          result.push(currentList);
          currentList = [section];
          currentListOrdered = ordered;
        }
      } else {
        if (currentList.length > 0) {
          result.push(currentList);
          currentList = [];
          currentListOrdered = null;
        }
        result.push(section);
      }
    }

    if (currentList.length > 0) {
      result.push(currentList);
    }

    return result;
  };

  const grouped = groupSections(content.sections);

  return (
    <div
      className={cn("structured-content max-w-none", isRTL && "text-right")}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {renderMetadata()}

      {grouped.map((item, i) => {
        if (Array.isArray(item)) {
          // It's a list group
          const isOrdered = item[0]?.section_type.type === 'ListItem' && item[0].section_type.ordered;
          const ListTag = isOrdered ? 'ol' : 'ul';
          return (
            <ListTag key={i} className={cn(
              "my-4",
              isOrdered ? "list-decimal" : "list-disc",
              "list-inside"
            )}>
              {item.map((listItem, j) => (
                <SectionRenderer
                  key={j}
                  section={listItem}
                  searchRegex={searchRegex}
                  currentMatchIndex={currentMatchIndex}
                  matchCountRef={matchCountRef}
                  matchRefs={matchRefs}
                />
              ))}
            </ListTag>
          );
        }

        return (
          <SectionRenderer
            key={i}
            section={item}
            searchRegex={searchRegex}
            currentMatchIndex={currentMatchIndex}
            matchCountRef={matchCountRef}
            matchRefs={matchRefs}
          />
        );
      })}
    </div>
  );
};

export default StructuredContentRenderer;
