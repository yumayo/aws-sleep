
# 初回セットアップ

## 1. 【初回セットアップ】scriptコンテナのnpm install

```sh
docker compose up -d
docker compose exec script bash
cd /app/app/script
npm install
```

## 2. 【初回セットアップ】apiコンテナのnpm install

```sh
docker compose up -d
docker compose exec script bash
cd /app/app/api
npm install
```

## 3. 【初回セットアップ】webコンテナのnpm install

```sh
docker compose up -d
docker compose exec script bash
cd /app/app/api
npm install
```

## 4. 【初回セットアップ】管理者ユーザーを作成

```sh
docker compose up -d
docker compose exec script bash
cd /app/app/script
npm run dev manage-users add admin password123
```

# 動作確認

http://localhost:5173 にアクセス
初回セットアップ通りなら、初期パスワード admin と password123 でログインできます。

# **以下はメモ**

# バックエンドサーバーとのテスト通信

```sh
docker compose up -d
docker compose exec script bash
curl http://api:3000/health
```

```
{"status":"ok","timestamp":"2025-08-30T11:22:20.115Z"}
```

# バックエンドサーバーのテスト

```sh
docker compose up -d 
docker compose exec script bash
cd app/api
npm test
```

## RDSのパスワード生成コマンド

```sh
docker compose up -d 
docker compose exec script bash
cd app/script
npm run dev generate-rds-password
cp 
```

## CloudFormation デプロイ

```bash
docker compose up -d 
docker compose exec script bash
cd app/script

# 基本的な使用方法
npm run dev deploy-cloudformation ../infra/ecs-sample.yml

# スタック名を指定
npm run dev deploy-cloudformation ../infra/ecs-sample.yml ecs-sample

# VPCとサブネットを指定
npm run dev deploy-cloudformation ../infra/ecs-sample.yml ecs-sample vpc-0123456789abcdef0 subnet-1 public-subnet-2 public-subnet-3
```
