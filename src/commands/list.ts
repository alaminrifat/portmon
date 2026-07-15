import { listListeningPorts } from '../lib/ports.js';
import { printEntries } from '../lib/table.js';

export async function runList(options: { udp?: boolean; json?: boolean }): Promise<void> {
  const entries = await listListeningPorts({ udp: options.udp });
  printEntries(entries, Boolean(options.json));
}
