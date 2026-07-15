#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import pc from 'picocolors';
import { runFind } from './commands/find.js';
import { runKillPid, runKillPort } from './commands/kill.js';
import { runList } from './commands/list.js';
import { runWatch } from './commands/watch.js';

function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('portmon')
  .description('Monitor listening ports and kill processes by port or PID')
  .version(getVersion())
  .showHelpAfterError()
  .configureOutput({
    outputError: (str, write) => write(pc.red(str)),
  });

// Default command when no subcommand is given (portmon / portmon --json)
program
  .command('list', { isDefault: true })
  .alias('ls')
  .description('List listening ports (default command)')
  .option('--udp', 'Include UDP sockets')
  .option('--json', 'Output as JSON')
  .action(async (opts: { udp?: boolean; json?: boolean }) => {
    await runList(opts);
  });

program
  .command('find')
  .alias('who')
  .description('Show which process is using a port (one or more)')
  .argument('<ports...>', 'Port number(s) (1–65535)')
  .option('--udp', 'Include UDP sockets')
  .option('--json', 'Output as JSON')
  .action(async (ports: string[], opts: { udp?: boolean; json?: boolean }) => {
    await runFind(ports, opts);
  });

program
  .command('kill')
  .description('Kill the process listening on a port')
  .argument('<port>', 'Port number (1–65535)')
  .option('-f, --force', 'Force kill (SIGKILL / taskkill /F)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--udp', 'Include UDP sockets when resolving the port')
  .action(
    async (
      port: string,
      opts: { force?: boolean; yes?: boolean; udp?: boolean },
    ) => {
      await runKillPort(port, opts);
    },
  );

program
  .command('kill-pid')
  .description('Kill a process by PID')
  .argument('<pid>', 'Process ID')
  .option('-f, --force', 'Force kill (SIGKILL / taskkill /F)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (pid: string, opts: { force?: boolean; yes?: boolean }) => {
    await runKillPid(pid, opts);
  });

program
  .command('watch')
  .alias('w')
  .description('Interactive live view — arrow keys to select, Enter to kill')
  .option('--udp', 'Include UDP sockets')
  .option(
    '-i, --interval <ms>',
    'Refresh interval in milliseconds',
    '2000',
  )
  .action(async (opts: { udp?: boolean; interval?: string }) => {
    const interval = Number(opts.interval);
    await runWatch({
      udp: opts.udp,
      interval: Number.isFinite(interval) ? interval : 2000,
    });
  });

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(message));
    process.exitCode = 1;
  }
}

main();
