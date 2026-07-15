import pc from 'picocolors';
import type { PortEntry } from '../types.js';
import { listListeningPorts } from '../lib/ports.js';
import { killPid } from '../lib/process.js';

export interface WatchOptions {
  udp?: boolean;
  /** Refresh interval in ms (default 2000) */
  interval?: number;
}

const COL = {
  port: 6,
  pid: 8,
  process: 28,
  protocol: 8,
  address: 18,
} as const;

/**
 * Interactive live view: ↑/↓ select, Enter/k kill, q quit.
 */
export async function runWatch(options: WatchOptions = {}): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      pc.red(
        'portmon watch needs an interactive terminal (TTY). Use `portmon list` instead.',
      ),
    );
    process.exitCode = 1;
    return;
  }

  const intervalMs = Math.max(500, options.interval ?? 2000);
  let entries: PortEntry[] = [];
  let selected = 0;
  let scroll = 0;
  let status = pc.dim('Loading…');
  let running = true;
  let refreshing = false;
  let killing = false;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let escapeBuf = '';
  let escapeTimer: ReturnType<typeof setTimeout> | null = null;

  const stdin = process.stdin;
  const stdout = process.stdout;

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  hideCursor();

  const cleanup = () => {
    running = false;
    if (refreshTimer) clearInterval(refreshTimer);
    if (escapeTimer) clearTimeout(escapeTimer);
    stdin.setRawMode(false);
    stdin.removeListener('data', onData);
    showCursor();
    stdout.write('\x1b[?25h\x1b[2J\x1b[H');
  };

  const onData = (chunk: string) => {
    for (const ch of chunk) {
      // Assemble CSI / SS3 escape sequences (arrows may arrive split on Windows)
      if (escapeBuf || ch === '\u001b') {
        escapeBuf += ch;
        if (escapeTimer) clearTimeout(escapeTimer);

        if (isCompleteEscape(escapeBuf)) {
          const seq = escapeBuf;
          escapeBuf = '';
          void handleKey(seq);
        } else {
          escapeTimer = setTimeout(() => {
            // Lone ESC → quit
            const seq = escapeBuf;
            escapeBuf = '';
            void handleKey(seq);
          }, 30);
        }
        continue;
      }
      void handleKey(ch);
    }
  };

  stdin.on('data', onData);

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  async function refresh(silent = false): Promise<void> {
    if (refreshing || killing || !running) return;
    refreshing = true;
    try {
      const next = await listListeningPorts({ udp: options.udp });
      const prevKey = entries[selected] ? entryKey(entries[selected]) : null;

      entries = next;

      if (prevKey) {
        const idx = entries.findIndex((e) => entryKey(e) === prevKey);
        selected =
          idx >= 0 ? idx : Math.min(selected, Math.max(0, entries.length - 1));
      } else {
        selected = Math.min(selected, Math.max(0, entries.length - 1));
      }

      ensureSelectionVisible();
      if (!silent) {
        status = pc.dim(`Refreshed ${new Date().toLocaleTimeString()}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      status = pc.red(`Refresh failed: ${message}`);
    } finally {
      refreshing = false;
      if (running) render();
    }
  }

  async function killSelected(force: boolean): Promise<void> {
    const entry = entries[selected];
    if (!entry) {
      status = pc.yellow('Nothing selected.');
      render();
      return;
    }
    if (!entry.pid || entry.pid <= 0) {
      status = pc.red('No PID for this entry.');
      render();
      return;
    }
    if (killing) return;

    killing = true;
    status = pc.yellow(
      `Killing PID ${entry.pid} (${entry.process || 'unknown'}) on port ${entry.port}…`,
    );
    render();

    try {
      await killPid(entry.pid, { force });
      status = pc.green(
        `✓ Killed PID ${entry.pid} · port ${entry.port}${force ? ' (force)' : ''}`,
      );
      await refresh(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      status = pc.red(`✗ ${message}`);
      render();
    } finally {
      killing = false;
    }
  }

  async function handleKey(key: string): Promise<void> {
    if (!running) return;

    // Ctrl+C or Escape
    if (key === '\u0003' || key === '\u001b') {
      cleanup();
      process.exit(0);
      return;
    }

    if (key === 'q' || key === 'Q') {
      cleanup();
      process.exit(0);
      return;
    }

    // Arrow up
    if (key === '\u001b[A' || key === '\u001bOA') {
      if (entries.length === 0) return;
      selected = (selected - 1 + entries.length) % entries.length;
      ensureSelectionVisible();
      render();
      return;
    }

    // Arrow down
    if (key === '\u001b[B' || key === '\u001bOB') {
      if (entries.length === 0) return;
      selected = (selected + 1) % entries.length;
      ensureSelectionVisible();
      render();
      return;
    }

    // Page up / Page down
    if (key === '\u001b[5~') {
      selected = Math.max(0, selected - visibleRows());
      ensureSelectionVisible();
      render();
      return;
    }
    if (key === '\u001b[6~') {
      selected = Math.min(Math.max(0, entries.length - 1), selected + visibleRows());
      ensureSelectionVisible();
      render();
      return;
    }

    // Home / End
    if (key === '\u001b[H' || key === '\u001b[1~') {
      selected = 0;
      ensureSelectionVisible();
      render();
      return;
    }
    if (key === '\u001b[F' || key === '\u001b[4~') {
      selected = Math.max(0, entries.length - 1);
      ensureSelectionVisible();
      render();
      return;
    }

    // Kill: Enter or d
    if (key === '\r' || key === 'd' || key === 'D') {
      await killSelected(false);
      return;
    }

    // Force kill
    if (key === 'f' || key === 'F' || key === 'x' || key === 'X') {
      await killSelected(true);
      return;
    }

    // k = kill, K = force kill
    if (key === 'k') {
      await killSelected(false);
      return;
    }
    if (key === 'K') {
      await killSelected(true);
      return;
    }

    // j = down (vim-style)
    if (key === 'j') {
      if (entries.length === 0) return;
      selected = (selected + 1) % entries.length;
      ensureSelectionVisible();
      render();
      return;
    }

    // Refresh
    if (key === 'r' || key === 'R') {
      await refresh(false);
      return;
    }
  }

  function visibleRows(): number {
    const rows = stdout.rows || 24;
    return Math.max(5, rows - 9);
  }

  function ensureSelectionVisible(): void {
    const vis = visibleRows();
    if (selected < scroll) scroll = selected;
    if (selected >= scroll + vis) scroll = selected - vis + 1;
    if (scroll < 0) scroll = 0;
  }

  function render(): void {
    if (!running) return;

    const lines: string[] = [];
    const width = stdout.columns || 80;
    const vis = visibleRows();

    lines.push('\x1b[H\x1b[J');
    lines.push(pc.bold(pc.cyan(' portmon watch ')) + pc.dim('· live port monitor'));
    lines.push(
      pc.dim(
        ` ${entries.length} listening · refresh ${intervalMs / 1000}s · ${new Date().toLocaleTimeString()}`,
      ),
    );
    lines.push('');

    const header =
      pad('PORT', COL.port) +
      pad('PID', COL.pid) +
      pad('PROCESS', COL.process) +
      pad('PROTO', COL.protocol) +
      pad('ADDRESS', COL.address);
    lines.push(pc.bold(pc.cyan(header)));
    lines.push(pc.dim('─'.repeat(Math.min(width - 1, header.length))));

    if (entries.length === 0) {
      lines.push(pc.dim('  No listening ports found.'));
    } else {
      const slice = entries.slice(scroll, scroll + vis);
      slice.forEach((e, i) => {
        const idx = scroll + i;
        const row =
          pad(String(e.port), COL.port) +
          pad(String(e.pid || '-'), COL.pid) +
          pad(truncate(e.process || 'unknown', COL.process - 1), COL.process) +
          pad(e.protocol.toUpperCase(), COL.protocol) +
          pad(truncate(e.address, COL.address - 1), COL.address);

        if (idx === selected) {
          lines.push(pc.bgCyan(pc.black(`▸ ${row}`)));
        } else {
          lines.push(`  ${row}`);
        }
      });

      if (scroll > 0 || scroll + vis < entries.length) {
        lines.push(
          pc.dim(
            `  … showing ${scroll + 1}–${Math.min(scroll + vis, entries.length)} of ${entries.length}`,
          ),
        );
      }
    }

    lines.push('');
    lines.push(status);
    lines.push(
      pc.dim(
        ' ↑/↓ move  ·  Enter/d/k kill  ·  f force-kill  ·  r refresh  ·  q quit',
      ),
    );
    stdout.write(lines.join('\n'));
  }

  await refresh(true);
  status = pc.dim('Ready — select a row and press Enter to kill');
  render();

  refreshTimer = setInterval(() => {
    void refresh(true);
  }, intervalMs);

  // Keep process alive until quit (exit via cleanup)
  await new Promise<void>(() => {});
}

function isCompleteEscape(seq: string): boolean {
  // ESC alone not complete yet (wait for timeout)
  if (seq === '\u001b') return false;
  // SS3: ESC O A/B/C/D
  if (seq.startsWith('\u001bO') && seq.length >= 3) return true;
  // CSI: ESC [ ... letter or ~
  if (seq.startsWith('\u001b[')) {
    if (seq.length < 3) return false;
    const last = seq[seq.length - 1];
    return /[A-Za-z~]/.test(last);
  }
  // Unknown escape: treat as complete after 2+ chars
  return seq.length >= 2 && !seq.startsWith('\u001b[');
}

function entryKey(e: PortEntry): string {
  return `${e.port}:${e.pid}:${e.protocol}:${e.address}`;
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 1) return s.slice(0, n);
  return s.slice(0, n - 1) + '…';
}

function hideCursor(): void {
  process.stdout.write('\x1b[?25l');
}

function showCursor(): void {
  process.stdout.write('\x1b[?25h');
}
