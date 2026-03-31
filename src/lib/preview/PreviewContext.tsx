import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react";
import { startPreviewServer, stopPreviewServer, readProjectFile, writeProjectFile } from "../tauri/workspace";
import { useProjectContext } from "../project/ProjectContext";

/** Runtime capture source — injected into existing projects that lack it */
const RUNTIME_CAPTURE_SRC = `const isPreview = window.parent !== window && !(window as any).__TAURI_INTERNALS__;
if (isPreview) {
  const post = (level: string, message: string) => {
    try { window.parent.postMessage({ type: "runtime-console", payload: { level, message } }, "*"); } catch {}
  };
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args: unknown[]) => { origError.apply(console, args); post("error", args.map(String).join(" ")); };
  console.warn = (...args: unknown[]) => { origWarn.apply(console, args); post("warn", args.map(String).join(" ")); };
  window.addEventListener("error", (e) => {
    post("error", \`\${e.message} at \${e.filename || "unknown"}:\${e.lineno || 0}:\${e.colno || 0}\`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    post("error", \`Unhandled rejection: \${e.reason instanceof Error ? e.reason.message : String(e.reason)}\`);
  });
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    try {
      const response = await origFetch(...args);
      if (!response.ok) {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
        let host: string; try { host = new URL(url, location.href).hostname; } catch { host = url; }
        post("error", \`HTTP \${response.status} \${response.statusText} — \${host}\`);
      }
      return response;
    } catch (err) {
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
      let host: string; try { host = new URL(url, location.href).hostname; } catch { host = url; }
      post("error", \`Network error: \${err instanceof Error ? err.message : String(err)} — \${host}\`);
      throw err;
    }
  };
}
`;

interface ProjectPreviewState {
  previewUrl: string | null;
  overlayText: string | null;
  serverError: string | null;
}

const INITIAL_PREVIEW: ProjectPreviewState = {
  previewUrl: null,
  overlayText: null,
  serverError: null,
};

interface PreviewCtx {
  /** State for the currently active project */
  previewUrl: string | null;
  overlayText: string | null;
  serverError: string | null;
  /** All project preview URLs — for rendering persistent iframes */
  allPreviewUrls: Record<string, string>;
  startPreview: (projectId: string, port?: number) => Promise<void>;
  stopPreview: (projectId: string) => Promise<void>;
  /** Mark a project as manually stopped by the user (prevents auto-restart) */
  markUserStopped: (projectId: string) => void;
  /** Check if a project was manually stopped by the user */
  isUserStopped: (projectId: string) => boolean;
}

const PreviewContext = createContext<PreviewCtx>({
  previewUrl: null,
  overlayText: null,
  serverError: null,
  allPreviewUrls: {},
  startPreview: async () => {},
  stopPreview: async () => {},
  markUserStopped: () => {},
  isUserStopped: () => false,
});

export function PreviewProvider({ children }: { children: ReactNode }) {
  const { activeId } = useProjectContext();
  const [previews, setPreviews] = useState<Record<string, ProjectPreviewState>>({});

  const updatePreview = useCallback((id: string, update: Partial<ProjectPreviewState>) => {
    setPreviews((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? INITIAL_PREVIEW), ...update },
    }));
  }, []);

  // Track projects where the user explicitly clicked stop (prevents auto-restart)
  const userStoppedRef = useRef<Set<string>>(new Set());

  const markUserStopped = useCallback((projectId: string) => {
    userStoppedRef.current.add(projectId);
  }, []);

  const isUserStopped = useCallback((projectId: string) => {
    return userStoppedRef.current.has(projectId);
  }, []);

  // Guard against concurrent startPreview calls for the same project
  const startingRef = useRef<Set<string>>(new Set());

  const startPreview = useCallback(async (projectId: string, port?: number) => {
    if (startingRef.current.has(projectId)) return; // Already starting — skip
    startingRef.current.add(projectId);
    // Clear user-stopped flag — any start (manual or auto) resets it
    userStoppedRef.current.delete(projectId);

    updatePreview(projectId, { overlayText: "Starting preview…", serverError: null });

    // Ensure runtimeCapture.ts exists so console errors are forwarded to Raincast
    try {
      await readProjectFile(projectId, "src/lib/runtimeCapture.ts");
    } catch {
      // File doesn't exist — inject it and add import to main.tsx
      try {
        await writeProjectFile(projectId, "src/lib/runtimeCapture.ts", RUNTIME_CAPTURE_SRC);
        const mainTsx = await readProjectFile(projectId, "src/main.tsx");
        if (!mainTsx.includes("runtimeCapture")) {
          await writeProjectFile(projectId, "src/main.tsx", `import "./lib/runtimeCapture";\n${mainTsx}`);
        }
      } catch (err) {
        console.warn("[PreviewContext] Failed to inject runtimeCapture:", err);
      }
    }

    // Stop any existing preview server for this project before starting fresh
    try { await stopPreviewServer(projectId); } catch { /* ignore */ }

    try {
      const result = await startPreviewServer(projectId, port);
      const url = `http://127.0.0.1:${result.port}`;

      // Poll until the server responds (up to 30s — npm install can take a while on first run)
      let serverReady = false;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        try {
          await fetch(url, { mode: "no-cors" });
          serverReady = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (serverReady) {
        // Set previewUrl — the iframe + morphism overlay handle the visual transition.
        // The iframe onLoad will trigger reveal once everything is actually ready.
        updatePreview(projectId, { previewUrl: url, overlayText: null });
      } else {
        updatePreview(projectId, { overlayText: null, serverError: "Preview server did not respond within 30s" });
      }
    } catch (err) {
      updatePreview(projectId, { overlayText: null, serverError: err instanceof Error ? err.message : String(err) });
    } finally {
      startingRef.current.delete(projectId);
    }
  }, [updatePreview]);

  const stopPreview = useCallback(async (projectId: string) => {
    try {
      await stopPreviewServer(projectId);
    } catch {
      // ignore errors on stop
    }
    updatePreview(projectId, { previewUrl: null, overlayText: null, serverError: null });
  }, [updatePreview]);

  // Stop the previous project's dev server when switching projects
  const prevActiveId = useRef(activeId);
  useEffect(() => {
    const prev = prevActiveId.current;
    if (prev && prev !== activeId && previews[prev]?.previewUrl) {
      stopPreviewServer(prev).catch((err) => {
        console.warn(`[PreviewContext] Failed to stop preview server for ${prev}:`, err);
      });
      setPreviews((p) => {
        const next = { ...p };
        delete next[prev];
        return next;
      });
    }
    prevActiveId.current = activeId;
  }, [activeId, previews]);

  const active = previews[activeId] ?? INITIAL_PREVIEW;

  // Only expose the active project's preview URL (single-project view)
  const allPreviewUrls = useMemo(() => {
    const result: Record<string, string> = {};
    if (active.previewUrl) result[activeId] = active.previewUrl;
    return result;
  }, [activeId, active.previewUrl]);

  const value = useMemo<PreviewCtx>(() => ({
    previewUrl: active.previewUrl,
    overlayText: active.overlayText,
    serverError: active.serverError,
    allPreviewUrls,
    startPreview,
    stopPreview,
    markUserStopped,
    isUserStopped,
  }), [active, allPreviewUrls, startPreview, stopPreview, markUserStopped, isUserStopped]);

  return (
    <PreviewContext.Provider value={value}>
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreviewContext() {
  return useContext(PreviewContext);
}
