# portmon

Cross-platform CLI to list listening ports, see which process owns them, and kill processes by port or PID.

Works on **Windows**, **macOS**, and **Linux**.

[![npm version](https://img.shields.io/npm/v/portmon.svg)](https://www.npmjs.com/package/portmon)
[![license](https://img.shields.io/npm/l/portmon.svg)](./LICENSE)

## Install

```bash
npm install -g portmon
```

Or run without installing:

```bash
npx portmon list
```

## Quick start

```bash
# List all listening TCP ports
portmon

# Who is using port 3000?
portmon find 3000

# Kill the process on that port
portmon kill 3000 -y

# Interactive live view
portmon watch
```

## Commands

### `list` (default)

List listening ports.

```bash
portmon
portmon list
portmon ls
portmon list --udp      # include UDP
portmon list --json     # JSON output
```

### `find` / `who`

Show which process is listening on a port.

```bash
portmon find 3000
portmon who 5173
portmon find 3000 --json
```

### `kill`

Kill the process listening on a port.

```bash
portmon kill 3000       # prompts for confirmation
portmon kill 3000 -y    # skip confirmation
portmon kill 3000 -f -y # force kill
```

### `kill-pid`

Kill a process by PID.

```bash
portmon kill-pid 12345
portmon kill-pid 12345 -f -y
```

### `watch` / `w`

Interactive live view of listening ports.

```bash
portmon watch
portmon watch -i 1000   # refresh every 1 second
portmon watch --udp
```

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection |
| `j` | Move down |
| `Enter` / `d` / `k` | Kill selected process |
| `f` / `K` | Force-kill selected process |
| `r` | Refresh now |
| `q` / `Ctrl+C` | Quit |

The list auto-refreshes (default every 2s). Selection stays on the same port and PID across refreshes when possible.

Requires an interactive terminal (TTY).

## Example output

```text
┌──────┬───────┬──────────┬──────────┬───────────┐
│ PORT │ PID   │ PROCESS  │ PROTOCOL │ ADDRESS   │
├──────┼───────┼──────────┼──────────┼───────────┤
│ 3000 │ 14204 │ node.exe │ TCP      │ 0.0.0.0   │
│ 5173 │ 9188  │ node.exe │ TCP      │ 127.0.0.1 │
└──────┴───────┴──────────┴──────────┴───────────┘

2 listening port(s)
```

## How it works

| OS | Discovery | Kill |
|----|-----------|------|
| Windows | `netstat -ano` + `tasklist` | `taskkill` |
| macOS | `lsof` | `SIGTERM` / `SIGKILL` |
| Linux | `lsof` (fallback: `ss`) | `SIGTERM` / `SIGKILL` |

No native addons — only Node.js and standard OS tools.

## Requirements

- Node.js 18 or later
- On macOS/Linux, `lsof` is recommended (`ss` is used as a Linux fallback)

## Permissions

Killing system services or processes owned by another user may require an elevated shell (Administrator on Windows, `sudo` on Unix). Clear errors are shown when a kill is denied.

## Development

```bash
git clone https://github.com/alaminrifat/portmon.git
cd portmon
npm install
npm run dev -- list
npm run build
node dist/cli.js list
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup details, guidelines, how to submit pull requests, and how maintainers release new versions to npm.

## License

[MIT](./LICENSE)
