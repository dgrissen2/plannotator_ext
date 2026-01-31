#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local}/bin"

# Find bun - check common locations if not in PATH
if ! command -v bun &> /dev/null; then
    # Try common bun install locations
    if [ -x "$HOME/.bun/bin/bun" ]; then
        export PATH="$HOME/.bun/bin:$PATH"
    elif [ -x "/opt/homebrew/bin/bun" ]; then
        export PATH="/opt/homebrew/bin:$PATH"
    elif [ -x "/usr/local/bin/bun" ]; then
        export PATH="/usr/local/bin:$PATH"
    else
        echo "Error: bun not found. Install it with:"
        echo "  curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
fi

echo "Using bun at: $(which bun)"

# Ensure node_modules/.bin is in PATH for nested script calls
export PATH="$REPO_DIR/node_modules/.bin:$PATH"

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

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi

# Build the UI (review must be built before hook, since hook copies review's output)
echo "Building review UI..."
bun run build:review

echo "Building hook UI..."
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
