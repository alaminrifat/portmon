export type Protocol = 'tcp' | 'udp';

export interface PortEntry {
  port: number;
  pid: number;
  process: string;
  protocol: Protocol;
  address: string;
  state?: string;
}

export interface ListOptions {
  udp?: boolean;
  json?: boolean;
}

export interface KillOptions {
  force?: boolean;
  yes?: boolean;
}
