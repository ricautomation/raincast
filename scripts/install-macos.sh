#!/bin/bash
set -e

APP_NAME="Raincast"
REPO="https://github.com/tihiera/raincast.git"
BUILD_DIR="/tmp/raincast-build-$$"
INSTALL_DIR="/Applications"

echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║    $APP_NAME Installer for macOS    ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# ── Check Xcode Command Line Tools ──
if ! xcode-select -p &>/dev/null; then
  echo "→ Installing Xcode Command Line Tools..."
  xcode-select --install
  echo "  Please complete the Xcode tools installation and re-run this script."
  exit 1
fi
echo "✓ Xcode Command Line Tools"

# ── Check / Install Rust ──
if ! command -v cargo &>/dev/null; then
  echo "→ Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
echo "✓ Rust $(rustc --version | cut -d' ' -f2)"

# ── Check / Install Node.js ──
if ! command -v node &>/dev/null; then
  if command -v brew &>/dev/null; then
    echo "→ Installing Node.js via Homebrew..."
    brew install node
  else
    echo "✗ Node.js is required. Install it from https://nodejs.org (LTS) and re-run."
    exit 1
  fi
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "✗ Node.js 18+ required (found v$NODE_VERSION). Update: https://nodejs.org"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# ── Clone and build ──
echo ""
echo "→ Cloning $APP_NAME..."
rm -rf "$BUILD_DIR"
git clone --depth 1 "$REPO" "$BUILD_DIR"
cd "$BUILD_DIR"

echo "→ Installing dependencies..."
npm install

echo "→ Building local packages..."
cd packages/editkit && npm run build && cd ../..
cd packages/webtools && npm run build && cd ../..

echo "→ Building $APP_NAME (this may take a few minutes)..."
npm run tauri build 2>&1 | tail -5

# ── Find the built .app bundle ──
APP_BUNDLE=$(find src-tauri/target/release/bundle/macos -name "*.app" -maxdepth 1 | head -1)

if [ -z "$APP_BUNDLE" ]; then
  echo "✗ Build failed — no .app bundle found."
  rm -rf "$BUILD_DIR"
  exit 1
fi

# ── Install ──
echo "→ Installing to $INSTALL_DIR..."
rm -rf "$INSTALL_DIR/$APP_NAME.app"
cp -R "$APP_BUNDLE" "$INSTALL_DIR/"

# Remove quarantine so it opens without Gatekeeper blocking
xattr -cr "$INSTALL_DIR/$APP_NAME.app" 2>/dev/null || true

# ── Cleanup ──
rm -rf "$BUILD_DIR"

echo ""
echo "✓ $APP_NAME installed to $INSTALL_DIR/$APP_NAME.app"
echo "  Opening $APP_NAME..."
echo ""
open "$INSTALL_DIR/$APP_NAME.app"
