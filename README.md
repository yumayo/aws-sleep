
![alt-text](resources/login-page.png)

![alt-text](resources/dashboard.png)

# 初回セットアップ

## 1. makeコマンドでセットアップを行う

```sh
make setup
```

## 2. 夜間、休日停止する設定を行う

下記のような設定をしたjsonファイルを app/api/data/config.json に置く。

```json
{
  "ecsItems": [
    {
      "clusterName": "sample-cluster",
      "serviceName": "sample-service-1",
      "desiredCount": 1,
      "startDate": "9:00",
      "stopDate": "21:00"
    },
    {
      "clusterName": "sample-cluster",
      "serviceName": "sample-service-2",
      "desiredCount": 1,
      "startDate": "9:00",
      "stopDate": "21:00"
    },
    {
      "clusterName": "sample-cluster",
      "serviceName": "sample-service-3",
      "desiredCount": 1,
      "startDate": "9:00",
      "stopDate": "21:00"
    }
  ],
  "rdsItems": [
    {
      "clusterName": "rds-aurora-sample-auroracluster-zoizerqxon9k",
      "startDate": "8:40",
      "stopDate": "21:00"
    }
  ],
  "awsRegion": "ap-northeast-1"
}
```

## 動作確認

http://localhost/server-monitoring にアクセス  
初回セットアップ通りなら、初期パスワード admin と password123 でログインできます。

# **以下はメモ**

## AWS環境がない場合にテスト用の環境を整えるための設定

下記のような設定をしたjsonファイルを app/api/data/aws-config.json に置く。

```json
{
  "vpc": {
    "vpcId": "vpc-68c2fc51b7c4d6544",
    "subnets": [
      {
        "subnetId": "subnet-795543aebce143aa7"
      },
      {
        "subnetId": "subnet-26e2366fd33b96550"
      },
      {
        "subnetId": "subnet-270ff4a7887085856"
      }
    ]
  },
  "awsRegion": "ap-northeast-1",
  "awsAccountId": "123456789012"
}
```

## TODO

- ローカル環境でしか動作しないため、インターネットで操作したい
    - 管理画面用のECSを作成する
    - jsonファイルのストレージ管理なので、ECSの再起動でデータが無くなるため、DynamoDBに移動したい

## apiサーバーとのテスト通信

```sh
docker compose exec script bash -c 'curl http://api:3000/health && echo ""'
```

```
{"status":"ok","timestamp":"2025-08-30T11:22:20.115Z"}
```

## apiサーバーのテスト

```sh
docker compose exec script bash -c 'cd app/api && npm test'
```

## RDSのパスワード生成コマンド

```sh
docker compose exec script cli generate-rds-password
```

## CloudFormation デプロイ

### 基本的な使用方法

```bash
docker compose exec script cli deploy-cloudformation ../infra/ecs-sample.yml
```

### スタック名を指定

```bash
docker compose exec script cli deploy-cloudformation ../infra/ecs-sample.yml ecs-sample
```
