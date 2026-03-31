import { invoke } from "@tauri-apps/api/core";

export interface InitProjectResult {
  project_root: string;
  app_root: string;
}

export interface StageFilesResult {
  staged_paths: string[];
}

export interface ApplyCheckpointResult {
  snapshot_id: string;
  applied_paths: string[];
}

export async function initProject(projectId: string): Promise<InitProjectResult> {
  return invoke<InitProjectResult>("init_project", { projectId });
}

export async function stageFiles(
  projectId: string,
  genId: string,
  files: Array<{ path: string; content: string }>,
): Promise<StageFilesResult> {
  return invoke<StageFilesResult>("stage_files", { projectId, genId, files });
}

export async function applyCheckpoint(
  projectId: string,
  genId: string,
  paths: string[],
): Promise<ApplyCheckpointResult> {
  return invoke<ApplyCheckpointResult>("apply_checkpoint", { projectId, genId, paths });
}

export async function rollbackSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<void> {
  return invoke<void>("rollback_snapshot", { projectId, snapshotId });
}

export async function reapplySnapshot(
  projectId: string,
  snapshotId: string,
): Promise<void> {
  return invoke<void>("reapply_snapshot", { projectId, snapshotId });
}

// ── File reading ──

export async function readProjectFile(
  projectId: string,
  path: string,
): Promise<string> {
  return invoke<string>("bridge_read_file", { projectId, path });
}

// ── Directory listing ──

export interface DirEntry {
  name: string;
  is_dir: boolean;
}

export async function listDir(
  projectId: string,
  path: string,
): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("bridge_list_dir", { projectId, path });
}

/**
 * Recursively read all .ts/.tsx/.css files under a directory.
 * Returns a map of relative paths to file contents.
 */
export async function readProjectSourceFiles(
  projectId: string,
  dir: string = "src",
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  async function walk(currentDir: string): Promise<void> {
    let entries: DirEntry[];
    try {
      entries = await listDir(projectId, currentDir);
    } catch {
      return; // directory doesn't exist
    }

    for (const entry of entries) {
      const fullPath = currentDir ? `${currentDir}/${entry.name}` : entry.name;
      if (entry.is_dir) {
        if (entry.name !== "node_modules" && entry.name !== ".rain") {
          await walk(fullPath);
        }
      } else if (/\.(tsx?|css|rs)$/.test(entry.name)) {
        try {
          result[fullPath] = await readProjectFile(projectId, fullPath);
        } catch (err) {
          console.warn(`[readProjectSourceFiles] Skipped unreadable file ${fullPath}:`, err);
          result[fullPath] = `// [ERROR: Could not read this file: ${err instanceof Error ? err.message : String(err)}]`;
        }
      }
    }
  }

  await walk(dir);
  return result;
}

// ── Project Grep ──

export interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

export async function grepProjectFiles(
  projectId: string,
  pattern: string,
  fileGlob?: string,
  maxResults?: number,
): Promise<GrepMatch[]> {
  return invoke<GrepMatch[]>("bridge_grep_files", {
    projectId,
    pattern,
    fileGlob: fileGlob ?? null,
    maxResults: maxResults ?? 50,
  });
}

// ── Validation ──

export interface ValidationResult {
  ok: boolean;
  exit_code: number;
  stdout_tail: string[];
  stderr_tail: string[];
}

export async function runValidation(
  projectId: string,
  commands: string[],
): Promise<ValidationResult> {
  return invoke<ValidationResult>("run_validation", { projectId, commands });
}

// ── File deletion ──

export async function deleteProjectFile(
  projectId: string,
  path: string,
): Promise<void> {
  return invoke<void>("bridge_delete_file", { projectId, path });
}

// ── File writing ──

export async function writeProjectFile(
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  return invoke<void>("bridge_write_file", { projectId, path, content });
}

// ── System Info ──

export interface SystemInfo {
  os: string;          // "macos", "windows", "linux"
  arch: string;        // "aarch64", "x86_64"
  home_dir: string;
  desktop_dir: string;
  documents_dir: string;
  downloads_dir: string;
  username: string;
}

let _cachedSystemInfo: SystemInfo | null = null;
let _systemInfoError: Error | null = null;
const SYSTEM_INFO_RETRY_MS = 30_000;
let _systemInfoErrorAt = 0;

export async function getSystemInfo(): Promise<SystemInfo> {
  if (_cachedSystemInfo) return _cachedSystemInfo;
  // Avoid thundering herd: if we recently failed, throw cached error
  if (_systemInfoError && Date.now() - _systemInfoErrorAt < SYSTEM_INFO_RETRY_MS) {
    throw _systemInfoError;
  }
  try {
    _cachedSystemInfo = await invoke<SystemInfo>("get_system_info");
    _systemInfoError = null;
    return _cachedSystemInfo;
  } catch (err) {
    _systemInfoError = err instanceof Error ? err : new Error(String(err));
    _systemInfoErrorAt = Date.now();
    throw _systemInfoError;
  }
}

// ── Code Editor Detection ──

export interface DetectedEditor {
  id: string;       // "vscode", "cursor", "zed", "file_explorer", etc.
  name: string;     // "VS Code", "Cursor", "Zed", "Finder", etc.
  path: string;     // absolute path to the binary/app
  installed: boolean; // whether the editor is actually installed on this system
}

let _cachedEditors: DetectedEditor[] | null = null;

export async function detectEditors(): Promise<DetectedEditor[]> {
  if (_cachedEditors) return _cachedEditors;
  _cachedEditors = await invoke<DetectedEditor[]>("detect_editors");
  return _cachedEditors;
}

export async function openInEditor(
  projectId: string,
  editorId: string,
): Promise<void> {
  return invoke<void>("open_in_editor", { projectId, editorId });
}

// ── Build / Ship ──

/** Fire-and-forget: starts the ship process. Listen for 'ship-log' events for progress. */
export async function shipProject(projectId: string, appName?: string): Promise<void> {
  return invoke<void>("ship_project", { projectId, appName: appName || null });
}

export async function hasShippedApp(projectId: string): Promise<boolean> {
  return invoke<boolean>("has_shipped_app", { projectId });
}

export async function launchShippedApp(projectId: string): Promise<void> {
  return invoke<void>("launch_shipped_app", { projectId });
}

// ── Preview Server ──

export interface StartPreviewResult {
  port: number;
}

export interface PreviewLogs {
  stdout_tail: string[];
  stderr_tail: string[];
}

export async function startPreviewServer(
  projectId: string,
  port?: number,
): Promise<StartPreviewResult> {
  return invoke<StartPreviewResult>("start_preview_server", { projectId, port: port ?? null });
}

export async function stopPreviewServer(projectId: string): Promise<void> {
  return invoke<void>("stop_preview_server", { projectId });
}

export async function getPreviewLogs(projectId: string): Promise<PreviewLogs> {
  return invoke<PreviewLogs>("get_preview_logs", { projectId });
}

// ── Dev Proxy ──

/** Build the proxy binary for dev-mode command execution. */
export async function buildProxyBinary(
  projectId: string,
  mainRs: string,
  cargoToml: string,
): Promise<string> {
  return invoke<string>("build_proxy_binary", { projectId, mainRs, cargoToml });
}

/** Execute a command via the project's proxy binary. */
export async function proxyTauri(
  projectId: string,
  command: string,
  args: unknown,
): Promise<unknown> {
  return invoke<unknown>("proxy_tauri", { projectId, command, args: args ?? {} });
}

/** Check if a project has a generated app on disk (survives restarts). */
export async function checkProjectHasApp(projectId: string): Promise<boolean> {
  return invoke<boolean>("check_project_has_app", { projectId });
}

/** Save generation logs to disk for the given project. */
export async function saveGenerationLogs(projectId: string, logs: string[]): Promise<void> {
  return invoke<void>("save_generation_logs", { projectId, logs });
}

/** Load generation logs from disk for the given project. */
export async function loadGenerationLogs(projectId: string): Promise<string[]> {
  return invoke<string[]>("load_generation_logs", { projectId });
}

/** Save ship logs to disk for the given project. */
export async function saveShipLogs(projectId: string, logs: string[]): Promise<void> {
  return invoke<void>("save_ship_logs", { projectId, logs });
}

/** Load ship logs from disk for the given project. */
export async function loadShipLogs(projectId: string): Promise<string[]> {
  return invoke<string[]>("load_ship_logs", { projectId });
}

/** Save a PNG icon (base64) for the project. */
export async function saveAppIcon(projectId: string, pngBase64: string): Promise<void> {
  return invoke<void>("save_app_icon", { projectId, pngBase64 });
}

/** Load the saved app icon as a data URL. Returns empty string if no icon exists. */
export async function loadAppIcon(projectId: string): Promise<string> {
  return invoke<string>("load_app_icon", { projectId });
}

/** Update the app name in all generated source files (tauri.conf.json, Cargo.toml, package.json, index.html). */
export async function renameAppInSource(projectId: string, newName: string): Promise<void> {
  return invoke<void>("rename_app_in_source", { projectId, newName });
}

/** Cancel an in-progress ship build. */
export async function cancelShip(projectId: string): Promise<void> {
  return invoke<void>("cancel_ship", { projectId });
}

/** Capture a screenshot of a screen region. Returns base64 PNG. */
export async function captureScreenshot(x: number, y: number, width: number, height: number): Promise<string> {
  return invoke<string>("capture_screenshot", { x, y, width, height });
}
