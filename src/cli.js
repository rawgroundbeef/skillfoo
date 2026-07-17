import { sync } from './sync.js';

const VERSION = '0.0.1';

const HELP = `skillfoo — keep your agent skills in sync

Usage:
  skillfoo sync        Pull skills from the registry into this repo
  skillfoo --help      Show this help
  skillfoo --version   Show version
`;

export async function run(argv) {
  const cmd = argv[0];

  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION);
    return;
  }

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP);
    return;
  }

  if (cmd === 'sync') {
    try {
      await sync(process.cwd());
    } catch (err) {
      console.error(`skillfoo: ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  console.error(`skillfoo: unknown command "${cmd}"\n`);
  console.log(HELP);
  process.exitCode = 1;
}
