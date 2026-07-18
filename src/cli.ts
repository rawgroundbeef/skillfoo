import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
  initializeProject,
  InitReconciliationError,
  type InitSelection,
} from './init.js';
import { planReconciliation } from './plan.js';
import { isSafeSkillName } from './skill-name.js';
import { renderStatusHuman, renderStatusJson, statusExitCode } from './status.js';
import { sync } from './sync.js';

const VERSION = '0.0.1';

const HELP = `skillfoo — keep your agent skills in sync

Usage:
  skillfoo init <registry> [--skill <name> ... | --all] [--emit <path>]
                           Connect this repo and run its first safe sync
  skillfoo sync [--force]   Pull skills from the registry into this repo
  skillfoo status [--json]  Inspect whether ordinary sync is needed
  skillfoo --help           Show this help
  skillfoo --version        Show version
`;

const INIT_HELP = `skillfoo init — connect this repo to a skills registry

Usage:
  skillfoo init <registry> [--skill <name> ... | --all] [--emit <path>]

Arguments:
  <registry>      Local path or Git-backed registry source

Options:
  --skill <name>  Select a desired skill; repeat to select more than one
  --all           Desire every registry skill, including future additions
  --emit <path>   In-project skill destination (default: .agents/skills)
  --help          Show this help

Without --skill or --all, init prompts only when terminal input is available.

Outcomes and exit statuses:
  0  project initialized and converged
  1  usage or operational failure
  3  project initialized, but a preserved conflict requires attention
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
  isInputTTY?(): boolean;
  openLineReader?(): CliLineReader;
}

export interface CliLineReader {
  readLine(prompt: string): Promise<string | null>;
  close(): void;
}

export function createLineReader(
  input: NodeJS.ReadableStream,
  writePrompt: (prompt: string) => void,
): CliLineReader {
  const lines = createInterface({ input, terminal: false });
  const iterator = lines[Symbol.asyncIterator]();
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    lines.close();
  };
  lines.once('close', () => {
    closed = true;
  });
  lines.once('SIGINT', close);

  return {
    readLine: async (prompt) => {
      writePrompt(prompt);
      const result = await iterator.next();
      return result.done ? null : result.value;
    },
    close,
  };
}

const processIO: CliIO = {
  cwd: () => process.cwd(),
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
  isInputTTY: () => process.stdin.isTTY === true,
  openLineReader: () => createLineReader(process.stdin, (prompt) => process.stdout.write(prompt)),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function promptForSelection(
  available: readonly string[],
  io: CliIO,
): Promise<InitSelection> {
  if (io.openLineReader === undefined) {
    throw new Error('terminal input is unavailable; provide --skill <name> or --all');
  }
  const input = io.openLineReader();

  try {
    io.stdout(
      [
        'Available skills:',
        ...(available.length === 0 ? ['  (none)'] : available.map((name) => `  ${name}`)),
      ].join('\n'),
    );

    while (true) {
      const answer = await input.readLine('Select comma-separated skill names, or all: ');
      if (answer === null) {
        throw new Error('initialization cancelled; no files were written');
      }
      const value = answer.trim();
      if (value === 'all') return { kind: 'all' };

      const names = value.split(',').map((name) => name.trim());
      const invalid = names.filter(
        (name) => name.length === 0 || !isSafeSkillName(name) || !available.includes(name),
      );
      if (invalid.length === 0) return { kind: 'named', names };

      io.stderr(
        `Invalid selection: ${invalid.map((name) => JSON.stringify(name)).join(', ')}. ` +
          `Choose exact names from: ${available.join(', ') || '(none)'}, or enter all.`,
      );
    }
  } finally {
    input.close();
  }
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

  if (cmd === 'init') {
    try {
      const parsed = parseArgs({
        args: argv.slice(1),
        allowPositionals: true,
        strict: true,
        options: {
          skill: { type: 'string', multiple: true },
          all: { type: 'boolean' },
          emit: { type: 'string' },
          help: { type: 'boolean', short: 'h' },
        },
      });
      if (parsed.values.help === true) {
        io.stdout(INIT_HELP);
        return 0;
      }
      if (parsed.positionals.length !== 1) {
        throw new Error('init requires exactly one <registry> positional argument');
      }

      const named = parsed.values.skill;
      if (parsed.values.all === true && named !== undefined) {
        throw new Error('--all and --skill cannot be used together');
      }

      let selection: InitSelection | ((available: readonly string[]) => Promise<InitSelection>);
      if (parsed.values.all === true) {
        selection = { kind: 'all' };
      } else if (named !== undefined) {
        selection = { kind: 'named', names: named };
      } else {
        if (io.isInputTTY?.() !== true) {
          throw new Error('non-interactive init requires --skill <name> or --all');
        }
        selection = (available) => promptForSelection(available, io);
      }

      const registry = parsed.positionals[0];
      if (registry === undefined) {
        throw new Error('init requires exactly one <registry> positional argument');
      }
      const result = await initializeProject(
        io.cwd(),
        {
          registry,
          selection,
          ...(parsed.values.emit === undefined ? {} : { emit: parsed.values.emit }),
        },
        { output: io.stdout, reporter: io.stdout },
      );

      if (result.reconciliation.outcome === 'attention_required') {
        io.stdout(
          '\nProject initialized: created .skillfoo.yml, but first reconciliation needs attention.\n' +
            'Run skillfoo status, resolve the preserved conflicts, then run skillfoo sync.',
        );
        return 3;
      }

      io.stdout('\nProject initialized: created .skillfoo.yml and first reconciliation converged.');
      return 0;
    } catch (error) {
      io.stderr(`skillfoo: ${errorMessage(error)}`);
      if (error instanceof InitReconciliationError) {
        io.stderr('The configuration was kept. Run skillfoo status, then skillfoo sync to recover.');
      }
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
