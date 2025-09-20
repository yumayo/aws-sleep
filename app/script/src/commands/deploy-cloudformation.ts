import {
  CloudFormationClient,
  CreateStackCommand,
  UpdateStackCommand,
  DescribeStacksCommand,
  DeleteStackCommand,
  Parameter
} from '@aws-sdk/client-cloudformation';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AwsConfigStorage } from '../models/aws-config-storage';
import { AwsConfig } from '../types/script-types';


interface DeployOptions {
  stackName: string;
  templateFile: string;
  parameters?: Parameter[];
}

export async function deployCloudFormation(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('Usage: npm run dev deploy-cloudformation <template-file>');
    process.exit(1);
  }

  const templateFile = args[0];
  const stackName = getStackNameFromTemplate(templateFile);

  const awsConfigStorage = new AwsConfigStorage();
  const awsConfig = await awsConfigStorage.load();
  
  // テンプレートファイルに応じてパラメータを設定
  const parameters = getParametersForTemplate(templateFile, awsConfig);

  try {
    await deployCloudFormationStack({
      stackName,
      templateFile,
      parameters
    });
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

function getStackNameFromTemplate(templateFile: string): string {
  // ファイル名からディレクトリと拡張子を除去してスタック名を生成
  const fileName = templateFile.split('/').pop() || templateFile;
  return fileName.replace(/\.ya?ml$/, '');
}

function getParametersForTemplate(templateFile: string, awsConig: AwsConfig): Parameter[] {
  const fileName = templateFile.split('/').pop() || '';
  
  // ecs-sample.ymlはVPCパラメータが必要
  if (fileName === 'ecs-sample.yml') {
    return [
      {
        ParameterKey: 'VpcId',
        ParameterValue: awsConig.vpc.vpcId
      },
      {
        ParameterKey: 'SubnetIds',
        ParameterValue: awsConig.vpc.subnets.map(subnet => subnet.subnetId).join(',')
      }
    ];
  } else if (fileName == 'vpc-endpoints.yml') {
    return [
      {
        ParameterKey: 'VpcId',
        ParameterValue: awsConig.vpc.vpcId
      },
      {
        ParameterKey: 'SubnetIds',
        ParameterValue: awsConig.vpc.subnets.map(subnet => subnet.subnetId).join(',')
      }
    ];
  } else if (fileName === 'rds-aurora-sample.yml') {
    // RDS AuroraクラスターにはVPCとSubnetパラメータ、およびMasterPasswordが必要
    const masterPassword = process.env.APP_RDS_ROOT_PASSWORD;
    // const snapshotIdentifier = process.env.APP_RDS_SNAPSHOT_IDENTIFIER;
    return [
      {
        ParameterKey: 'VpcId',
        ParameterValue: awsConig.vpc.vpcId
      },
      {
        ParameterKey: 'SubnetIds',
        ParameterValue: awsConig.vpc.subnets.map(subnet => subnet.subnetId).join(',')
      },
      {
        ParameterKey: 'MasterPassword',
        ParameterValue: masterPassword
      },
      // {
      //   ParameterKey: 'SnapshotIdentifier',
      //   ParameterValue: snapshotIdentifier
      // }
    ];
  }
  
  // その他のテンプレート（ecr-repository.yml、ecs-execution-role.yml等）はパラメータ不要
  return [];
}


async function deployCloudFormationStack(options: DeployOptions): Promise<void> {
  const configStorage = new AwsConfigStorage();
  const config = await configStorage.load();
  const client = new CloudFormationClient({
    region: config.awsRegion
  });

  const templatePath = resolve(options.templateFile);
  const templateBody = readFileSync(templatePath, 'utf-8');

  try {
    // スタックが存在するかチェック
    const describeResult = await client.send(new DescribeStacksCommand({ StackName: options.stackName }));
    const stackStatus = describeResult.Stacks?.[0]?.StackStatus;

    if (stackStatus === 'ROLLBACK_COMPLETE') {
      // ROLLBACK_COMPLETE状態の場合はスタックを削除してから作成
      console.log(`Stack is in ROLLBACK_COMPLETE state. Deleting stack: ${options.stackName}`);
      await client.send(new DeleteStackCommand({ StackName: options.stackName }));

      // 削除完了を待つ
      console.log('Waiting for stack deletion to complete...');
      await waitForStackDeletion(client, options.stackName);

      // 新規作成
      console.log(`Creating stack: ${options.stackName}`);
      await client.send(new CreateStackCommand({
        StackName: options.stackName,
        TemplateBody: templateBody,
        Parameters: options.parameters,
        Capabilities: ['CAPABILITY_IAM']
      }));
      
      // 作成完了を待つ
      console.log('Waiting for stack creation to complete...');
      await waitForStackComplete(client, options.stackName);
    } else {
      // 存在する場合は更新
      console.log(`Updating stack: ${options.stackName}`);
      await client.send(new UpdateStackCommand({
        StackName: options.stackName,
        TemplateBody: templateBody,
        Parameters: options.parameters,
        Capabilities: ['CAPABILITY_IAM']
      }));
      
      // 更新完了を待つ
      console.log('Waiting for stack update to complete...');
      await waitForStackComplete(client, options.stackName);
    }

  } catch (error: any) {
    if (error.name === 'ValidationError' && error.message.includes('does not exist')) {
      // スタックが存在しない場合は作成
      console.log(`Creating stack: ${options.stackName}`);
      await client.send(new CreateStackCommand({
        StackName: options.stackName,
        TemplateBody: templateBody,
        Parameters: options.parameters,
        Capabilities: ['CAPABILITY_IAM']
      }));
      
      // 作成完了を待つ
      console.log('Waiting for stack creation to complete...');
      await waitForStackComplete(client, options.stackName);
    } else {
      throw error;
    }
  }

  console.log(`Stack ${options.stackName} deployment initiated successfully`);
}

async function waitForStackDeletion(client: CloudFormationClient, stackName: string): Promise<void> {
  while (true) {
    try {
      await client.send(new DescribeStacksCommand({ StackName: stackName }));
      // スタックがまだ存在する場合は5秒待って再チェック
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error: any) {
      if (error.name === 'ValidationError' && error.message.includes('does not exist')) {
        // スタックが削除完了
        console.log('Stack deletion completed');
        return;
      }
      throw error;
    }
  }
}

async function waitForStackComplete(client: CloudFormationClient, stackName: string): Promise<void> {
  while (true) {
    try {
      const describeResult = await client.send(new DescribeStacksCommand({ StackName: stackName }));
      const stackStatus = describeResult.Stacks?.[0]?.StackStatus;
      
      console.log(`Current stack status: ${stackStatus}`);
      
      // 完了状態をチェック
      if (stackStatus === 'CREATE_COMPLETE' || stackStatus === 'UPDATE_COMPLETE') {
        console.log(`Stack operation completed successfully: ${stackStatus}`);
        return;
      }
      
      // 失敗状態をチェック
      if (stackStatus?.includes('FAILED') || stackStatus?.includes('ROLLBACK')) {
        throw new Error(`Stack operation failed with status: ${stackStatus}`);
      }
      
      // 進行中の場合は10秒待って再チェック
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error: any) {
      if (error.message?.includes('Stack operation failed')) {
        throw error;
      }
      throw new Error(`Failed to check stack status: ${error.message}`);
    }
  }
}
