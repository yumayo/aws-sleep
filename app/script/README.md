# Script Tools

## セットアップ

```bash
cd /app/app/script
npm install
npm run build
```

## 開発時

```bash
# ファイル変更を監視してビルド
npm run dev
```

## 使用方法

### CloudFormation デプロイ

```bash
cd /app/app/script

# 基本的な使用方法
npm run deploy-cloudformation ecs-sample.yml

# スタック名を指定
npm run deploy-cloudformation ecs-sample.yml my-ecs-stack

# VPCとサブネットを指定
npm run deploy-cloudformation ecs-sample.yml my-ecs-stack vpc-12345 subnet-abc subnet-def

# 完全な例
npm run deploy-cloudformation /app/app/infra/ecs-sample.yml ecs-test-stack vpc-0123456789abcdef0 subnet-0123456789abcdef0 subnet-0fedcba9876543210
```

## 必要な環境変数

```bash
export AWS_REGION=ap-northeast-1
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```