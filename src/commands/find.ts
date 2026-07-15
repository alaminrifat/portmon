import pc from 'picocolors';
import type { PortEntry } from '../types.js';
import { findByPort } from '../lib/ports.js';
import { printEntries } from '../lib/table.js';

export async function runFind(
  portsRaw: string[],
  options: { udp?: boolean; json?: boolean },
): Promise<void> {
  const ports: number[] = [];
  for (const raw of portsRaw) {
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(pc.red(`Invalid port: ${raw}. Expected an integer 1–65535.`));
      process.exitCode = 1;
      return;
    }
    ports.push(port);
  }

  const all: PortEntry[] = [];
  const missing: number[] = [];

  for (const port of ports) {
    const entries = await findByPort(port, { udp: options.udp });
    if (entries.length === 0) missing.push(port);
    else all.push(...entries);
  }

  if (all.length === 0) {
    if (options.json) {
      console.log('[]');
    } else if (ports.length === 1) {
      console.log(pc.yellow(`No process is listening on port ${ports[0]}.`));
    } else {
      console.log(
        pc.yellow(`No process is listening on ports ${ports.join(', ')}.`),
      );
    }
    process.exitCode = 1;
    return;
  }

  printEntries(all, Boolean(options.json));

  if (missing.length > 0 && !options.json) {
    console.log(
      pc.yellow(
        `\nNo process on port${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      ),
    );
    process.exitCode = 1;
  }
}
