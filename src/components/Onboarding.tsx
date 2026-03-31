import { useState, useEffect, useRef, type CSSProperties } from "react";
import { Eye, EyeOff, ArrowRight, Check, Shield } from "lucide-react";
import { setGeminiApiKey, setAnthropicApiKey, setActiveProviderId } from "../lib/ai/settings";
import type { AiProviderId } from "../lib/ai/types";

const ONBOARDING_KEY = "raincast-onboarding-done";

const PROVIDERS = [
  {
    id: "google" as const,
    providerId: "gemini" as AiProviderId,
    name: "Google Gemini",
    desc: "Fast, multimodal, generous free tier",
    placeholder: "AIza...",
    setKey: setGeminiApiKey,
    gradient: "linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 100%)",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="url(#gm)" />
        <path d="M12 7l1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5L12 7z" fill="white" opacity="0.9" />
        <defs>
          <linearGradient id="gm" x1="2" y1="2" x2="22" y2="22">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="50%" stopColor="#34A853" />
            <stop offset="100%" stopColor="#FBBC05" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: "anthropic" as const,
    providerId: "anthropic" as AiProviderId,
    name: "Anthropic Claude",
    desc: "Thoughtful, precise, great for code",
    placeholder: "sk-ant-...",
    setKey: setAnthropicApiKey,
    gradient: "linear-gradient(135deg, #D4A574 0%, #CC785C 100%)",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="12" fill="url(#an)" />
        <path d="M13.5 6L17.5 18H15L14.2 15.5H9.8L9 18H6.5L10.5 6H13.5ZM12 9L10.5 13.5H13.5L12 9Z" fill="white" opacity="0.95" />
        <defs>
          <linearGradient id="an" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0%" stopColor="#D4A574" />
            <stop offset="100%" stopColor="#CC785C" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
];

export function needsOnboarding(): boolean {
  try {
    if (localStorage.getItem(ONBOARDING_KEY) === "1") return false;
    const raw = localStorage.getItem("raincast-api-keys");
    if (!raw) return true;
    const keys = JSON.parse(raw);
    return !keys.google && !keys.anthropic;
  } catch {
    return true;
  }
}

// ── Styles injected once ──

const STYLE_ID = "onboarding-keyframes";
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes onb-fade-up {
      0%   { opacity: 0; transform: translateY(16px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes onb-scale-in {
      0%   { opacity: 0; transform: scale(0.96) translateY(8px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes onb-spin {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

// ── Main Component ──

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureStyles();
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
  }, []);

  useEffect(() => {
    if (selectedId) setTimeout(() => inputRef.current?.focus(), 200);
  }, [selectedId]);

  const selected = PROVIDERS.find((p) => p.id === selectedId);
  const canContinue = !!selected && apiKey.trim().length > 8;

  function exit(cb: () => void) {
    setExiting(true);
    setTimeout(cb, 500);
  }

  function handleContinue() {
    if (!selected || !canContinue) return;
    setSaving(true);
    selected.setKey(apiKey.trim());
    setActiveProviderId(selected.providerId);
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* */ }
    exit(onDone);
  }

  function handleSkip() {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* */ }
    exit(onDone);
  }

  const stagger = (i: number): CSSProperties => ({
    opacity: 0,
    animation: mounted ? `onb-fade-up 600ms ease ${300 + i * 120}ms forwards` : "none",
  });

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 10000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backdropFilter: exiting ? "blur(0px)" : "blur(2px) saturate(1.2)",
      WebkitBackdropFilter: exiting ? "blur(0px)" : "blur(2px) saturate(1.2)",
      background: exiting ? "transparent" : "rgba(0, 0, 0, 0.15)",
      opacity: exiting ? 0 : 1,
      transition: "opacity 450ms ease, backdrop-filter 450ms ease, background 450ms ease",
    }}>
      {/* ── Card ── */}
      <div style={{
        position: "relative",
        width: 460,
        maxWidth: "calc(100vw - 48px)",
        opacity: 0,
        animation: mounted ? "onb-scale-in 700ms ease 150ms forwards" : "none",
      }}>
        <div style={{
          position: "relative",
          padding: "40px 36px 32px",
          background: "var(--pane-bg)",
          borderRadius: 24,
          backdropFilter: "blur(40px) saturate(1.4)",
          WebkitBackdropFilter: "blur(40px) saturate(1.4)",
          border: "1px solid var(--pane-border)",
          boxShadow: "var(--pane-shadow), 0 24px 64px rgba(0, 0, 0, 0.06)",
        }}>
          {/* Title */}
          <div style={stagger(0)}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px 5px 8px",
              borderRadius: 20,
              background: "var(--subtle-bg)",
              border: "1px solid var(--separator-color)",
              marginBottom: 18,
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--slider-thumb)",
              }} />
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--slider-thumb)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                Setup
              </span>
            </div>

            <h1 style={{
              fontSize: 28,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
            }}>
              Welcome to Raincast
            </h1>

            <p style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              marginTop: 10,
              marginBottom: 28,
            }}>
              Connect an AI provider to start building. You can change this anytime in settings.
            </p>
          </div>

          {/* Provider cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, ...stagger(1) }}>
            {PROVIDERS.map((p) => {
              const isSelected = selectedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(isSelected ? null : p.id);
                    setApiKey("");
                    setShowKey(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: isSelected
                      ? "1.5px solid var(--slider-thumb)"
                      : "1.5px solid var(--separator-color)",
                    background: isSelected ? "var(--subtle-bg)" : "transparent",
                    cursor: "pointer",
                    transition: "all 250ms ease",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "var(--subtle-bg)";
                      e.currentTarget.style.borderColor = "var(--input-border)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "var(--separator-color)";
                    }
                  }}
                >
                  {/* Provider icon */}
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: isSelected ? p.gradient : "var(--subtle-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 300ms ease",
                    boxShadow: isSelected
                      ? `0 4px 16px ${p.id === "google" ? "rgba(66,133,244,0.25)" : "rgba(204,120,92,0.25)"}`
                      : "none",
                  }}>
                    {isSelected ? (
                      <div style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }}>{p.icon}</div>
                    ) : (
                      <div style={{ opacity: 0.6 }}>{p.icon}</div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      transition: "color 200ms ease",
                    }}>
                      {p.name}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      marginTop: 2,
                    }}>
                      {p.desc}
                    </div>
                  </div>

                  {/* Selection indicator */}
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: isSelected ? "none" : "1.5px solid var(--separator-color)",
                    background: isSelected ? "var(--slider-thumb)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 250ms ease",
                  }}>
                    {isSelected && <Check size={13} strokeWidth={3} color="#fff" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* API key input */}
          {selected && (
            <div style={{
              marginTop: 20,
              opacity: 0,
              animation: "onb-fade-up 400ms ease forwards",
            }}>
              <label style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                display: "block",
                marginBottom: 8,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}>
                API Key
              </label>
              <div style={{ position: "relative" }}>
                <input
                  ref={inputRef}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Paste your ${selected.name} key`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canContinue) handleContinue();
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 42px 12px 16px",
                    fontSize: 14,
                    fontFamily: apiKey
                      ? "'SF Mono', 'Fira Code', 'Cascadia Code', monospace"
                      : "inherit",
                    borderRadius: 12,
                    border: "1.5px solid var(--input-border)",
                    background: "var(--input-bg)",
                    color: "var(--text-input)",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 200ms ease, box-shadow 200ms ease",
                    letterSpacing: apiKey ? "0.02em" : "normal",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--slider-thumb)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--orb-glow)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--input-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    padding: 2,
                    transition: "color 150ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
                >
                  {showKey ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                </button>
              </div>

              {/* Privacy note */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 10,
              }}>
                <Shield size={12} strokeWidth={1.8} style={{ color: "#34c759", flexShrink: 0, opacity: 0.7 }} />
                <span style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.4,
                }}>
                  Stored locally on this device. Never sent to Raincast servers.
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: selected ? 24 : 28,
            ...stagger(3),
          }}>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 4px",
                transition: "color 200ms ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              Skip for now
            </button>

            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue || saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 12,
                border: "none",
                background: canContinue && !saving
                  ? "var(--slider-thumb)"
                  : "var(--subtle-bg)",
                color: canContinue && !saving ? "#fff" : "var(--text-tertiary)",
                cursor: canContinue && !saving ? "pointer" : "default",
                transition: "all 300ms ease",
                boxShadow: canContinue && !saving
                  ? "0 4px 20px var(--orb-glow), 0 1px 4px rgba(0,0,0,0.08)"
                  : "none",
                letterSpacing: "0.01em",
              }}
              onMouseEnter={(e) => {
                if (canContinue && !saving) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.filter = "brightness(1.1)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.filter = "brightness(1)";
              }}
            >
              {saving ? (
                <>
                  <div style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "onb-spin 0.6s linear infinite",
                  }} />
                  Setting up...
                </>
              ) : (
                <>
                  Get Started
                  <ArrowRight size={15} strokeWidth={2.2} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
