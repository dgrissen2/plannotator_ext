# Local Development Guide

This guide explains how to develop and test Plannotator locally from your fork.

## Prerequisites

- **Bun** runtime (install: `curl -fsSL https://bun.sh/install | bash`)
- **Git** for version control
- **Claude Code** for testing

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <your-fork-url>
cd plannotator_ext
bun install
```

### 2. Uninstall Official Version (if installed)

If you previously installed via `curl -fsSL https://plannotator.ai/install.sh | bash`:

```bash
# Remove binary
rm -f ~/.local/bin/plannotator

# Remove slash commands
rm -f ~/.claude/commands/plannotator-review.md
rm -f ~/.config/opencode/command/plannotator-review.md

# In Claude Code, remove the marketplace plugin:
# /plugin marketplace remove plannotator
```

### 3. Build and Install Locally

```bash
./scripts/install-local.sh
```

This will:
- Build the UI (`bun run build:hook`)
- Compile the `plannotator` binary
- Install it to `~/.local/bin/plannotator`
- Copy slash commands to `~/.claude/commands/`

### 4. Restart Claude Code

After installing, restart Claude Code to pick up the new commands.

### 5. Test Your Installation

```bash
# Test the binary directly
plannotator doc README.md

# In Claude Code (after restart)
/plannotator-doc README.md
/plannotator-review
```

---

## Available Commands

| Command | Description |
|---------|-------------|
| `/plannotator-review` | Review git diffs with annotations |
| `/plannotator-doc <path>` | Review any markdown file with annotations |

---

## How It Works

### Plan Review (Hook-based)

When Claude Code calls `ExitPlanMode`, the Plannotator hook intercepts it:

1. Opens browser with the plan UI
2. User annotates and approves/sends feedback
3. Decision returned to Claude Code

### Code Review

```
/plannotator-review → runs git diff → opens review UI → feedback to agent
```

### Document Review

```
/plannotator-doc README.md → reads file → opens annotation UI → feedback to agent
```

---

## Development Workflow

### Making UI Changes

```bash
# Start dev server with hot reload
bun run dev:hook

# Make changes in packages/ui/, packages/editor/
# Browser auto-reloads
```

### Rebuilding After Changes

```bash
# Rebuild UI and reinstall binary
bun run build:hook
./scripts/install-local.sh
```

### Testing with Claude Code

```bash
# Option 1: Use installed binary (after install-local.sh)
# Just restart Claude Code

# Option 2: Use plugin dir (for quick iteration without recompiling)
claude --plugin-dir ./apps/hook
```

---

## Project Structure

```
plannotator_ext/
├── apps/
│   ├── hook/                   # Claude Code plugin (main entry point)
│   │   ├── commands/           # Slash commands
│   │   ├── hooks/              # Hook configuration
│   │   └── server/index.ts     # CLI entry point
│   └── ...
├── packages/
│   ├── server/                 # Server implementation
│   ├── ui/                     # Shared React components
│   ├── editor/                 # Plan review app
│   └── review-editor/          # Code review app
└── scripts/
    ├── install.sh              # Official install (from GitHub releases)
    └── install-local.sh        # Local dev install (builds from source)
```

---

## Uninstalling

To remove the local installation:

```bash
rm -f ~/.local/bin/plannotator
rm -f ~/.claude/commands/plannotator-review.md
rm -f ~/.claude/commands/plannotator-doc.md
```

---

## Troubleshooting

### Binary not found

Ensure `~/.local/bin` is in your PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Changes not showing up

1. Rebuild: `bun run build:hook`
2. Reinstall: `./scripts/install-local.sh`
3. Restart Claude Code

### Slash commands not appearing

1. Check they exist: `ls ~/.claude/commands/`
2. Restart Claude Code
3. Try `/help` to refresh command list
