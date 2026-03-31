import type { LayoutTemplate } from "./index";
import { SHARED_LAYOUT_RULES } from "./styles";

export const utility: LayoutTemplate = {
  id: "utility",
  name: "Utility",
  description: "Compact single-purpose tool — calculator, converter, timer, picker",
  keywords: [
    "calculator", "converter", "unit converter", "timer", "stopwatch",
    "clock", "alarm", "color picker", "picker", "generator", "password generator",
    "qr code", "barcode", "weather widget", "widget", "clipboard",
    "pomodoro", "counter", "dice", "random",
    "cpu monitor", "memory monitor", "system monitor", "process monitor",
    "gpu monitor", "gpu usage", "disk usage", "disk space",
    "loc counter", "line counter", "lines of code",
    "vpn", "port scanner", "dns lookup", "network tool",
    "leaderboard", "usage monitor", "small app", "mini app", "utility",
  ],
  appShell: `\
import { useDrag } from "./hooks/useDrag";

export default function App() {
  const onDrag = useDrag();

  return (
    <div className="h-screen w-screen bg-transparent p-[1px]">
      <div
        className="h-full w-full flex flex-col relative overflow-hidden backdrop-blur-2xl selection:bg-[var(--accent)] selection:text-white rounded-[10px] glass-stable"
        style={{
          background: "var(--surface-window)",
          boxShadow: "inset 0 0 0 1px var(--border-secondary)",
        }}
        onMouseDown={onDrag}
      >
        <div className="traffic-light-pad shrink-0 w-full" />

        <div className="flex-1 w-full px-5 pb-6 overflow-hidden" data-no-drag>
          {/* Tool UI goes here */}
        </div>
      </div>
    </div>
  );
}
`,
  components: [],
  cssAdditions: `\
/* ── Utility glass effect — translucent but stable across window focus ── */
:root {
  --surface-window: rgba(235, 235, 235, 0.82);
  --surface-primary: rgba(246, 246, 246, 0.78);
  --surface-secondary: rgba(255, 255, 255, 0.72);
  --surface-inset: rgba(0, 0, 0, 0.05);
  --surface-raised: rgba(255, 255, 255, 0.68);
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface-window: rgba(20, 20, 20, 0.82);
    --surface-primary: rgba(20, 20, 20, 0.78);
    --surface-secondary: rgba(28, 28, 28, 0.72);
    --surface-inset: rgba(255, 255, 255, 0.05);
    --surface-raised: rgba(30, 30, 30, 0.68);
  }
}
body { background: transparent; }
/* Prevent backdrop-filter recomposition flicker on child re-renders */
.glass-stable { will-change: transform; contain: paint; }
`,
  promptContext: `This is a UTILITY / SINGLE-PURPOSE TOOL layout with a frosted glass effect. NO title bar — traffic lights float over the content. The app has:
- An outer wrapper: h-screen w-screen bg-transparent p-[1px]
- A full-bleed rounded card (rounded-[10px]) with backdrop-blur-2xl, semi-transparent var(--surface-window) background, glass-stable class (prevents flicker on re-renders), and inset 1px border via boxShadow. This card has onMouseDown={onDrag} using useDrag() hook so the entire window is draggable.
- A traffic-light-pad spacer at top (32px clearance for macOS traffic lights)
- A content area (flex-1, px-5 pb-6, overflow-hidden) for the tool UI. All interactive elements inside MUST have data-no-drag attribute.

The scaffold has NO header, title, or icon. You decide whether the tool needs a title row, icon badge, or neither — based on what makes sense for the specific tool.

UTILITY PATTERNS:
- Icon badges (if used): p-1.5 rounded-lg, var(--accent) background, white icon, size 15, strokeWidth 2.5, shadow-sm
- Segmented controls: flex row in a var(--surface-inset) container (borderRadius: 8, p-1, gap-1), active button gets var(--accent) bg + #fff text + subtle shadow, inactive gets transparent bg + secondary text (borderRadius: 6)
- Cards/containers: borderRadius: 10, inset border via boxShadow "inset 0 0 0 0.5px var(--border-secondary)", var(--surface-raised) background
- Input fields: type="text" with inputMode="decimal" (never type="number")
- Result display: var(--accent-bg) background, var(--accent) text, borderRadius: 8
- Charts: use recharts if needed — bars with var(--accent), rounded corners [0,4,4,0], tooltips with surface-raised bg

You MUST generate:
- src/App.tsx — fill in the content area with the tool UI
- src/components/*.tsx — sub-components if needed

Do NOT add a sidebar or navigation. The entire app is one focused screen.
Keep the UI compact and self-contained. Everything visible at once — no scrolling needed.`,
  layoutRules: SHARED_LAYOUT_RULES,
};
