import { sync } from './sync.js';

const VERSION = '0.0.1';

const HELP = `skillfoo — keep your agent skills in sync

Usage:
  skillfoo sync [--force]  Pull skills from the registry into this repo
  skillfoo --help          Show this help
  skillfoo --version       Show version
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
      await sync(io.cwd(), { force });
      return 0;
    } catch (error) {
      io.stderr(`skillfoo: ${errorMessage(error)}`);
      return 1;
    }
  }

  io.stderr(`skillfoo: unknown command "${cmd}"\n`);
  io.stdout(HELP);
  return 1;
}
