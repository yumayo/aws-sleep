export interface AwsConfig {
  vpc: {
    vpcId: string;
    subnets: Array<{
      subnetId: string;
    }>;
  };
  awsRegion: string;
  awsAccountId: string;
}