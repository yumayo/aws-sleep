import { deployCloudFormation } from './commands/deploy-cloudformation';
import { pushEcr } from './commands/push-ecr';
import { generateRdsPasswordCommand } from './commands/generate-rds-password';
import { generateHashCommand } from './commands/generate-hash';
import { generateHexCommand } from './commands/generate-hex';
import { manageUsers } from './commands/manage-users';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'deploy-cloudformation':
    await deployCloudFormation(args.slice(1));
    break;
  case 'push-ecr':
    await pushEcr(args.slice(1));
    break;
  case 'generate-rds-password':
    await generateRdsPasswordCommand(args.slice(1));
    break;
  case 'generate-hash':
    await generateHashCommand(args.slice(1));
    break;
  case 'generate-hex':
    await generateHexCommand(args.slice(1));
    break;
  case 'manage-users':
    await manageUsers(args.slice(1));
    break;
  default:
    console.error('Usage: node main.js <command> [options]');
    console.error('Available commands:');
    console.error('  deploy-cloudformation <template-file>');
    console.error('  push-ecr');
    console.error('  generate-rds-password');
    console.error('  generate-hash [length]');
    console.error('  generate-hex [length]');
    console.error('  manage-users <add|remove|list> [options]');
    process.exit(1);
}
