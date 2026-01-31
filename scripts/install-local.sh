#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local}/bin"

# Detect platform
case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      echo "Unsupported OS" >&2; exit 1 ;;
esac

case "$(uname -m)" in
    x86_64|amd64)   arch="x64" ;;
    arm64|aarch64)  arch="arm64" ;;
    *)              echo "Unsupported architecture" >&2; exit 1 ;;
esac

platform="bun-${os}-${arch}"

echo "Building plannotator from source..."
cd "$REPO_DIR"

# Build the UI first
echo "Building UI..."
bun run build:hook

# Ensure install directory exists
mkdir -p "$INSTALL_DIR"

# Compile binary
echo "Compiling binary for $platform..."
bun build apps/hook/server/index.ts --compile --target="$platform" --outfile "$INSTALL_DIR/plannotator"

echo "Installed binary to $INSTALL_DIR/plannotator"

# Install Claude Code slash commands
CLAUDE_COMMANDS_DIR="$HOME/.claude/commands"
mkdir -p "$CLAUDE_COMMANDS_DIR"
cp "$REPO_DIR/apps/hook/commands/plannotator-review.md" "$CLAUDE_COMMANDS_DIR/"
cp "$REPO_DIR/apps/hook/commands/plannotator-doc.md" "$CLAUDE_COMMANDS_DIR/"
echo "Installed slash commands to $CLAUDE_COMMANDS_DIR"

# Check PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo ""
    echo "WARNING: $INSTALL_DIR is not in your PATH. Add it with:"
    echo ""
    case "$SHELL" in
        */zsh)  shell_config="~/.zshrc" ;;
        */bash) shell_config="~/.bashrc" ;;
        *)      shell_config="your shell config" ;;
    esac
    echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ${shell_config}"
    echo "  source ${shell_config}"
fi

echo ""
echo "========================================"
echo "  LOCAL DEV INSTALL COMPLETE"
echo "========================================"
echo ""
echo "Available commands:"
echo "  plannotator doc <file.md>  - Review any markdown file"
echo "  /plannotator-review        - Review git diffs (in Claude Code)"
echo "  /plannotator-doc <path>    - Review markdown (in Claude Code)"
echo ""
echo "See: $REPO_DIR/docs/LOCAL_DEVELOPMENT.md"
echo ""
