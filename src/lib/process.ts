import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isWindows } from './platform.js';

const execFileAsync = promisify(execFile);

/**
 * Resolve process name for a PID. Returns empty string if unknown.
 */
export async function resolveProcessName(pid: number): Promise<string> {
  if (!pid || pid <= 0) return '';

  try {
    if (isWindows()) {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      const line = stdout.trim().split(/\r?\n/)[0];
      if (!line || line.startsWith('INFO:')) return '';
      // CSV: "image name","pid","session name","session#","mem"
      const match = line.match(/^"([^"]+)"/);
      return match?.[1] ?? '';
    }

    // Unix: ps -p <pid> -o comm=
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'comm='], {
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim().split(/\r?\n/)[0]?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * Batch-resolve process names for many PIDs (more efficient on Windows).
 */
export async function resolveProcessNames(
  pids: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(pids.filter((p) => p > 0))];
  const map = new Map<number, string>();
  if (unique.length === 0) return map;

  if (isWindows()) {
    try {
      // tasklist for all processes once, then filter
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FO', 'CSV', '/NH'],
        { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      );
      const wanted = new Set(unique);
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        // "name","pid","session","#","mem"
        const match = line.match(/^"([^"]+)","(\d+)"/);
        if (!match) continue;
        const name = match[1];
        const pid = Number(match[2]);
        if (wanted.has(pid)) map.set(pid, name);
      }
    } catch {
      // fall through to per-pid
    }
    // fill missing
    await Promise.all(
      unique
        .filter((pid) => !map.has(pid))
        .map(async (pid) => {
          map.set(pid, await resolveProcessName(pid));
        }),
    );
    return map;
  }

  // Unix: resolve in parallel
  await Promise.all(
    unique.map(async (pid) => {
      map.set(pid, await resolveProcessName(pid));
    }),
  );
  return map;
}

export async function killPid(
  pid: number,
  options: { force?: boolean } = {},
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid PID: ${pid}`);
  }
  if (pid === process.pid) {
    throw new Error('Refusing to kill the current process (portmon itself)');
  }

  const force = options.force ?? false;

  if (isWindows()) {
    // On Windows, taskkill without /F often fails for console apps (e.g. node).
    // Honor --force immediately; otherwise try soft kill then fall back to /F.
    const tryKill = async (useForce: boolean) => {
      const args = ['/PID', String(pid)];
      if (useForce) args.push('/F');
      await execFileAsync('taskkill', args, {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
    };

    try {
      await tryKill(force);
    } catch (err) {
      if (!force) {
        try {
          await tryKill(true);
          return;
        } catch {
          // fall through to original error
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to kill PID ${pid}: ${message}`);
    }
    return;
  }

  // Unix signals
  const signal = force ? 'SIGKILL' : 'SIGTERM';
  try {
    process.kill(pid, signal);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === 'ESRCH') {
      throw new Error(`No process found with PID ${pid}`);
    }
    if (code === 'EPERM') {
      throw new Error(`Permission denied killing PID ${pid} (try elevated shell or -f)`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to kill PID ${pid}: ${message}`);
  }
}
