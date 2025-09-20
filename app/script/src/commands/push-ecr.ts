import { execSync } from 'child_process';
import { AwsConfigStorage } from '../models/aws-config-storage';
import { AwsConfig } from '../types/script-types';



function executeCommand(command: string, description: string): void {
  console.log(`${description}...`);
  try {
    execSync(command, { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`${description}に失敗しました: ${error}`);
  }
}

export async function pushEcr(args: string[]): Promise<void> {
  const awsConfigStorage = new AwsConfigStorage();
  const awsConfig: AwsConfig = await awsConfigStorage.load();
  const repositoryName = 'nginx';
  const imageTag = 'latest';
  
  const repositoryUri = `${awsConfig.awsAccountId}.dkr.ecr.${awsConfig.awsRegion}.amazonaws.com/${repositoryName}`;

  console.log('=== ECR nginx push script ===');
  console.log(`Account ID: ${awsConfig.awsAccountId}`);
  console.log(`Region: ${awsConfig.awsRegion}`);
  console.log(`Repository: ${repositoryUri}`);
  console.log();

  // ECRにログイン
  const loginCommand = `aws ecr get-login-password --region ${awsConfig.awsRegion} | docker login --username AWS --password-stdin ${repositoryUri}`;
  executeCommand(loginCommand, 'ECRにログインしています');

  // nginx:latestイメージをpull
  executeCommand('docker pull nginx:latest', 'nginx:latestイメージをpullしています');

  // ECR用にタグ付け
  const tagCommand = `docker tag nginx:latest ${repositoryUri}:${imageTag}`;
  executeCommand(tagCommand, 'ECR用にタグ付けしています');

  // ECRにプッシュ
  const pushCommand = `docker push ${repositoryUri}:${imageTag}`;
  executeCommand(pushCommand, 'ECRにプッシュしています');

  console.log();
  console.log('✅ プッシュが完了しました!');
  console.log(`Image URI: ${repositoryUri}:${imageTag}`);
  console.log();
}