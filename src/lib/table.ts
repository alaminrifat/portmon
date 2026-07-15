import Table from 'cli-table3';
import pc from 'picocolors';
import type { PortEntry } from '../types.js';

export function formatTable(entries: PortEntry[]): string {
  if (entries.length === 0) {
    return pc.dim('No listening ports found.');
  }

  const table = new Table({
    head: [
      pc.cyan('PORT'),
      pc.cyan('PID'),
      pc.cyan('PROCESS'),
      pc.cyan('PROTOCOL'),
      pc.cyan('ADDRESS'),
    ],
    style: {
      head: [],
      border: ['dim'],
    },
    chars: {
      mid: '',
      'left-mid': '',
      'mid-mid': '',
      'right-mid': '',
    },
  });

  for (const e of entries) {
    table.push([
      String(e.port),
      String(e.pid || '-'),
      e.process || pc.dim('unknown'),
      e.protocol.toUpperCase(),
      e.address,
    ]);
  }

  return table.toString();
}

export function formatJson(entries: PortEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export function printEntries(entries: PortEntry[], asJson: boolean): void {
  if (asJson) {
    console.log(formatJson(entries));
  } else {
    console.log(formatTable(entries));
    if (entries.length > 0) {
      console.log(pc.dim(`\n${entries.length} listening port(s)`));
    }
  }
}
