import { Command } from 'commander';
import { createProfile, deleteProfile, listProfiles, getCurrentProfile } from '../../config/profile.js';
import { register, type CLIContext } from '../registry.js';

function createProfileCommand(_ctx: CLIContext): Command {
  const root = new Command('profile').description('Manage state profiles (~/.xopcbot-<name>)');

  root
    .command('list')
    .description('List profiles')
    .action(() => {
      const cur = getCurrentProfile();
      for (const p of listProfiles()) {
        const mark = p.isActive || p.name === cur ? '*' : ' ';
        console.log(`${mark} ${p.name}\t${p.stateDir}\tagents:${p.agentCount}`);
      }
    });

  root
    .command('create <name>')
    .description('Create a new profile directory')
    .action((name: string) => {
      const p = createProfile(name);
      console.log(`Created profile "${p.name}" at ${p.stateDir}`);
    });

  root
    .command('delete <name>')
    .description('Delete a profile directory')
    .action((name: string) => {
      deleteProfile(name);
      console.log(`Deleted profile "${name}"`);
    });

  root
    .command('current')
    .description('Show active profile name')
    .action(() => {
      console.log(getCurrentProfile());
    });

  return root;
}

register({
  id: 'profile',
  name: 'profile',
  description: 'List and manage state profiles',
  factory: createProfileCommand,
  metadata: { category: 'setup' },
});
