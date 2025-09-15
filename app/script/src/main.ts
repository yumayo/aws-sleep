import { deployCloudFormation } from './commands/deploy-cloudformation';
import { pushEcr } from './commands/push-ecr';
import { generateRdsPasswordCommand } from './commands/generate-rds-password';
import { manageUsers } from './commands/manage-users';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'deploy-cloudformation':
    await deployCloudFormation(args.slice(1));
    break;
  case 'push-ecr':
    await pushEcr();
    break;
  case 'generate-rds-password':
    await generateRdsPasswordCommand();
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
    console.error('  manage-users <add|remove|list> [options]');
    process.exit(1);
}
