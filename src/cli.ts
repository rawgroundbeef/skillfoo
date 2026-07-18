import { parseArgs } from 'node:util';
import { planReconciliation } from './plan.js';
import { renderStatusHuman, renderStatusJson, statusExitCode } from './status.js';
import { sync } from './sync.js';

const VERSION = '0.0.1';

const HELP = `skillfoo — keep your agent skills in sync

Usage:
  skillfoo sync [--force]   Pull skills from the registry into this repo
  skillfoo status [--json]  Inspect whether ordinary sync is needed
  skillfoo --help           Show this help
  skillfoo --version        Show version
`;

const STATUS_HELP = `skillfoo status — inspect reconciliation without changing this repo

Usage:
  skillfoo status [--json]

Options:
  --json  Print the versioned automation result as JSON
  --help  Show this help

Outcomes and exit statuses:
  0  converged — no sync is needed
  1  usage or operational failure
  2  changes available — ordinary sync can safely apply them
  3  attention required — ordinary sync will preserve at least one conflict
`;

export interface CliIO {
  cwd(): string;
  stdout(message: string): void;
  stderr(message: string): void;
}

const processIO: CliIO = {
  cwd: () => process.cwd(),
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function run(argv: readonly string[], io: CliIO = processIO): Promise<number> {
  const cmd = argv[0];

  if (cmd === '--version' || cmd === '-v') {
    io.stdout(VERSION);
    return 0;
  }

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    io.stdout(HELP);
    return 0;
  }

  if (cmd === 'sync') {
    try {
      const force = argv.includes('--force') || argv.includes('-f');
      await sync(io.cwd(), { force, output: io.stdout, registryReporter: io.stdout });
      return 0;
    } catch (error) {
      io.stderr(`skillfoo: ${errorMessage(error)}`);
      return 1;
    }
  }

  if (cmd === 'status') {
    try {
      const parsed = parseArgs({
        args: argv.slice(1),
        allowPositionals: false,
        strict: true,
        options: {
          json: { type: 'boolean' },
          help: { type: 'boolean', short: 'h' },
        },
      });
      if (parsed.values.help === true) {
        io.stdout(STATUS_HELP);
        return 0;
      }

      const plan = planReconciliation(io.cwd(), { registryReporter: io.stderr });
      io.stdout(parsed.values.json === true ? renderStatusJson(plan) : renderStatusHuman(plan));
      return statusExitCode(plan);
    } catch (error) {
      io.stderr(`skillfoo: ${errorMessage(error)}`);
      return 1;
    }
  }

  io.stderr(`skillfoo: unknown command "${cmd}"\n`);
  io.stdout(HELP);
  return 1;
}
