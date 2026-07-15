import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PortEntry, Protocol } from '../types.js';
import { getPlatform } from './platform.js';
import { resolveProcessNames } from './process.js';

const execFileAsync = promisify(execFile);

export interface ListPortsOptions {
  /** Include UDP listeners when supported */
  udp?: boolean;
}

/**
 * List listening ports on the current machine.
 */
export async function listListeningPorts(
  options: ListPortsOptions = {},
): Promise<PortEntry[]> {
  const platform = getPlatform();
  let entries: PortEntry[];

  switch (platform) {
    case 'win32':
      entries = await listWindows(options.udp ?? false);
      break;
    case 'darwin':
    case 'linux':
      entries = await listUnix(options.udp ?? false);
      break;
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. portmon supports Windows, macOS, and Linux.`,
      );
  }

  // Enrich with process names when missing
  const missing = entries.filter((e) => !e.process && e.pid > 0);
  if (missing.length > 0) {
    const names = await resolveProcessNames(missing.map((e) => e.pid));
    for (const e of entries) {
      if (!e.process && e.pid > 0) {
        e.process = names.get(e.pid) ?? '';
      }
    }
  }

  // Sort by port, then pid
  entries.sort((a, b) => a.port - b.port || a.pid - b.pid);

  // Dedupe identical port+pid+protocol+address
  return dedupe(entries);
}

export async function findByPort(port: number, options: ListPortsOptions = {}): Promise<PortEntry[]> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}. Expected 1–65535.`);
  }
  const all = await listListeningPorts(options);
  return all.filter((e) => e.port === port);
}

function dedupe(entries: PortEntry[]): PortEntry[] {
  const seen = new Set<string>();
  const out: PortEntry[] = [];
  for (const e of entries) {
    const key = `${e.protocol}|${e.address}|${e.port}|${e.pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Windows: netstat -ano
// ---------------------------------------------------------------------------

async function listWindows(includeUdp: boolean): Promise<PortEntry[]> {
  const args = ['-ano'];
  // -a all, -n numeric, -o PID; we filter LISTENING / UDP ourselves
  const { stdout } = await execFileAsync('netstat', args, {
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });

  const entries: PortEntry[] = [];
  const lines = stdout.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234
    // TCP    [::]:3000       [::]:0       LISTENING    1234
    // UDP    0.0.0.0:53      *:*                       1234
    const tcp = trimmed.match(
      /^(TCP)\s+(\S+):(\d+)\s+\S+\s+(LISTENING)\s+(\d+)$/i,
    );
    if (tcp) {
      entries.push({
        protocol: 'tcp',
        address: normalizeAddress(tcp[2]),
        port: Number(tcp[3]),
        state: 'LISTENING',
        pid: Number(tcp[5]),
        process: '',
      });
      continue;
    }

    if (includeUdp) {
      const udp = trimmed.match(/^(UDP)\s+(\S+):(\d+)\s+\S+\s+(\d+)$/i);
      if (udp) {
        entries.push({
          protocol: 'udp',
          address: normalizeAddress(udp[2]),
          port: Number(udp[3]),
          state: undefined,
          pid: Number(udp[4]),
          process: '',
        });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Unix: lsof (preferred) / ss fallback on Linux
// ---------------------------------------------------------------------------

async function listUnix(includeUdp: boolean): Promise<PortEntry[]> {
  try {
    return await listWithLsof(includeUdp);
  } catch {
    if (getPlatform() === 'linux') {
      return listWithSs(includeUdp);
    }
    throw new Error(
      'Could not list ports. Ensure `lsof` is installed and available in PATH.',
    );
  }
}

async function listWithLsof(includeUdp: boolean): Promise<PortEntry[]> {
  // -iTCP -sTCP:LISTEN -n -P : listening TCP, no host/port resolution
  // -iUDP : UDP (not always "listen" in same sense)
  const args = ['-n', '-P', '-iTCP', '-sTCP:LISTEN'];
  if (includeUdp) {
    args.push('-iUDP');
  }

  const { stdout } = await execFileAsync('lsof', args, {
    maxBuffer: 20 * 1024 * 1024,
  });

  return parseLsof(stdout, includeUdp);
}

function parseLsof(stdout: string, includeUdp: boolean): PortEntry[] {
  const entries: PortEntry[] = [];
  const lines = stdout.split(/\r?\n/).slice(1); // skip header

  for (const line of lines) {
    if (!line.trim()) continue;
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    // node    123 user 20u IPv4 ... 0t0 TCP *:3000 (LISTEN)
    // node    123 user 21u IPv4 ... 0t0 TCP 127.0.0.1:5173 (LISTEN)
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;

    const processName = parts[0];
    const pid = Number(parts[1]);
    // NAME is last field(s); protocol often in column before NAME or inside NAME
    const nameField = parts.slice(8).join(' ');
    // e.g. TCP *:3000 (LISTEN)  or  TCP 127.0.0.1:5173 (LISTEN)  or  UDP *:53
    const m = nameField.match(/^(TCP|UDP)\s+(\S+?)(?::(\d+))?(?:\s+\((\w+)\))?$/i);
    if (!m) {
      // alternate: *:3000 (LISTEN) with type earlier
      const alt = nameField.match(/^(\S+):(\d+)(?:\s+\((\w+)\))?$/);
      if (!alt) continue;
      // try to infer protocol from earlier column (parts[7] often NODE = TCP/UDP)
      const protoRaw = (parts[7] ?? '').toLowerCase();
      const protocol: Protocol =
        protoRaw === 'udp' ? 'udp' : 'tcp';
      if (protocol === 'udp' && !includeUdp) continue;
      entries.push({
        protocol,
        address: normalizeAddress(alt[1]),
        port: Number(alt[2]),
        state: alt[3]?.toUpperCase(),
        pid,
        process: processName,
      });
      continue;
    }

    const protocol = m[1].toLowerCase() as Protocol;
    if (protocol === 'udp' && !includeUdp) continue;

    let address = m[2];
    let port = m[3] ? Number(m[3]) : NaN;

    // NAME like *:3000 or [::1]:3000
    if (Number.isNaN(port)) {
      const ap = address.match(/^(.*):(\d+)$/);
      if (ap) {
        address = ap[1];
        port = Number(ap[2]);
      }
    }

    if (!Number.isInteger(port)) continue;

    entries.push({
      protocol,
      address: normalizeAddress(address),
      port,
      state: m[4]?.toUpperCase(),
      pid,
      process: processName,
    });
  }

  return entries;
}

async function listWithSs(includeUdp: boolean): Promise<PortEntry[]> {
  // ss -lntp  (listening TCP with process)
  // ss -lnup  for UDP
  const entries: PortEntry[] = [];

  const parseSs = (stdout: string, protocol: Protocol) => {
    for (const line of stdout.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      // State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
      // LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;

      const local = parts[3] ?? parts[4]; // sometimes state missing for UDP
      // Find address:port — last colon separates port (IPv6 has many colons)
      const portMatch = local.match(/:(\d+)$/);
      if (!portMatch) continue;
      const port = Number(portMatch[1]);
      const address = normalizeAddress(local.slice(0, local.length - portMatch[0].length));

      let pid = 0;
      let processName = '';
      const procMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
      if (procMatch) {
        processName = procMatch[1];
        pid = Number(procMatch[2]);
      }

      entries.push({
        protocol,
        address,
        port,
        state: protocol === 'tcp' ? 'LISTEN' : undefined,
        pid,
        process: processName,
      });
    }
  };

  const { stdout: tcpOut } = await execFileAsync('ss', ['-lntp'], {
    maxBuffer: 20 * 1024 * 1024,
  });
  parseSs(tcpOut, 'tcp');

  if (includeUdp) {
    try {
      const { stdout: udpOut } = await execFileAsync('ss', ['-lnup'], {
        maxBuffer: 20 * 1024 * 1024,
      });
      parseSs(udpOut, 'udp');
    } catch {
      // ignore UDP failures
    }
  }

  return entries;
}

function normalizeAddress(raw: string): string {
  let a = raw.trim();
  // Strip surrounding brackets for IPv6 [::1] -> ::1
  if (a.startsWith('[') && a.endsWith(']')) {
    a = a.slice(1, -1);
  }
  // Windows sometimes uses * for any
  if (a === '*') return '0.0.0.0';
  return a;
}
