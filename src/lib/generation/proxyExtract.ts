/**
 * Extract #[tauri::command] functions from Rust source and generate
 * a standalone CLI binary that dispatches JSON stdin → function → JSON stdout.
 *
 * Pure function — no fs, no DOM. Runs in the browser.
 */

export interface ProxyExtractResult {
  mainRs: string;
  cargoToml: string;
  commands: string[];
}

interface CommandSig {
  name: string;
  args: Array<{ name: string; rustType: string }>;
  returnType: string;
  body: string;
}

/**
 * Generate proxy binary source from Rust source file contents.
 * @param sources - Map of filename → source content (e.g., { "commands.rs": "...", "lib.rs": "..." })
 */
export function extractProxySource(
  sources: Record<string, string>,
): ProxyExtractResult {
  // Parse commands from all source files
  const commands: CommandSig[] = [];
  const sourceEntries = Object.entries(sources);

  for (const [, content] of sourceEntries) {
    if (content.includes("#[tauri::command]")) {
      commands.push(...parseRustCommands(content));
    }
  }

  if (commands.length === 0) {
    return { mainRs: "", cargoToml: "", commands: [] };
  }

  // Collect shared code (structs, enums, use statements, helper fns)
  const sharedCode = extractSharedCode(sourceEntries.map(([name, content]) => ({ name, content })));

  // Detect dependencies
  const allSource = sourceEntries.map(([, c]) => c).join("\n");
  const deps = detectDependencies(allSource);

  const mainRs = generateMainRs(commands, sharedCode);
  const cargoToml = generateCargoToml(deps);

  return { mainRs, cargoToml, commands: commands.map((c) => c.name) };
}

// ── Rust parser (minimal, browser-compatible) ──

function parseRustCommands(source: string): CommandSig[] {
  const commands: CommandSig[] = [];
  const cmdPattern =
    /#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*([^{]+?))?\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = cmdPattern.exec(source)) !== null) {
    const name = match[1];
    const argsRaw = match[2].trim();
    const returnRaw = (match[3] || "()").trim();
    const args = parseArgs(argsRaw);
    const bodyStart = match.index + match[0].length - 1;
    const body = extractBraceBlock(source, bodyStart);
    // Keep the full return type — don't strip Result<T, E> because the body uses Ok()/Err()
    commands.push({ name, args, returnType: returnRaw, body });
  }
  return commands;
}

function parseArgs(raw: string): Array<{ name: string; rustType: string }> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/(tauri::|State<|AppHandle)/.test(s))
    .map((s) => {
      const colonIdx = s.indexOf(":");
      if (colonIdx === -1) return null;
      return { name: s.slice(0, colonIdx).trim(), rustType: s.slice(colonIdx + 1).trim() };
    })
    .filter((a): a is { name: string; rustType: string } => a !== null);
}

function extractBraceBlock(source: string, startIdx: number): string {
  let depth = 0;
  let i = startIdx;
  while (i < source.length) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(startIdx + 1, i).trim();
    }
    i++;
  }
  return source.slice(startIdx + 1).trim();
}

// ── Shared code extraction ──

function extractSharedCode(sourceFiles: Array<{ name: string; content: string }>): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const sf of sourceFiles) {
    const source = sf.content;

    // use statements (excluding tauri and serde/std::io which generateMainRs already provides)
    for (const m of source.matchAll(/^(use\s+.+?;)\s*$/gm)) {
      const stmt = m[1].trim();
      if (/tauri::/.test(stmt) || /tauri_plugin/.test(stmt)) continue;
      // Skip imports already hardcoded in generateMainRs
      if (/^use serde::/.test(stmt) || /^use serde_json::/.test(stmt) || /^use std::io::Read/.test(stmt)) continue;
      if (!seen.has(stmt)) { seen.add(stmt); lines.push(stmt); }
    }

    // struct definitions with derives
    for (const m of source.matchAll(/((?:#\[derive\([^\]]*\)\]\s*)*(?:pub\s+)?struct\s+(\w+)\s*\{[^}]*\})/gs)) {
      if (/tauri::/.test(m[0])) continue;
      const key = `struct:${m[2]}`;
      if (!seen.has(key)) { seen.add(key); lines.push(""); lines.push(m[0].trim()); }
    }

    // enum definitions with derives
    for (const m of source.matchAll(/((?:#\[derive\([^\]]*\)\]\s*)*(?:pub\s+)?enum\s+(\w+)\s*\{[^}]*\})/gs)) {
      if (/tauri::/.test(m[0])) continue;
      const key = `enum:${m[2]}`;
      if (!seen.has(key)) { seen.add(key); lines.push(""); lines.push(m[0].trim()); }
    }

    // type aliases
    for (const m of source.matchAll(/^((?:pub\s+)?type\s+(\w+)\s*=\s*.+?;)\s*$/gm)) {
      if (/tauri::/.test(m[1])) continue;
      if (!seen.has(m[1].trim())) { seen.add(m[1].trim()); lines.push(m[1].trim()); }
    }

    // Helper functions (not #[tauri::command])
    const fnPattern = /(?:^|\n)((?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\([^)]*\)\s*(?:->\s*[^{]+?)?\s*\{)/g;
    let fnMatch: RegExpExecArray | null;
    while ((fnMatch = fnPattern.exec(source)) !== null) {
      const fnName = fnMatch[2];
      const fnStart = fnMatch.index;
      const before = source.slice(Math.max(0, fnStart - 100), fnStart);
      if (/#\[tauri::command\]/.test(before)) continue;
      if (["run", "main", "setup"].includes(fnName)) continue;

      const bodyStart = source.indexOf("{", fnStart + fnMatch[1].length - 1);
      if (bodyStart === -1) continue;
      const bodyEnd = findClosingBraceRust(source, bodyStart);
      if (bodyEnd === -1) continue;

      const fullFn = source.slice(fnStart, bodyEnd + 1).trim().replace(/^\n/, "");
      if (/tauri::|AppHandle|State</.test(fullFn)) continue;
      if (!seen.has(`fn:${fnName}`)) { seen.add(`fn:${fnName}`); lines.push(""); lines.push(fullFn); }
    }
  }

  return lines.join("\n");
}

function findClosingBraceRust(source: string, start: number): number {
  let depth = 0;
  let i = start;
  let inString = false;
  let stringChar = "";
  while (i < source.length) {
    const ch = source[i];
    if (!inString && ch === '"') { inString = true; stringChar = '"'; }
    else if (inString && ch === "\\" && i + 1 < source.length) { i++; }
    else if (inString && ch === stringChar) { inString = false; }
    else if (!inString) {
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) return i; }
    }
    i++;
  }
  return -1;
}

// ── Dependency detection ──

function detectDependencies(allSource: string) {
  return {
    walkdir: /walkdir::/.test(allSource) || /WalkDir::/.test(allSource),
    dirs: /dirs::/.test(allSource),
    chrono: /chrono::/.test(allSource),
    sha2: /sha2::/.test(allSource) || /Sha256/.test(allSource),
    md5: /md5::/.test(allSource),
    sysinfo: /sysinfo::/.test(allSource),
    image: /image::/.test(allSource) && !/imagesize::/.test(allSource),
    imagesize: /imagesize::/.test(allSource),
    regex: /regex::/.test(allSource) || /Regex::/.test(allSource),
    reqwest: /reqwest::/.test(allSource),
    tokio: /\.await/.test(allSource),
  };
}

// ── Code generation ──

function generateMainRs(commands: CommandSig[], sharedCode: string): string {
  const arms = commands
    .map((cmd) => {
      const argLines = cmd.args
        .map((a) => `        let ${a.name} = ${rustTypeFromJson(a.rustType, `args["${a.name}"]`)};`)
        .join("\n");

      const call = cmd.args.length > 0
        ? `${cmd.name}(${cmd.args.map((a) => a.name).join(", ")})`
        : `${cmd.name}()`;

      // If the command returns Result<T, E>, unwrap Ok/Err before serializing
      const isResult = /^Result\s*</.test(cmd.returnType);
      const resultHandling = isResult
        ? `            match ${call} {
                Ok(val) => match serde_json::to_value(&val) {
                    Ok(v) => println!("{}", serde_json::json!({ "result": v })),
                    Err(e) => println!("{}", serde_json::json!({ "error": e.to_string() })),
                },
                Err(e) => println!("{}", serde_json::json!({ "error": e.to_string() })),
            }`
        : `            let result = ${call};
            match serde_json::to_value(&result) {
                Ok(v) => println!("{}", serde_json::json!({ "result": v })),
                Err(e) => println!("{}", serde_json::json!({ "error": e.to_string() })),
            }`;

      return `        "${cmd.name}" => {
${argLines}
${resultHandling}
        }`;
    })
    .join("\n");

  const fnDefs = commands
    .map((cmd) => {
      const params = cmd.args.map((a) => `${a.name}: ${a.rustType}`).join(", ");
      const retType = cmd.returnType === "()" ? "()" : cmd.returnType;
      // For Result types that used Tauri's error type, replace with String
      const cleanRetType = retType.replace(/Result\s*<\s*(.+?)\s*,\s*(?:tauri::Error|Error)\s*>/, "Result<$1, String>");
      return `fn ${cmd.name}(${params}) -> ${cleanRetType} {
    ${cmd.body}
}`;
    })
    .join("\n\n");

  return `// Auto-generated proxy binary for dev-mode command execution.
// DO NOT EDIT — regenerated each time the Rust backend changes.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;

${sharedCode}

// ── Command functions ──

${fnDefs}

// ── CLI dispatcher ──

fn main() {
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        println!("{}", serde_json::json!({ "error": format!("Failed to read stdin: {}", e) }));
        std::process::exit(1);
    }

    let request: Value = match serde_json::from_str(&input) {
        Ok(v) => v,
        Err(e) => {
            println!("{}", serde_json::json!({ "error": format!("Invalid JSON: {}", e) }));
            std::process::exit(1);
        }
    };

    let command = request["command"].as_str().unwrap_or("");
    let args = &request["args"];

    match command {
${arms}
        _ => {
            println!("{}", serde_json::json!({ "error": format!("Unknown command: {}", command) }));
        }
    }
}
`;
}

function generateCargoToml(deps: ReturnType<typeof detectDependencies>): string {
  const depLines: string[] = [
    `serde = { version = "1", features = ["derive"] }`,
    `serde_json = "1"`,
  ];
  if (deps.walkdir) depLines.push(`walkdir = "2"`);
  if (deps.dirs) depLines.push(`dirs = "5"`);
  if (deps.chrono) depLines.push(`chrono = { version = "0.4", features = ["serde"] }`);
  if (deps.sha2) depLines.push(`sha2 = "0.10"`);
  if (deps.md5) depLines.push(`md5 = "0.7"`);
  if (deps.sysinfo) depLines.push(`sysinfo = "0.30"`);
  if (deps.image) depLines.push(`image = "0.24"`);
  if (deps.imagesize) depLines.push(`imagesize = "0.12"`);
  if (deps.regex) depLines.push(`regex = "1"`);
  if (deps.reqwest) depLines.push(`reqwest = { version = "0.12", features = ["blocking", "json"] }`);
  if (deps.tokio) depLines.push(`tokio = { version = "1", features = ["full"] }`);

  return `[package]
name = "dev-proxy"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "dev-proxy"
path = "src/main.rs"

[dependencies]
${depLines.join("\n")}

[profile.dev]
opt-level = 0
debug = false
`;
}

function rustTypeFromJson(rustType: string, jsonAccess: string): string {
  if (rustType === "String" || rustType === "&str") return `${jsonAccess}.as_str().unwrap_or_default().to_string()`;
  if (rustType === "bool") return `${jsonAccess}.as_bool().unwrap_or_default()`;
  if (/^(i32|i64|isize)$/.test(rustType)) return `${jsonAccess}.as_i64().unwrap_or_default() as ${rustType}`;
  if (/^(u8|u16|u32|u64|usize)$/.test(rustType)) return `${jsonAccess}.as_u64().unwrap_or_default() as ${rustType}`;
  if (/^(f32|f64)$/.test(rustType)) return `${jsonAccess}.as_f64().unwrap_or_default() as ${rustType}`;
  if (/^Option</.test(rustType)) {
    const inner = rustType.match(/^Option<\s*(.+?)\s*>$/)?.[1] ?? "String";
    if (inner === "String") return `${jsonAccess}.as_str().map(|s| s.to_string())`;
    return `serde_json::from_value(${jsonAccess}.clone()).ok()`;
  }
  return `serde_json::from_value(${jsonAccess}.clone()).unwrap_or_default()`;
}
