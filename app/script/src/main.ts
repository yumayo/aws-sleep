import { deployCloudFormation } from './deploy-cloudformation';
import { pushEcr } from './push-ecr';

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'deploy-cloudformation':
    await deployCloudFormation(args.slice(1));
    break;
  case 'push-ecr':
    await pushEcr();
    break;
  default:
    console.error('Usage: node main.js <command> [options]');
    console.error('Available commands:');
    console.error('  deploy-cloudformation <template-file>');
    console.error('  push-ecr');
    process.exit(1);
}
