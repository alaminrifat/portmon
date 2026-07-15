import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import pc from 'picocolors';
import { findByPort } from '../lib/ports.js';
import { killPid, resolveProcessName } from '../lib/process.js';
import { formatTable } from '../lib/table.js';

export async function runKillPort(
  portRaw: string,
  options: { force?: boolean; yes?: boolean; udp?: boolean },
): Promise<void> {
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(pc.red(`Invalid port: ${portRaw}. Expected an integer 1–65535.`));
    process.exitCode = 1;
    return;
  }

  const entries = await findByPort(port, { udp: options.udp });
  if (entries.length === 0) {
    console.error(pc.yellow(`No process is listening on port ${port}.`));
    process.exitCode = 1;
    return;
  }

  // Unique PIDs
  const byPid = new Map<number, (typeof entries)[0]>();
  for (const e of entries) {
    if (e.pid > 0 && !byPid.has(e.pid)) byPid.set(e.pid, e);
  }

  if (byPid.size === 0) {
    console.error(pc.red(`Found port ${port} but could not resolve a PID (permission?).`));
    process.exitCode = 1;
    return;
  }

  console.log(pc.bold(`Process(es) using port ${port}:`));
  console.log(formatTable(entries));

  if (!options.yes) {
    const ok = await confirm(
      `Kill ${byPid.size} process(es) on port ${port}${options.force ? ' (force)' : ''}? [y/N] `,
    );
    if (!ok) {
      console.log(pc.dim('Cancelled.'));
      return;
    }
  }

  let failed = 0;
  for (const [pid, entry] of byPid) {
    try {
      await killPid(pid, { force: options.force });
      console.log(
        pc.green(`✓ Killed PID ${pid}`) +
          (entry.process ? pc.dim(` (${entry.process})`) : ''),
      );
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`✗ ${message}`));
    }
  }

  if (failed > 0) process.exitCode = 1;
}

export async function runKillPid(
  pidRaw: string,
  options: { force?: boolean; yes?: boolean },
): Promise<void> {
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid <= 0) {
    console.error(pc.red(`Invalid PID: ${pidRaw}. Expected a positive integer.`));
    process.exitCode = 1;
    return;
  }

  const name = (await resolveProcessName(pid)) || 'unknown';

  if (!options.yes) {
    const ok = await confirm(
      `Kill PID ${pid} (${name})${options.force ? ' (force)' : ''}? [y/N] `,
    );
    if (!ok) {
      console.log(pc.dim('Cancelled.'));
      return;
    }
  }

  try {
    await killPid(pid, { force: options.force });
    console.log(pc.green(`✓ Killed PID ${pid}`) + pc.dim(` (${name})`));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`✗ ${message}`));
    process.exitCode = 1;
  }
}

async function confirm(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(
      pc.red('No TTY for confirmation. Re-run with -y to skip the prompt.'),
    );
    return false;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
