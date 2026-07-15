import pc from 'picocolors';
import { findByPort } from '../lib/ports.js';
import { printEntries } from '../lib/table.js';

export async function runFind(
  portRaw: string,
  options: { udp?: boolean; json?: boolean },
): Promise<void> {
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(pc.red(`Invalid port: ${portRaw}. Expected an integer 1–65535.`));
    process.exitCode = 1;
    return;
  }

  const entries = await findByPort(port, { udp: options.udp });

  if (entries.length === 0) {
    if (options.json) {
      console.log('[]');
    } else {
      console.log(pc.yellow(`No process is listening on port ${port}.`));
    }
    process.exitCode = 1;
    return;
  }

  printEntries(entries, Boolean(options.json));
}
