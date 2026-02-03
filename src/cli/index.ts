import { createCLI } from './core.js';
import { createOnboardCommand } from './commands/onboard.js';
import { createAgentCommand } from './commands/agent.js';

const program = createCLI();

program.addCommand(createOnboardCommand());
program.addCommand(createAgentCommand());

// Default command (show help if no command)
program.parse();
