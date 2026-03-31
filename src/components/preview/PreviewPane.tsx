import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Square, Play, Undo2, Redo2, Copy, Check, ChevronUp, ChevronDown, Terminal, Cpu, AlertTriangle, ArrowRight, Camera, X, Crop } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import PreviewHeader, { type ShipState } from "./PreviewHeader";
import GenerationOverlay from "./GenerationOverlay";
import EmptyIllustration from "./EmptyIllustration";
import SketchCanvas from "../sketch/SketchCanvas";
import ErrorBoundary from "../ErrorBoundary";
import { useGenerationContext } from "../../lib/generation/GenerationContext";
import { useProjectContext } from "../../lib/project/ProjectContext";
import { usePreviewContext } from "../../lib/preview/PreviewContext";
import { useSketchContext } from "../../lib/sketch/SketchContext";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { getPreviewLogs, shipProject, launchShippedApp, hasShippedApp, saveShipLogs, loadShipLogs, cancelShip, proxyTauri, detectEditors, openInEditor, captureScreenshot, type DetectedEditor } from "../../lib/tauri/workspace";
import { EditorIcon } from "./EditorIcons";
import { attemptShipFix } from "../../lib/generation/shipHeal";
import { getProviderById } from "../../lib/ai";
import { getActiveProviderId } from "../../lib/ai/settings";
import { useShikiHighlight } from "./useShikiHighlight";
import { useAppearance } from "../../ThemeContext";
import shipFinishSound from "../../assets/ship-finish.mp3";

function playShipDing() {
  try {
    const audio = new Audio(shipFinishSound);
    audio.play();
  } catch {
    // Audio not available — silently skip
  }
}

// ── Runtime error pill + popover (matches ship/rust drawer tab style) ──

function RuntimeErrorPill({ errors, bottomOffset = 0 }: { errors: string[]; bottomOffset?: number }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (errors.length === 0) return null;

  const handleInsertAll = () => {
    const deduped = [...new Set(errors)];
    const all = deduped.join("\n");
    window.dispatchEvent(new CustomEvent("raincast:insert-error", { detail: { error: all } }));
  };

  return (
    <>
      {/* Floating popover — opens above the pill */}
      {open && (
        <div style={{
          position: "absolute",
          bottom: 44 + bottomOffset,
          right: 14,
          zIndex: 29,
          width: 320,
          maxHeight: 220,
          borderRadius: 10,
          border: "1px solid var(--separator-color)",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.12)",
          background: "var(--pane-bg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "fadeIn 0.12s ease-out",
        }}>
          {/* Popover header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "5px 10px",
            borderBottom: "1px solid var(--separator-color)",
            background: "var(--input-bg, var(--pane-bg))",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
              Console Errors
            </span>
            <button
              onClick={handleInsertAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10.5,
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: "var(--slider-thumb)",
                color: "#fff",
                transition: "opacity 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              <ArrowRight size={10} strokeWidth={2} /> Insert all
            </button>
          </div>

          {/* Error list */}
          <div className="rain-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {errors.map((err, i) => (
              <div
                key={i}
                style={{
                  padding: "3px 10px",
                  fontSize: 11,
                  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                  lineHeight: 1.5,
                  color: "#d44",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  borderBottom: i < errors.length - 1 ? "1px solid var(--separator-color)" : undefined,
                }}
              >
                {err}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pill button — matches ship/rust log tab style */}
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "absolute",
          bottom: 14 + bottomOffset,
          right: 14,
          zIndex: 28,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          borderRadius: 8,
          background: "var(--pane-bg)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid var(--separator-color)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          cursor: "pointer",
          color: hovered ? "#d44" : "var(--text-secondary)",
          fontSize: 11,
          fontWeight: 500,
          transition: "color 0.15s",
        }}
      >
        <AlertTriangle size={11} strokeWidth={1.8} style={{ color: "#d44" }} />
        <span style={{ color: "#d44" }}>{errors.length}</span>
        {open ? <ChevronDown size={11} strokeWidth={1.8} /> : <ChevronUp size={11} strokeWidth={1.8} />}
      </button>
    </>
  );
}

// ── Collapsible log blocks ──

const COLLAPSE_THRESHOLD = 10;

interface CollapseMarker { id: string; hidden: number }

function useCollapsibleLogs(rawLogs: string[]) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const logsEmpty = rawLogs.length === 0;
  useEffect(() => { if (logsEmpty) setExpanded(new Set()); }, [logsEmpty]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { processed, markers } = useMemo(() => {
    const out: string[] = [];
    const markers = new Map<number, CollapseMarker>();
    let i = 0;

    while (i < rawLogs.length) {
      const line = rawLogs[i];

      if (!line.startsWith("  ┌──")) { out.push(line); i++; continue; }

      const isPatch = /\(\d+ patch/.test(line);
      out.push(line); // block header
      i++;

      if (!isPatch) {
        // ── File content block ──
        const blockId = `f${i}`;
        const isExp = expanded.has(blockId);
        let count = 0;

        while (i < rawLogs.length && !rawLogs[i].startsWith("  └──")) {
          count++;
          if (isExp || count <= COLLAPSE_THRESHOLD) out.push(rawLogs[i]);
          i++;
        }

        if (!isExp && count > COLLAPSE_THRESHOLD) {
          markers.set(out.length, { id: blockId, hidden: count - COLLAPSE_THRESHOLD });
          out.push(""); // placeholder
        }
      } else {
        // ── Patch block (SEARCH / REPLACE sections) ──
        while (i < rawLogs.length && !rawLogs[i].startsWith("  └──")) {
          const isSearchH = /│\s+SEARCH\s+\(/.test(rawLogs[i]);
          const isReplaceH = /│\s+REPLACE\s+\(/.test(rawLogs[i]);

          if (isSearchH || isReplaceH) {
            const prefix = isSearchH ? "  │  - " : "  │  + ";
            const blockId = `${isSearchH ? "s" : "r"}${i}`;
            out.push(rawLogs[i]); // section header
            i++;

            const isExp = expanded.has(blockId);
            let count = 0;

            while (i < rawLogs.length && rawLogs[i].startsWith(prefix)) {
              count++;
              if (isExp || count <= COLLAPSE_THRESHOLD) out.push(rawLogs[i]);
              i++;
            }

            if (!isExp && count > COLLAPSE_THRESHOLD) {
              markers.set(out.length, { id: blockId, hidden: count - COLLAPSE_THRESHOLD });
              out.push(""); // placeholder
            }
          } else {
            out.push(rawLogs[i]);
            i++;
          }
        }
      }

      // Footer
      if (i < rawLogs.length) { out.push(rawLogs[i]); i++; }
    }

    return { processed: out, markers };
  }, [rawLogs, expanded]);

  return { processed, markers, toggle };
}

// ── Log line rendering ──

// ── Sectioned log view ──

interface LogSection {
  title: string;
  titleIndex: number;
  lines: Array<{ text: string; index: number }>;
}

const SECTION_RE = /^── .+ ──/;
const SECTION_RE_OPEN = /^──\s+/; // matches "── Starting ship process..." without closing ──

function parseSections(logs: string[], sectionPattern: RegExp = SECTION_RE): LogSection[] {
  const sections: LogSection[] = [];
  let current: LogSection | null = null;

  for (let i = 0; i < logs.length; i++) {
    const line = logs[i];
    if (sectionPattern.test(line.trim())) {
      current = { title: line.trim(), titleIndex: i, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push({ text: line, index: i });
    } else {
      // Lines before any section — implicit preamble section
      if (!sections.length) {
        current = { title: "", titleIndex: -1, lines: [] };
        sections.push(current);
      }
      sections[0].lines.push({ text: line, index: i });
    }
  }
  return sections;
}

function LogLine({ text, index, highlightMap, markers, onToggle }: {
  text: string;
  index: number;
  highlightMap: Map<number, string>;
  markers: Map<number, CollapseMarker>;
  onToggle: (id: string) => void;
}) {
  const marker = markers.get(index);
  if (marker) {
    return (
      <div
        style={{
          whiteSpace: "pre",
          fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontSize: 11.5,
          lineHeight: "22px",
          cursor: "pointer",
          color: "var(--slider-thumb)",
          opacity: 0.65,
          transition: "opacity 0.2s, color 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.65"; }}
        onClick={() => onToggle(marker.id)}
      >
        {"  ··· "}show more ({marker.hidden} more lines)
      </div>
    );
  }

  const isError = text.includes("ERROR") || text.includes("FAILED");
  const isSuccess = text.includes("PASSED") || text.includes("✓");
  const isFileContent = text.startsWith("  │ ") && /^\s+│\s+\d+\s+│/.test(text);
  const isFileBorder = text.startsWith("  ┌──") || text.startsWith("  └──");
  const isTree = text.startsWith("  ├─") || text.startsWith("  │  └─");
  const isSterr = text.startsWith("  stderr:") || text.startsWith("  stdout:");

  const highlighted = highlightMap.get(index);

  if (isFileContent && highlighted) {
    const prefixMatch = text.match(/^(\s+│\s+\d+\s+│\s?)/);
    const prefix = prefixMatch ? prefixMatch[1] : "";
    return (
      <div style={{
        whiteSpace: "pre",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 11.5,
        lineHeight: "22px",
      }}>
        <span style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>{prefix}</span>
        <span dangerouslySetInnerHTML={{ __html: highlighted }} />
      </div>
    );
  }

  return (
    <div style={{
      whiteSpace: "pre",
      overflow: "hidden",
      textOverflow: "ellipsis",
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: isFileContent ? 11.5 : 12.5,
      lineHeight: "22px",
      color: isError ? "#d44"
        : isSuccess ? "#2a8"
        : isFileBorder ? "var(--slider-thumb)"
        : isFileContent ? "var(--text-tertiary)"
        : isTree ? "var(--text-tertiary)"
        : isSterr ? "#c77"
        : "var(--text-secondary)",
      opacity: isFileContent ? 0.85 : 1,
    }}>
      {text}
    </div>
  );
}

/** Animated collapsible content wrapper using CSS grid for glitch-free dynamic content */
function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateRows: open ? "1fr" : "0fr",
      transition: "grid-template-rows 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
      opacity: open ? 1 : 0,
    }}>
      <div style={{ overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * All sections open by default. Only close when user manually clicks −.
 * New sections auto-open. User collapse is respected until logs reset.
 */
function useSectionExpansion(sections: LogSection[], logCount: number) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const userCollapsedRef = useRef<Set<string>>(new Set());

  // Keep all sections open unless user manually collapsed them
  useEffect(() => {
    setExpanded(() => {
      const next = new Set<number>();
      for (let i = 0; i < sections.length; i++) {
        const key = sections[i].title || `__pre_${i}`;
        if (!userCollapsedRef.current.has(key)) next.add(i);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logCount]);

  // Reset on clear
  useEffect(() => {
    if (logCount === 0) {
      userCollapsedRef.current = new Set();
      setExpanded(new Set());
    }
  }, [logCount]);

  const toggle = useCallback((idx: number) => {
    const key = sections[idx]?.title || `__pre_${idx}`;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
        userCollapsedRef.current.add(key);
      } else {
        next.add(idx);
        userCollapsedRef.current.delete(key);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  return { expanded, toggle };
}

/** Shared section rendering with vertical line + circle toggle + animations */
function SectionList({ sections, expanded, onToggle, renderLine, isLast: isLastSection }: {
  sections: LogSection[];
  expanded: Set<number>;
  onToggle: (idx: number) => void;
  renderLine: (line: { text: string; index: number }) => React.ReactNode;
  isLast?: (sIdx: number) => boolean;
}) {
  return (
    <>
      {sections.map((section, sIdx) => {
        const isOpen = expanded.has(sIdx);
        const isLast = isLastSection ? isLastSection(sIdx) : sIdx === sections.length - 1;
        const hasTitle = section.title !== "";
        const contentLines = section.lines.filter((l) => l.text.trim() !== "" || isOpen);

        return (
          <div key={sIdx} style={{ position: "relative", paddingLeft: 28 }}>
            {/* Vertical line */}
            <div style={{
              position: "absolute",
              left: 16,
              top: hasTitle ? 0 : 10,
              bottom: isLast ? "50%" : 0,
              width: 1,
              background: "var(--separator-color)",
            }} />

            {/* Section header */}
            {hasTitle && (
              <div
                onClick={() => onToggle(sIdx)}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {/* Circle on the line */}
                <div style={{
                  position: "absolute",
                  left: -20,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--pane-bg)",
                  border: `1.5px solid ${isOpen ? "var(--text-tertiary)" : "var(--separator-color)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: isOpen ? "var(--text-secondary)" : "var(--text-tertiary)",
                  lineHeight: 1,
                  transition: "border-color 200ms ease, color 200ms ease, transform 150ms ease",
                  zIndex: 1,
                }}>
                  {isOpen ? "−" : "+"}
                </div>

                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                }}>
                  {section.title}
                </span>

                {/* Collapsed summary inline */}
                {!isOpen && contentLines.length > 0 && (
                  <span style={{
                    fontSize: 10.5,
                    color: "var(--text-tertiary)",
                    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                    opacity: 0.5,
                    marginLeft: 4,
                  }}>
                    ({contentLines.length})
                  </span>
                )}
              </div>
            )}

            {/* Animated section content */}
            <AnimatedCollapse open={isOpen && contentLines.length > 0}>
              <div style={{ paddingBottom: 4 }}>
                {contentLines.map((l) => renderLine(l))}
              </div>
            </AnimatedCollapse>
          </div>
        );
      })}
    </>
  );
}

function SectionedLogView({ logs, highlightMap, markers, onToggle, height }: {
  logs: string[];
  highlightMap: Map<number, string>;
  markers: Map<number, CollapseMarker>;
  onToggle: (id: string) => void;
  height: number;
}) {
  const sections = useMemo(() => parseSections(logs), [logs]);
  const { expanded, toggle } = useSectionExpansion(sections, logs.length);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const prevLogCount = useRef(0);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    if (logs.length > prevLogCount.current && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
      });
    }
    prevLogCount.current = logs.length;
  }, [logs.length]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUpRef.current = !nearBottom;
  }, []);

  const renderLine = useCallback((l: { text: string; index: number }) => (
    <LogLine
      key={l.index}
      text={l.text}
      index={l.index}
      highlightMap={highlightMap}
      markers={markers}
      onToggle={onToggle}
    />
  ), [highlightMap, markers, onToggle]);

  return (
    <div
      ref={scrollRef}
      className="rain-scroll"
      onScroll={handleScroll}
      style={{ height, overflowY: "auto", padding: "10px 0" }}
    >
      <SectionList
        sections={sections}
        expanded={expanded}
        onToggle={toggle}
        renderLine={renderLine}
      />
    </div>
  );
}

/** Sectioned view for drawer logs (ship, rust agent) — simpler line rendering */
function DrawerSectionedView({ logs, scrollRef, colorLine }: {
  logs: string[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  colorLine: (line: string) => { color: string; fontWeight: number };
}) {
  const sections = useMemo(() => parseSections(logs, SECTION_RE_OPEN), [logs]);
  const { expanded, toggle } = useSectionExpansion(sections, logs.length);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
      });
    }
  }, [logs.length, scrollRef]);

  const renderLine = useCallback((l: { text: string; index: number }) => {
    const style = colorLine(l.text);
    return (
      <div
        key={l.index}
        style={{
          padding: "0 14px",
          color: style.color,
          fontWeight: style.fontWeight,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          minHeight: l.text === "" ? 10 : undefined,
          fontSize: 11.5,
          lineHeight: 1.7,
        }}
      >
        {l.text}
      </div>
    );
  }, [colorLine]);

  // If no sections found (all pre-section lines), render flat
  if (sections.length <= 1 && sections[0]?.title === "") {
    return (
      <>
        {logs.map((line, i) => {
          const style = colorLine(line);
          return (
            <div
              key={i}
              style={{
                padding: "0 14px",
                color: style.color,
                fontWeight: style.fontWeight,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                minHeight: line === "" ? 10 : undefined,
                fontSize: 11.5,
                lineHeight: 1.7,
              }}
            >
              {line}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <SectionList
      sections={sections}
      expanded={expanded}
      onToggle={toggle}
      renderLine={renderLine}
    />
  );
}

// ── Crop Overlay ──
// Full-window overlay for selecting a screenshot region.
// Renders via portal on document.body so it covers the entire app.

interface CropOverlayProps {
  onCapture: (viewportRect: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
  initialRect?: { x: number; y: number; w: number; h: number } | null;
}

function CropOverlay({ onCapture, onCancel, initialRect }: CropOverlayProps) {
  const [sel, setSel] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    initialRect ? { x1: initialRect.x, y1: initialRect.y, x2: initialRect.x + initialRect.w, y2: initialRect.y + initialRect.h } : null,
  );
  const [drawing, setDrawing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Escape key to cancel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && sel) {
        const r = normalizedRect(sel);
        if (r.w > 10 && r.h > 10) onCapture(r);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel, onCapture, sel]);

  function normalizedRect(s: { x1: number; y1: number; x2: number; y2: number }) {
    const x = Math.min(s.x1, s.x2);
    const y = Math.min(s.y1, s.y2);
    return { x, y, w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't start new selection if clicking on the buttons
    if ((e.target as HTMLElement).closest("[data-crop-btn]")) return;
    setDrawing(true);
    setSel({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !sel) return;
    setSel({ ...sel, x2: e.clientX, y2: e.clientY });
  };

  const handleMouseUp = () => {
    setDrawing(false);
  };

  const r = sel ? normalizedRect(sel) : null;
  const hasSelection = r && r.w > 10 && r.h > 10;

  return createPortal(
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        cursor: drawing ? "crosshair" : "crosshair",
      }}
    >
      {/* Dim overlay using clip-path to cut out the selection */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          ...(hasSelection ? {
            clipPath: `polygon(
              0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
              ${r.x}px ${r.y}px, ${r.x}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y}px, ${r.x}px ${r.y}px
            )`,
          } : {}),
          pointerEvents: "none",
          transition: drawing ? "none" : "clip-path 0.15s ease",
        }}
      />

      {/* Selection border */}
      {hasSelection && (
        <div style={{
          position: "absolute",
          left: r.x,
          top: r.y,
          width: r.w,
          height: r.h,
          border: "2px solid rgba(255,255,255,0.85)",
          borderRadius: 4,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 12px rgba(0,0,0,0.3)",
          pointerEvents: "none",
        }} />
      )}

      {/* Hint text when no selection */}
      {!hasSelection && !drawing && (
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "rgba(255,255,255,0.8)",
          fontSize: 14,
          fontWeight: 500,
          textAlign: "center",
          pointerEvents: "none",
          textShadow: "0 1px 4px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}>
          <Crop size={28} strokeWidth={1.5} />
          <span>Drag to select capture area</span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>Press Esc to cancel</span>
        </div>
      )}

      {/* Confirm/Cancel buttons — show below selection */}
      {hasSelection && !drawing && (
        <div
          data-crop-btn
          style={{
            position: "absolute",
            left: r.x + r.w / 2,
            top: r.y + r.h + 12,
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            zIndex: 1,
          }}
        >
          <button
            data-crop-btn
            onClick={() => onCapture(r)}
            style={{
              background: "rgba(255,255,255,0.95)",
              color: "#111",
              border: "none",
              borderRadius: 6,
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <Camera size={13} strokeWidth={2} /> Capture
          </button>
          <button
            data-crop-btn
            onClick={onCancel}
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            <X size={13} strokeWidth={2} /> Cancel
          </button>
        </div>
      )}

      {/* Dimension label */}
      {hasSelection && (
        <div style={{
          position: "absolute",
          left: r.x + r.w / 2,
          top: r.y - 24,
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.7)",
          fontSize: 11,
          fontWeight: 500,
          pointerEvents: "none",
          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
        }}>
          {Math.round(r.w)} × {Math.round(r.h)}
        </div>
      )}
    </div>,
    document.body,
  );
}

export default function PreviewPane() {
  const { status, undoStack, redoStack, isRunning, cancel, undoLast, redoNext, generationLogs, rustAgentLogs, activeProjectId, runtimeErrorsRef: genRuntimeErrorsRef } = useGenerationContext();
  const { previewUrl, serverError, startPreview, stopPreview, allPreviewUrls, markUserStopped } = usePreviewContext();
  const { isOpen: sketchOpen, initialData: sketchData, closeSketch, insertImage: sketchInsert } = useSketchContext();
  const { active: activeProject } = useProjectContext();
  const projectId = activeProjectId;
  const hasStarted = status.phase !== "idle";
  const [activeTab, setActiveTab] = useState<"ui" | "code">("ui");
  const [serverLogs, setServerLogs] = useState<string[]>([]);

  // Listen for switch-to-code events from ChatPane (when user clicks status text)
  useEffect(() => {
    const handler = () => setActiveTab("code");
    window.addEventListener("raincast:switch-to-code", handler);
    return () => window.removeEventListener("raincast:switch-to-code", handler);
  }, []);

  // ── Detect installed code editors (cached, runs once) ──
  const [allEditors, setAllEditors] = useState<DetectedEditor[]>([]);
  const [activeEditor, setActiveEditor] = useState<DetectedEditor | null>(null);
  const [editorPickerOpen, setEditorPickerOpen] = useState(false);
  const editorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    detectEditors().then((eds) => {
      setAllEditors(eds);
      // Default to first installed editor, or file_explorer fallback
      const installed = eds.filter((e) => e.installed);
      const firstInstalled = installed.find((e) => e.id !== "file_explorer") ?? installed[0] ?? null;
      setActiveEditor(firstInstalled);
    }).catch((err) => {
      console.error("[PreviewPane] Editor detection failed:", err);
    });
  }, []);

  // Close picker on outside click
  useEffect(() => {
    if (!editorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (editorPickerRef.current && !editorPickerRef.current.contains(e.target as Node)) {
        setEditorPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editorPickerOpen]);

  const handleOpenInEditor = useCallback(() => {
    if (!activeEditor) return;
    openInEditor(projectId, activeEditor.id).catch((e) =>
      console.error("[open_in_editor]", e),
    );
  }, [activeEditor, projectId]);

  // ── Morphism reveal: hide iframe until loaded + 1.5s grace period ──
  const [revealedProjects, setRevealedProjects] = useState<Set<string>>(new Set());
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRevealed = revealedProjects.has(projectId);

  // Reset reveal state when preview URL changes (new generation or project switch)
  const prevPreviewUrl = useRef<string | null>(null);
  useEffect(() => {
    if (previewUrl !== prevPreviewUrl.current) {
      prevPreviewUrl.current = previewUrl;
      if (previewUrl) {
        // New preview URL — hide until iframe loads
        setRevealedProjects((s) => { const n = new Set(s); n.delete(projectId); return n; });
      }
    }
  }, [previewUrl, projectId]);

  // Clean up timer on unmount
  useEffect(() => () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current); }, []);

  const handleIframeLoad = useCallback((pid: string) => {
    // Iframe content loaded — wait 1.5s for components to render, then reveal
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      setRevealedProjects((s) => new Set(s).add(pid));
    }, 1500);
  }, []);

  const [undoing, setUndoing] = useState(false);
  const [redoing, setRedoing] = useState(false);

  // ── Ship state with self-healing ──
  const MAX_SHIP_FIX_ATTEMPTS = 3;
  const [shipState, setShipState] = useState<ShipState>("idle");
  const [hasShippedBefore, setHasShippedBefore] = useState(false);
  const [shipLogs, setShipLogs] = useState<string[]>([]);
  const shipLogsRef = useRef<string[]>([]);
  const shipFixAttemptRef = useRef(0);
  const shipCancelledRef = useRef(false);
  const unlistenShipRef = useRef<UnlistenFn | null>(null);

  // Reset ship state when switching projects, and restore saved ship logs
  useEffect(() => {
    setShipState("idle");
    setShipLogs([]);
    shipLogsRef.current = [];
    shipFixAttemptRef.current = 0;
    shipCancelledRef.current = false;

    loadShipLogs(projectId).then((saved) => {
      if (saved.length > 0) {
        shipLogsRef.current = saved;
        setShipLogs(saved);
      }
    }).catch((err) => {
      console.error("[PreviewPane] Failed to load ship logs:", err);
    });

    // Restore "shipped" state if the app was previously shipped
    hasShippedApp(projectId).then((exists) => {
      if (exists) {
        setShipState("shipped");
        setHasShippedBefore(true);
      }
    }).catch((err) => {
      console.error("[PreviewPane] Failed to check shipped state:", err);
    });
  }, [projectId]);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => { unlistenShipRef.current?.(); };
  }, []);

  const appendShipLog = useCallback((line: string) => {
    shipLogsRef.current = [...shipLogsRef.current, line];
    setShipLogs(shipLogsRef.current);
  }, []);

  const startShipBuild = useCallback(async (pid: string, name?: string) => {
    // Remove previous listener if any
    unlistenShipRef.current?.();

    return new Promise<"done" | "error">((resolve) => {
      listen<{ project_id: string; kind: string; message: string }>("ship-log", (event) => {
        if (event.payload.project_id !== pid) return;

        if (event.payload.kind === "log") {
          appendShipLog(event.payload.message);
        } else if (event.payload.kind === "done") {
          appendShipLog("");
          appendShipLog("── Ship complete!");
          resolve("done");
        } else if (event.payload.kind === "error") {
          appendShipLog(`ERROR: ${event.payload.message}`);
          resolve("error");
        }
      }).then((fn) => {
        unlistenShipRef.current = fn;
      }).catch((err) => {
        console.error("[PreviewPane] Failed to register ship-log listener:", err);
        appendShipLog(`ERROR: Failed to listen for ship events: ${err instanceof Error ? err.message : String(err)}`);
        resolve("error");
      });

      shipProject(pid, name).catch((err) => {
        appendShipLog(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
        resolve("error");
      });
    });
  }, [appendShipLog]);

  const handleShip = useCallback(async () => {
    if (shipState === "shipping" || shipState === "fixing") return;

    setShipState("shipping");
    shipLogsRef.current = ["── Starting ship process..."];
    setShipLogs(shipLogsRef.current);
    shipFixAttemptRef.current = 0;
    shipCancelledRef.current = false;
    setActiveTab("code");

    let result = await startShipBuild(projectId, activeProject.title);

    // Self-healing loop: if build fails, try to fix and rebuild
    while (result === "error" && shipFixAttemptRef.current < MAX_SHIP_FIX_ATTEMPTS && !shipCancelledRef.current) {
      shipFixAttemptRef.current++;
      const attempt = shipFixAttemptRef.current;

      appendShipLog("");
      appendShipLog(`── Auto-fix attempt ${attempt}/${MAX_SHIP_FIX_ATTEMPTS}...`);
      setShipState("fixing");

      const provider = getProviderById(getActiveProviderId());
      if (!provider) {
        appendShipLog("[ship-fix] No AI provider available — giving up");
        break;
      }

      if (shipCancelledRef.current) { appendShipLog("── Cancelled."); break; }

      try {
        const fixResult = await attemptShipFix({
          provider,
          projectId,
          shipLogs: shipLogsRef.current,
          onLog: appendShipLog,
        });

        if (shipCancelledRef.current) { appendShipLog("── Cancelled."); break; }

        if (!fixResult.fixed) {
          appendShipLog(`[ship-fix] Could not fix: ${fixResult.label || "no patches produced"}`);
          break;
        }

        // Fix applied — rebuild
        appendShipLog("");
        appendShipLog("── Rebuilding after fix...");
        setShipState("shipping");
        result = await startShipBuild(projectId, activeProject.title);
      } catch (err) {
        if (shipCancelledRef.current) { appendShipLog("── Cancelled."); break; }
        appendShipLog(`[ship-fix] Fix attempt crashed: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }

    // Cleanup listener
    unlistenShipRef.current?.();
    unlistenShipRef.current = null;

    // Persist ship logs to disk
    if (shipLogsRef.current.length > 0) {
      saveShipLogs(projectId, shipLogsRef.current).catch((err) => {
        console.error(`[PreviewPane] Failed to save ship logs for ${projectId}:`, err);
      });
    }

    if (result === "done") {
      setShipState("shipped");
      setHasShippedBefore(true);
      playShipDing();
    } else {
      setShipState("error");
      setTimeout(() => setShipState((s) => s === "error" ? "idle" : s), 10000);
    }
  }, [shipState, projectId, activeProject.title, startShipBuild, appendShipLog]);

  const handleOpenApp = useCallback(async () => {
    try {
      await launchShippedApp(projectId);
    } catch {
      // ignore
    }
  }, [projectId]);

  // Poll for preview server logs when code tab is active and server is running
  const prevServerLogsRef = useRef<string>("");
  useEffect(() => {
    if (activeTab !== "code" || !previewUrl) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await getPreviewLogs(projectId);
        if (cancelled) return;
        const next = [...result.stdout_tail, ...result.stderr_tail];
        // Only update state if content actually changed (avoids Shiki re-processing)
        const key = next.join("\n");
        if (key !== prevServerLogsRef.current) {
          prevServerLogsRef.current = key;
          setServerLogs(next);
        }
      } catch {
        // server not running yet
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeTab, projectId, previewUrl]);

  // Clear server logs when switching projects
  useEffect(() => {
    setServerLogs([]);
  }, [projectId]);

  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

  // ── Runtime console errors from the iframe ──
  const runtimeErrorsRef = useRef<string[]>([]);
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);

  // Listen for postMessage from iframe's console capture
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && typeof msg === "object" && msg.type === "runtime-console") {
        console.log("[Raincast:postMessage]", msg);
      }
      if (!msg || typeof msg !== "object" || msg.type !== "runtime-console") return;
      const { level, message } = msg.payload ?? {};
      if (typeof message !== "string") return;
      // Only capture errors and significant warnings (skip noisy vite/hmr warnings)
      if (level === "error" || (level === "warn" && !message.includes("React Router Future Flag") && !message.includes("[vite]"))) {
        const line = `[${level}] ${message}`;
        console.log("[Raincast:RuntimeCapture]", line);
        // Deduplicate consecutive identical errors
        if (runtimeErrorsRef.current[runtimeErrorsRef.current.length - 1] !== line) {
          runtimeErrorsRef.current = [...runtimeErrorsRef.current, line];
          // Cap at 100 entries
          if (runtimeErrorsRef.current.length > 100) {
            runtimeErrorsRef.current = runtimeErrorsRef.current.slice(-100);
          }
          setRuntimeErrors(runtimeErrorsRef.current);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Listen for proxy-invoke messages from iframe (dev-proxy mode)
  // The generated app's bridge.ts sends postMessage to parent for backend commands,
  // we route them through Raincast's proxy_tauri Tauri command.
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object" || msg.type !== "proxy-invoke") return;
      const { id, command, args } = msg;
      if (!id || !command) return;

      // Find the iframe that sent this message to send the response back
      const sourceWindow = event.source as WindowProxy | null;
      if (!sourceWindow) return;

      try {
        // __ping__ is a synthetic command from bridge.ts — respond immediately
        if (command === "__ping__") {
          sourceWindow.postMessage({ type: "proxy-result", id, result: "pong" }, "*");
          return;
        }

        let result: unknown;
        if (command.startsWith("plugin:") || command.startsWith("bridge_")) {
          // Plugin commands (plugin:window|*, plugin:clipboard|*, etc.) and
          // bridge_* commands (bridge_run_command, bridge_read_file, etc.)
          // route to Raincast's own Tauri backend
          result = await tauriInvoke(command, args ?? {});
        } else {
          // Custom commands from the generated app — route through proxy binary
          result = await proxyTauri(projectId, command, args ?? {});
        }
        sourceWindow.postMessage({ type: "proxy-result", id, result }, "*");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("[PreviewPane] proxy-invoke error:", command, errorMsg);
        sourceWindow.postMessage({ type: "proxy-error", id, error: errorMsg }, "*");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [projectId]);

  // Listen for proxy-listen / proxy-unlisten messages from iframe (dev-proxy event forwarding)
  // When the iframe subscribes to a Tauri event, we listen on its behalf and forward payloads back.
  const eventSubscriptions = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      const sourceWindow = event.source as WindowProxy | null;

      if (msg.type === "proxy-listen" && msg.event) {
        const eventName = msg.event as string;
        // Already subscribed — skip
        if (eventSubscriptions.current.has(eventName)) return;

        // Subscribe to the Tauri event and forward payloads to the iframe
        listen<unknown>(eventName, (tauriEvent) => {
          if (sourceWindow) {
            sourceWindow.postMessage({
              type: "proxy-event",
              event: eventName,
              payload: tauriEvent.payload,
            }, "*");
          }
        }).then((unlisten) => {
          eventSubscriptions.current.set(eventName, unlisten);
        });
      } else if (msg.type === "proxy-unlisten" && msg.event) {
        const eventName = msg.event as string;
        const unlisten = eventSubscriptions.current.get(eventName);
        if (unlisten) {
          unlisten();
          eventSubscriptions.current.delete(eventName);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      // Clean up all Tauri event subscriptions
      for (const unlisten of eventSubscriptions.current.values()) unlisten();
      eventSubscriptions.current.clear();
    };
  }, []);

  // Reset runtime errors on project switch
  useEffect(() => {
    runtimeErrorsRef.current = [];
    setRuntimeErrors([]);
  }, [projectId]);

  // Clear runtime errors when a new build starts
  const prevIsRunning = useRef(false);
  useEffect(() => {
    if (isRunning && !prevIsRunning.current) {
      runtimeErrorsRef.current = [];
      setRuntimeErrors([]);
    }
    prevIsRunning.current = isRunning;
  }, [isRunning]);

  // Expose runtime errors to the generation session via shared ref
  useEffect(() => {
    genRuntimeErrorsRef.current = () => runtimeErrorsRef.current;
    return () => { genRuntimeErrorsRef.current = null; };
  }, [genRuntimeErrorsRef]);

  // Merge generation logs + server logs (ship logs are shown in the bottom drawer)
  const allLogs = useMemo(() => {
    const lines = [...generationLogs];
    if (serverLogs.length > 0) {
      lines.push("", "── Preview Server ──");
      lines.push(...serverLogs);
    }
    if (runtimeErrors.length > 0) {
      lines.push("", "── Runtime Console ──");
      lines.push(...runtimeErrors);
    }
    return lines;
  }, [generationLogs, serverLogs, runtimeErrors]);

  // Collapsible blocks (file content + search/replace)
  const { processed: displayLogs, markers, toggle: toggleBlock } = useCollapsibleLogs(allLogs);

  // Syntax highlighting via Shiki — only process when code tab is visible
  const { appearance } = useAppearance();
  const isDark = appearance === "midnight";
  const shikiInput = activeTab === "code" ? displayLogs : [];
  const highlightMap = useShikiHighlight(shikiInput, isDark);

  const codeContainerRef = useRef<HTMLDivElement>(null);
  const [codeContainerHeight, setCodeContainerHeight] = useState(400);

  // Measure container height for sectioned log view
  useEffect(() => {
    const el = codeContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setCodeContainerHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleStop = useCallback(() => {
    markUserStopped(projectId);
    stopPreview(projectId);
    cancel(projectId);
  }, [markUserStopped, stopPreview, cancel, projectId]);

  const handlePlay = useCallback(() => {
    startPreview(projectId);
  }, [startPreview, projectId]);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    try {
      await undoLast(projectId);
    } finally {
      setUndoing(false);
    }
  }, [undoLast, projectId]);

  const handleRedo = useCallback(async () => {
    setRedoing(true);
    try {
      await redoNext(projectId);
    } finally {
      setRedoing(false);
    }
  }, [redoNext, projectId]);

  const [copied, setCopied] = useState(false);

  const handleCopyLogs = useCallback(() => {
    const text = allLogs.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [allLogs]);

  // ── Screenshot crop mode ──
  const [cropMode, setCropMode] = useState(false);
  const [cropInitialRect, setCropInitialRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleStartCrop = useCallback(() => {
    // Pre-select the iframe region as the initial crop area
    const iframe = iframeRefs.current[projectId];
    if (iframe) {
      const rect = iframe.getBoundingClientRect();
      // Only use initial rect if iframe is actually visible (not display:none)
      if (rect.width > 0 && rect.height > 0) {
        setCropInitialRect({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      } else {
        setCropInitialRect(null);
      }
    } else {
      setCropInitialRect(null);
    }
    setCropMode(true);
  }, [projectId]);

  const handleCropCapture = useCallback(async (viewportRect: { x: number; y: number; w: number; h: number }) => {
    setCropMode(false);
    try {
      // Use Tauri window API for accurate screen coordinate conversion
      const win = getCurrentWindow();
      const scaleFactor = await win.scaleFactor();
      const outerPos = await win.outerPosition();  // PhysicalPosition
      const outerSize = await win.outerSize();       // PhysicalSize
      const innerSize = await win.innerSize();       // PhysicalSize

      // Title bar height in logical pixels
      const titleBarH = (outerSize.height - innerSize.height) / scaleFactor;
      // Window position in logical pixels (screen points on macOS)
      const winX = outerPos.x / scaleFactor;
      const winY = outerPos.y / scaleFactor;

      // Convert viewport-relative crop rect to screen coordinates
      const screenX = winX + viewportRect.x;
      const screenY = winY + titleBarH + viewportRect.y;

      const base64 = await captureScreenshot(screenX, screenY, viewportRect.w, viewportRect.h);
      const dataUrl = `data:image/png;base64,${base64}`;
      window.dispatchEvent(new CustomEvent("raincast:insert-screenshot", {
        detail: { mime: "image/png", base64, dataUrl },
      }));
    } catch (err) {
      console.error("[Screenshot]", err);
    }
  }, []);

  const handleCropCancel = useCallback(() => {
    setCropMode(false);
  }, []);

  const busy = undoing || redoing;
  const canUndo = undoStack.length > 0 && !isRunning && !busy;
  const canRedo = redoStack.length > 0 && !isRunning && !busy;
  const canPlay = hasStarted && !previewUrl && !isRunning;
  const showToolbar = previewUrl || canUndo || canRedo || canPlay;

  // ── Error toast ──
  const [toastDismissed, setToastDismissed] = useState(false);
  const prevErrorRef = useRef<string | null>(null);

  // Derive error message from generation or ship failures
  const errorMessage = status.phase === "failed" && status.error
    ? status.error.title
    : shipState === "error"
      ? "Ship failed"
      : null;

  // Reset dismissed state when a new error appears
  useEffect(() => {
    if (errorMessage && errorMessage !== prevErrorRef.current) {
      setToastDismissed(false);
    }
    prevErrorRef.current = errorMessage;
  }, [errorMessage]);

  const showToast = !!errorMessage && !toastDismissed && activeTab === "ui";

  // ── Ship drawer ──
  const [shipDrawerOpen, setShipDrawerOpen] = useState(false);
  const shipDrawerRef = useRef<HTMLDivElement>(null);
  const hasShipLogs = shipLogs.length > 0;

  // Auto-open drawer when shipping starts (close other drawers to avoid overlap)
  useEffect(() => {
    if (shipState === "shipping" || shipState === "fixing") {
      setShipDrawerOpen(true);
           setRaDrawerOpen(false);
    }
  }, [shipState]);

  // (Auto-scroll handled by DrawerSectionedView)

  // ── Rust Agent Log drawer state ──
  const [raDrawerOpen, setRaDrawerOpen] = useState(false);
  const raDrawerRef = useRef<HTMLDivElement>(null);
  const hasRustLogs = rustAgentLogs.length > 0;

  // Auto-open Rust agent drawer when logs start appearing
  useEffect(() => {
    if (rustAgentLogs.length === 1) setRaDrawerOpen(true);
  }, [rustAgentLogs.length]);

  // (Auto-scroll handled by DrawerSectionedView)

  // Color helpers for drawer sectioned views
  const colorShipLine = useCallback((line: string): { color: string; fontWeight: number } => {
    const isErr = line.includes("ERROR") || line.includes("failed");
    const isOk = line.includes("complete") || line.includes("ready") || line.includes("Installed");
    return {
      color: isErr ? "#d55" : isOk ? "#2a8" : "var(--text-secondary)",
      fontWeight: 400,
    };
  }, []);

  const colorRustLine = useCallback((line: string): { color: string; fontWeight: number } => {
    const isErr = /error|fail|FAILED/i.test(line);
    const isOk = /PASSED|success|done|ready/i.test(line);
    const isTurn = /Rust Agent Turn/i.test(line);
    const isTool = /^\s+Tool:|^\s+\[/.test(line);
    const isSource = /^\s*(use |pub |fn |mod |#\[|struct |impl |let |if |for |match |return )/.test(line);
    return {
      color: isErr ? "#d55"
        : isOk ? "#2a8"
        : isTurn ? "#e87f3a"
        : isTool ? "#4a9eff"
        : isSource ? "var(--text-tertiary)"
        : "var(--text-secondary)",
      fontWeight: isTurn ? 500 : 400,
    };
  }, []);

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{ background: "var(--pane-bg)", position: "relative" }}
    >
      {cropMode && (
        <CropOverlay
          onCapture={handleCropCapture}
          onCancel={handleCropCancel}
          initialRect={cropInitialRect}
        />
      )}
      {sketchOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
          <ErrorBoundary>
            <SketchCanvas
              initialData={sketchData}
              onInsert={sketchInsert}
              onClose={closeSketch}
            />
          </ErrorBoundary>
        </div>
      )}
      <PreviewHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canShip={!!previewUrl && !isRunning}
        shipState={shipState}
        hasShippedBefore={hasShippedBefore}
        onShip={handleShip}
        onOpenApp={handleOpenApp}
      />
      <div className="flex-1 relative overflow-hidden">
        {/* ── Code tab — always mounted, hidden via display ── */}
        <div
          className="absolute inset-0"
          style={{ padding: 6, display: activeTab === "code" ? undefined : "none" }}
        >
          <div
            ref={codeContainerRef}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid var(--separator-color)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
              background: "var(--pane-bg)",
            }}
          >
            {displayLogs.length === 0 && !hasStarted && (
              <div style={{
                padding: "14px 18px",
  
                fontSize: 12.5,
              }}>
                <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
                  No output yet. Start generating an app to see logs here.
                </p>
              </div>
            )}
            {displayLogs.length === 0 && hasStarted && (
              <div style={{
                padding: "14px 18px",
  
                fontSize: 12.5,
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--text-tertiary)",
              }}>
                <div style={{
                  width: 10, height: 10,
                  border: "1.5px solid var(--separator-color)",
                  borderTopColor: "var(--slider-thumb)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }} />
                <span style={{ fontStyle: "italic" }}>Starting generation...</span>
              </div>
            )}
            {displayLogs.length > 0 && (
              <SectionedLogView
                logs={displayLogs}
                highlightMap={highlightMap}
                markers={markers}
                onToggle={toggleBlock}
                height={codeContainerHeight}
              />
            )}
          </div>
        </div>

        {/* ── UI tab — always mounted, hidden via display ── */}
        <div
          className="absolute inset-0"
          style={{ display: activeTab === "ui" ? undefined : "none" }}
        >
          {previewUrl ? (
            <div className="absolute inset-0" style={{ padding: 6 }}>
              <div style={{
                width: "100%",
                height: "100%",
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--pane-bg)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                border: "1px solid var(--separator-color)",
                position: "relative",
              }}>
                {/* Iframe loads in background — hidden until morphism reveal completes */}
                {Object.entries(allPreviewUrls).map(([pid, url]) => (
                  <iframe
                    key={pid}
                    ref={(el) => { iframeRefs.current[pid] = el; }}
                    src={url}
                    onLoad={() => handleIframeLoad(pid)}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: "none",
                      display: pid === projectId ? "block" : "none",
                    }}
                    title={`Preview ${pid}`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                ))}
              </div>
              {/* Server error banner */}
              {serverError && isRevealed && (
                <div style={{
                  position: "absolute",
                  bottom: 12,
                  left: 12,
                  right: 12,
                  zIndex: 25,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "#c44",
                  background: "rgba(255,240,240,0.9)",
                  backdropFilter: "blur(4px)",
                }}>
                  {serverError}
                </div>
              )}
              {/* Runtime errors — inline at bottom */}
            </div>
          ) : hasStarted && isRunning ? (
            <ErrorBoundary><GenerationOverlay status={status} /></ErrorBoundary>
          ) : hasStarted ? (
            /* Empty — morphism overlay below covers this state */
            null
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 4,
            }}>
              <EmptyIllustration />
              <p style={{
                paddingTop: 20,
                fontSize: 30,
                fontWeight: 600,
                color: "var(--text-secondary)",
                opacity: 0.2,
                marginTop: 12,
              }}>
                No preview yet
              </p>
            </div>
          )}
        </div>

        {/* ── Single persistent morphism overlay ── */}
        {/* Covers both "starting dev server" and "preparing app" states with no DOM flash */}
        {activeTab === "ui" && hasStarted && !isRunning && !isRevealed && (
          <div style={{
            position: "absolute",
            inset: 0,
            zIndex: 15,
            background: "var(--morphism-bg)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}>
            {/* Animated gradient blobs */}
            <div style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              borderRadius: 10,
            }}>
              <div style={{
                position: "absolute",
                width: "120%",
                height: "120%",
                top: "-10%",
                left: "-10%",
                background: "radial-gradient(ellipse at 30% 30%, var(--orb-color-3) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, var(--orb-color-1) 0%, transparent 60%)",
                opacity: 0.25,
                animation: "morphism-shift 8s ease-in-out infinite alternate",
              }} />
            </div>

            {/* Centered orb + status text */}
            <div style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}>
              <div style={{
                position: "relative",
                width: 52,
                height: 52,
                marginBottom: 16,
              }}>
                <div style={{
                  position: "absolute",
                  inset: -10,
                  borderRadius: "50%",
                  background: "var(--orb-glow)",
                  filter: "blur(14px)",
                  animation: "orb-pulse 3s ease-in-out infinite",
                }} />
                <div style={{
                  position: "relative",
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 35%, var(--orb-color-3), var(--orb-color-1) 50%, var(--orb-color-2) 100%)",
                  boxShadow: "0 4px 20px var(--orb-glow), inset 0 -4px 12px rgba(0,0,0,0.08), inset 0 4px 8px rgba(255,255,255,0.3)",
                  animation: "orb-pulse 3s ease-in-out infinite",
                }}>
                  <div style={{
                    position: "absolute",
                    top: 8,
                    left: 12,
                    width: 18,
                    height: 12,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.35)",
                    filter: "blur(5px)",
                  }} />
                </div>
              </div>
              <p style={{
                fontSize: 16,
                fontWeight: 500,
                color: "var(--text-secondary)",
                opacity: 0.7,
              }}>
                {previewUrl ? "Preparing your app…" : "Starting dev server…"}
              </p>
            </div>
          </div>
        )}

        {/* Fade-out reveal — covers iframe while opacity animates from 1→0 */}
        {activeTab === "ui" && isRevealed && previewUrl && (
          <div style={{
            position: "absolute",
            inset: 0,
            zIndex: 15,
            background: "var(--morphism-bg)",
            animation: "preview-reveal 0.6s ease-out forwards",
            pointerEvents: "none",
          }} />
        )}

        {/* ── Error toast ── */}
        {showToast && (
          <div style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 22,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 6px 8px 14px",
            borderRadius: 12,
            background: "var(--pane-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(200,60,60,0.15)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(200,60,60,0.05)",
            animation: "toast-slide-in 0.25s ease-out both",
            maxWidth: "85%",
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#d55",
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {errorMessage}
            </span>
            <button
              onClick={() => { setToastDismissed(true); setActiveTab("code"); }}
              style={{
                fontSize: 11.5,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                background: "var(--btn-subtle-hover-bg)",
                border: "none",
                borderRadius: 7,
                padding: "3px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              View logs
            </button>
            <button
              onClick={() => setToastDismissed(true)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                flexShrink: 0,
                opacity: 0.5,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
            >
              ×
            </button>
          </div>
        )}

        {/* Floating toolbar — Undo / Stop / Redo */}
        {showToolbar && (
          <div style={{
            position: "absolute",
            bottom: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            borderRadius: 12,
            background: "var(--pane-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--separator-color)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}>
            {/* Undo */}
            <button
              className="flex items-center justify-center rounded-lg transition-colors h-7 w-7"
              title="Undo"
              disabled={!canUndo}
              style={{
                background: "transparent",
                border: "none",
                color: canUndo ? "var(--text-primary)" : "var(--text-tertiary)",
                cursor: canUndo ? "pointer" : "default",
                opacity: canUndo ? 1 : 0.35,
              }}
              onClick={handleUndo}
              onMouseEnter={(e) => { if (canUndo) { e.currentTarget.style.background = "var(--btn-subtle-hover-bg)"; e.currentTarget.style.color = "var(--btn-subtle-hover-text)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = canUndo ? "var(--text-primary)" : "var(--text-tertiary)"; }}
            >
              <Undo2 size={14} strokeWidth={1.8} />
            </button>

            {/* Stop / Play */}
            {previewUrl ? (
              <button
                className="flex items-center justify-center rounded-lg transition-colors h-7 w-7"
                title="Stop Preview"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#e55",
                  cursor: "pointer",
                }}
                onClick={handleStop}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(238,85,85,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Square size={13} strokeWidth={2} fill="currentColor" />
              </button>
            ) : canPlay ? (
              <button
                className="flex items-center justify-center rounded-full transition-colors h-7 w-7"
                title="Start Preview"
                style={{
                  background: "rgba(42,170,136,0.12)",
                  border: "none",
                  color: "#2a8",
                  cursor: "pointer",
                }}
                onClick={handlePlay}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(42,170,136,0.22)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(42,170,136,0.12)"; }}
              >
                <Play size={14} strokeWidth={2} fill="currentColor" />
              </button>
            ) : null}

            {/* Redo */}
            <button
              className="flex items-center justify-center rounded-lg transition-colors h-7 w-7"
              title="Redo"
              disabled={!canRedo}
              style={{
                background: "transparent",
                border: "none",
                color: canRedo ? "var(--text-primary)" : "var(--text-tertiary)",
                cursor: canRedo ? "pointer" : "default",
                opacity: canRedo ? 1 : 0.35,
              }}
              onClick={handleRedo}
              onMouseEnter={(e) => { if (canRedo) { e.currentTarget.style.background = "var(--btn-subtle-hover-bg)"; e.currentTarget.style.color = "var(--btn-subtle-hover-text)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = canRedo ? "var(--text-primary)" : "var(--text-tertiary)"; }}
            >
              <Redo2 size={14} strokeWidth={1.8} />
            </button>

            {/* Screenshot — only on UI tab where there's a visual preview */}
            {previewUrl && activeTab === "ui" && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--separator-color)", flexShrink: 0 }} />
                <button
                  className="flex items-center justify-center rounded-lg transition-colors h-7 w-7"
                  title="Screenshot to chat"
                  style={{ background: "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer" }}
                  onClick={handleStartCrop}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--btn-subtle-hover-bg)"; e.currentTarget.style.color = "var(--btn-subtle-hover-text)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-primary)"; }}
                >
                  <Camera size={14} strokeWidth={1.8} />
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Open in editor pill ── */}
        {hasStarted && activeTab === "code" && allLogs.length > 0 && (
          <div ref={editorPickerRef} style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 24,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            {/* Open in editor + dropdown */}
            {activeEditor && <div style={{ position: "relative" }}>
              <button
                onClick={handleOpenInEditor}
                title={`Open in ${activeEditor.name}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  borderRadius: 8,
                  background: "var(--pane-bg)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid var(--separator-color)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  fontWeight: 500,
    
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                <EditorIcon editorId={activeEditor.id} size={14} />
                <span>Open</span>
                {allEditors.length > 1 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setEditorPickerOpen((v) => !v); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginLeft: -2,
                      padding: "0 1px",
                      color: "var(--text-tertiary)",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
                  >
                    <ChevronDown size={11} strokeWidth={2} style={{
                      transform: editorPickerOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.15s",
                    }} />
                  </span>
                )}
              </button>

              {/* Editor picker dropdown */}
              {editorPickerOpen && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  minWidth: 180,
                  padding: 4,
                  borderRadius: 9,
                  border: "1px solid var(--separator-color)",
                  background: "var(--pane-bg)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  zIndex: 26,
                  maxHeight: 320,
                  overflowY: "auto",
                }}>
                  {allEditors.map((ed) => (
                    <button
                      key={ed.id}
                      disabled={!ed.installed}
                      onClick={() => {
                        if (!ed.installed) return;
                        setActiveEditor(ed);
                        setEditorPickerOpen(false);
                        openInEditor(projectId, ed.id).catch((err) => {
                          console.warn("[PreviewPane] Failed to open in editor:", err);
                        });
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 10px",
                        border: "none",
                        borderRadius: 6,
                        background: ed.id === activeEditor?.id ? "var(--btn-muted-bg)" : "transparent",
                        cursor: ed.installed ? "pointer" : "default",
                        fontSize: 12,
                        fontFamily: "inherit",
                        color: ed.installed ? "var(--text-primary)" : "var(--text-tertiary)",
                        opacity: ed.installed ? 1 : 0.45,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { if (ed.installed) e.currentTarget.style.background = "var(--btn-muted-bg)"; }}
                      onMouseLeave={(e) => { if (ed.installed) e.currentTarget.style.background = ed.id === activeEditor?.id ? "var(--btn-muted-bg)" : "transparent"; }}
                    >
                      <EditorIcon editorId={ed.id} size={16} />
                      <span>{ed.name}</span>
                      {ed.id === activeEditor?.id && (
                        <Check size={12} strokeWidth={2} style={{ marginLeft: "auto", color: "var(--slider-thumb)" }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>}

            {/* Copy logs */}
            <button
              onClick={handleCopyLogs}
              title="Copy logs"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4px 7px",
                borderRadius: 8,
                background: "var(--pane-bg)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid var(--separator-color)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                cursor: "pointer",
                color: copied ? "#2a8" : "var(--text-tertiary)",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.8} />}
            </button>
          </div>
        )}

        {/* ── Ship terminal drawer ── */}
        {hasShipLogs && activeTab === "code" && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 6,
              right: 6,
              zIndex: 25,
              display: "flex",
              flexDirection: "column",
              maxHeight: shipDrawerOpen ? "55%" : 0,
              transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              overflow: "hidden",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              border: "1px solid var(--separator-color)",
              borderBottom: "none",
              boxShadow: "0 -2px 12px rgba(0,0,0,0.08)",
            }}
          >
            {/* Drawer handle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 12px",
                background: "var(--input-bg, var(--pane-bg))",
                borderBottom: shipDrawerOpen ? "1px solid var(--separator-color)" : "none",
                color: "var(--text-secondary)",
                fontSize: 11.5,
                fontWeight: 500,
  
                letterSpacing: 0.2,
                flexShrink: 0,
                cursor: "pointer",
              }}
              onClick={() => { setShipDrawerOpen((o) => !o); setRaDrawerOpen(false); }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              <Terminal size={12} strokeWidth={1.8} />
              <span>Ship Log</span>
              {(shipState === "shipping" || shipState === "fixing") && (
                <div style={{
                  width: 6, height: 6,
                  borderRadius: "50%",
                  background: "var(--slider-thumb)",
                  animation: "orb-pulse 1.5s ease-in-out infinite",
                  flexShrink: 0,
                }} />
              )}
              {shipState === "shipped" && (
                <Check size={11} strokeWidth={2.5} style={{ color: "#2a8" }} />
              )}
              {shipState === "error" && (
                <div style={{
                  width: 6, height: 6,
                  borderRadius: "50%",
                  background: "#d55",
                  flexShrink: 0,
                }} />
              )}
              <div style={{ flex: 1 }} />
              {(shipState === "shipping" || shipState === "fixing") && (
                <div
                  style={{ position: "relative", zIndex: 2 }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => e.stopPropagation()}
                  onMouseLeave={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      shipCancelledRef.current = true;
                      setShipState("error");
                      appendShipLog("── Cancelled by user.");
                      cancelShip(projectId).catch((err) => {
                        console.warn("[PreviewPane] Failed to cancel ship:", err);
                      });
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#d55";
                      e.currentTarget.style.borderColor = "#d55";
                      e.currentTarget.style.background = "rgba(221,85,85,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text-tertiary)";
                      e.currentTarget.style.borderColor = "var(--separator-color)";
                      e.currentTarget.style.background = "transparent";
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      borderRadius: 5,
                      fontSize: 10.5,
                      fontWeight: 500,
                      color: "var(--text-tertiary)",
                      background: "transparent",
                      border: "1px solid var(--separator-color)",
                      cursor: "pointer",
                      transition: "color 0.15s, border-color 0.15s, background 0.15s",
                      letterSpacing: 0.1,
                      lineHeight: 1,
                      fontFamily: "inherit",
                    }}
                  >
                    <Square size={8} strokeWidth={2.5} />
                    <span>Stop</span>
                  </button>
                </div>
              )}
              {shipDrawerOpen
                ? <ChevronDown size={13} strokeWidth={1.8} />
                : <ChevronUp size={13} strokeWidth={1.8} />
              }
            </div>

            {/* Drawer content */}
            <div
              ref={shipDrawerRef}
              className="rain-scroll"
              style={{
                flex: 1,
                overflow: "auto",
                background: "var(--input-bg, var(--pane-bg))",
                padding: "8px 0",
  
                fontSize: 11.5,
                lineHeight: 1.7,
              }}
            >
              <DrawerSectionedView
                logs={shipLogs}
                scrollRef={shipDrawerRef}
                colorLine={colorShipLine}
              />
            </div>
          </div>
        )}

        {/* Collapsed drawer tab — shown when drawer is closed and ship logs exist */}
        {hasShipLogs && activeTab === "code" && !shipDrawerOpen && (
          <button
            onClick={() => { setShipDrawerOpen(true); setRaDrawerOpen(false); }}
            style={{
              position: "absolute",
              bottom: 14,
              right: 14,
              zIndex: 24,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 8,
              background: "var(--pane-bg)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--separator-color)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 500,

              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <Terminal size={11} strokeWidth={1.8} />
            <span>Ship Log</span>
            {(shipState === "shipping" || shipState === "fixing") && (
              <div style={{
                width: 5, height: 5,
                borderRadius: "50%",
                background: "var(--slider-thumb)",
                animation: "orb-pulse 1.5s ease-in-out infinite",
              }} />
            )}
            {shipState === "shipped" && (
              <Check size={10} strokeWidth={2.5} style={{ color: "#2a8" }} />
            )}
            {shipState === "error" && (
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#d55" }} />
            )}
            <ChevronUp size={11} strokeWidth={1.8} />
          </button>
        )}

        {/* ── Rust Agent terminal drawer ── */}
        {hasRustLogs && activeTab === "code" && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 6,
              right: 6,
              zIndex: shipDrawerOpen ? 22 : 25,
              display: "flex",
              flexDirection: "column",
              maxHeight: raDrawerOpen ? "55%" : 0,
              transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              overflow: "hidden",
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              border: "1px solid var(--separator-color)",
              borderBottom: "none",
              boxShadow: "0 -2px 12px rgba(0,0,0,0.08)",
            }}
          >
            {/* Drawer handle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 12px",
                background: "var(--input-bg, var(--pane-bg))",
                borderBottom: raDrawerOpen ? "1px solid var(--separator-color)" : "none",
                color: "var(--text-secondary)",
                fontSize: 11.5,
                fontWeight: 500,
  
                letterSpacing: 0.2,
                flexShrink: 0,
                cursor: "pointer",
              }}
              onClick={() => { setRaDrawerOpen((o) => !o); setShipDrawerOpen(false); }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              <Cpu size={12} strokeWidth={1.8} />
              <span>Rust Agent</span>
              {isRunning && rustAgentLogs.length > 0 && (
                <div style={{
                  width: 6, height: 6,
                  borderRadius: "50%",
                  background: "#e87f3a",
                  animation: "orb-pulse 1.5s ease-in-out infinite",
                  flexShrink: 0,
                }} />
              )}
              <div style={{ flex: 1 }} />
              {raDrawerOpen
                ? <ChevronDown size={13} strokeWidth={1.8} />
                : <ChevronUp size={13} strokeWidth={1.8} />
              }
            </div>

            {/* Drawer content */}
            <div
              ref={raDrawerRef}
              className="rain-scroll"
              style={{
                flex: 1,
                overflow: "auto",
                background: "var(--input-bg, var(--pane-bg))",
                padding: "8px 0",
  
                fontSize: 11.5,
                lineHeight: 1.7,
              }}
            >
              <DrawerSectionedView
                logs={rustAgentLogs}
                scrollRef={raDrawerRef}
                colorLine={colorRustLine}
              />
            </div>
          </div>
        )}

        {/* Collapsed Rust Agent tab — shown when drawer is closed and logs exist */}
        {hasRustLogs && activeTab === "code" && !raDrawerOpen && (
          <button
            onClick={() => { setRaDrawerOpen(true); setShipDrawerOpen(false); }}
            style={{
              position: "absolute",
              bottom: 14,
              right: (() => {
                let offset = 14;
                if (hasShipLogs && !shipDrawerOpen) offset += 116;

                return offset;
              })(),
              zIndex: 24,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 8,
              background: "var(--pane-bg)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--separator-color)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 500,

              transition: "color 0.15s, right 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <Cpu size={11} strokeWidth={1.8} />
            <span>Rust Agent</span>
            {isRunning && rustAgentLogs.length > 0 && (
              <div style={{
                width: 5, height: 5,
                borderRadius: "50%",
                background: "#e87f3a",
                animation: "orb-pulse 1.5s ease-in-out infinite",
              }} />
            )}
            <ChevronUp size={11} strokeWidth={1.8} />
          </button>
        )}

        {/* ── Runtime error pill — visible on both tabs, pushed above drawer tabs on code tab ── */}
        <ErrorBoundary>
          <RuntimeErrorPill
            errors={runtimeErrors}
            bottomOffset={activeTab === "code" && (
              (hasShipLogs && !shipDrawerOpen) || (hasRustLogs && !raDrawerOpen)
            ) ? 34 : 0}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
