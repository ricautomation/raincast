import { useRef, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Paperclip, PenTool, ArrowUp, Square, X } from "lucide-react";
import type { ImageAttachment } from "../../lib/chat/types";
import { validateImageFile, fileToDataUrl, dataUrlToBase64 } from "@rain/editkit/browser";
import { useSketchContext } from "../../lib/sketch/SketchContext";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isRunning?: boolean;
  onStop?: () => void;
  images: ImageAttachment[];
  onImagesChange: (images: ImageAttachment[]) => void;
  /** Console errors inserted from the preview pane */
  attachedErrors: string[];
  onRemoveError: (index: number) => void;
}

const PLACEHOLDER_HINTS = [
  { text: "Write a message...", duration: 5000 },
  { text: "⏎ Enter for new line  ·  ⇧⏎ to send", duration: 3000 },
  { text: "Attach images or sketch a layout", duration: 3000 },
];

function useAnimatedPlaceholder() {
  const [index, setIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [phase, setPhase] = useState<"typing" | "hold" | "fade">("typing");

  useEffect(() => {
    const hint = PLACEHOLDER_HINTS[index];
    let charIdx = 0;
    let timer: ReturnType<typeof setTimeout>;

    // Typing phase
    setPhase("typing");
    setDisplayed("");

    const typeNext = () => {
      charIdx++;
      setDisplayed(hint.text.slice(0, charIdx));
      if (charIdx < hint.text.length) {
        timer = setTimeout(typeNext, 18 + Math.random() * 12);
      } else {
        // Hold phase
        setPhase("hold");
        timer = setTimeout(() => {
          // Fade then advance
          setPhase("fade");
          timer = setTimeout(() => {
            setIndex((i) => (i + 1) % PLACEHOLDER_HINTS.length);
          }, 300);
        }, hint.duration);
      }
    };

    timer = setTimeout(typeNext, 200);
    return () => clearTimeout(timer);
  }, [index]);

  return { displayed, phase };
}

export default function ChatInput({ value, onChange, onSend, isRunning, onStop, images, onImagesChange, attachedErrors, onRemoveError }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInput = value.trim().length > 0 || images.length > 0 || attachedErrors.length > 0;
  const [dragOver, setDragOver] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { openSketch } = useSketchContext();
  const { displayed: placeholderText, phase: placeholderPhase } = useAnimatedPlaceholder();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  // Reset height when value is cleared (e.g. after sending)
  useEffect(() => {
    if (!value) {
      const el = textareaRef.current;
      if (el) el.style.height = "auto";
    }
  }, [value]);

  const addImageFiles = useCallback(async (files: FileList | File[]) => {
    const newImages: ImageAttachment[] = [];
    for (const file of Array.from(files)) {
      const validation = validateImageFile(file);
      if (!validation.ok) {
        console.warn("[ChatInput] Image rejected:", validation.reason);
        continue;
      }
      try {
        const { mime, dataUrl } = await fileToDataUrl(file);
        const { base64 } = dataUrlToBase64(dataUrl);
        newImages.push({ mime, base64, dataUrl });
      } catch (err) {
        console.error("[ChatInput] Failed to read image file:", file.name, err);
      }
    }
    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
  }, [images, onImagesChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles);
    }
  }, [addImageFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const imageFiles: File[] = [];
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith("image/")) {
        imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      addImageFiles(imageFiles);
    }
  }, [addImageFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const removeImage = useCallback((index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  }, [images, onImagesChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        position: "relative",
        outline: dragOver ? "2px dashed var(--slider-thumb)" : "none",
        outlineOffset: -2,
        borderRadius: 16,
      }}
    >
      {/* Attached console errors */}
      {attachedErrors.length > 0 && (
        <div style={{ padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingBottom: 2,
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#d44",
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
              Console errors ({attachedErrors.length})
            </span>
          </div>
          <div style={{
            maxHeight: 100,
            overflowY: "auto",
            borderRadius: 8,
            background: "var(--btn-muted-bg)",
            padding: "6px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }} className="rain-scroll">
            {attachedErrors.map((err, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 6,
              }}>
                <div style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  color: "#d44",
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                  opacity: 0.85,
                }}>
                  {err.length > 120 ? err.slice(0, 120) + "..." : err}
                </div>
                <button
                  onClick={() => onRemoveError(i)}
                  style={{
                    flexShrink: 0,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 1,
                    color: "var(--text-tertiary)",
                    display: "flex",
                    marginTop: 1,
                  }}
                  title="Remove this error"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="px-4 pt-3 flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} style={{
              position: "relative",
              width: 56,
              height: 56,
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid var(--input-border)",
              cursor: "pointer",
            }}>
              <img
                src={img.dataUrl}
                alt={`Attachment ${i + 1}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onClick={() => setPreviewIndex(i)}
              />
              <button
                onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pt-3 pb-2" style={{ position: "relative" }}>
        {/* Animated placeholder */}
        {!value && images.length === 0 && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 12,
              left: 16,
              right: 16,
              pointerEvents: "none",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--text-tertiary)",
              opacity: placeholderPhase === "fade" ? 0 : 1,
              transition: "opacity 0.3s ease",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {placeholderText}
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => { onChange(e.target.value); autoResize(); }}
          onPaste={handlePaste}
          className="w-full bg-transparent outline-none text-[15px] resize-none leading-[1.5] rain-scroll"
          style={{
            minHeight: "22px",
            maxHeight: "160px",
            color: "var(--text-input)",
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="flex items-center justify-between px-3 pb-2.5">
        <div className="flex items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files) addImageFiles(e.target.files); e.target.value = ""; }}
          />
          <button className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--btn-subtle-hover-bg)"; e.currentTarget.style.color = "var(--btn-subtle-hover-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            title="Attach image"
          >
            <Paperclip size={16} strokeWidth={1.8} />
          </button>
          <div style={{ width: 1, height: 16, background: "var(--separator-color)", margin: "0 4px" }} />
          <button className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => openSketch()}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--btn-subtle-hover-bg)"; e.currentTarget.style.color = "var(--btn-subtle-hover-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            title="Sketch layout"
          >
            <PenTool size={16} strokeWidth={1.8} />
          </button>
        </div>
        {isRunning ? (
          <button
            className="w-7 h-7 flex items-center justify-center rounded-full"
            onClick={onStop}
            style={{
              background: "rgba(220, 60, 60, 0.12)",
              color: "#c0392b",
              cursor: "pointer",
              transition: "background 100ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220, 60, 60, 0.22)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(220, 60, 60, 0.12)"; }}
            title="Stop generation"
          >
            <Square size={10} strokeWidth={2.5} fill="currentColor" />
          </button>
        ) : (
          <button
            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
            onClick={onSend}
            style={{
              background: hasInput ? "var(--slider-thumb)" : "var(--btn-muted-bg)",
              color: hasInput ? "#ffffff" : "var(--btn-muted-text)",
              cursor: hasInput ? "pointer" : "default",
            }}
          >
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Lightbox preview — portal to body so it renders above all stacking contexts */}
      {previewIndex !== null && images[previewIndex] && createPortal(
        <div
          onClick={() => setPreviewIndex(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: "85vw",
              maxHeight: "80vh",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              cursor: "default",
            }}
          >
            <img
              src={images[previewIndex].dataUrl}
              alt="Preview"
              style={{
                display: "block",
                maxWidth: "85vw",
                maxHeight: "80vh",
                objectFit: "contain",
              }}
            />
            <button
              onClick={() => setPreviewIndex(null)}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
