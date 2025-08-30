# ECS夜間停止・朝起動バッチ

## 機能概要

- **平日夜間停止**: 21:00にECSサービスを停止（祝日除く）
- **平日朝起動**: 09:00にECSサービスを起動（祝日除く）
- **休日対応**: 土日祝日は終日停止

## 必要な環境変数

`.env`ファイルに以下を設定してください：

```bash
# AWS設定
AWS_REGION=ap-northeast-1

# ECS設定
ECS_CLUSTER_NAME=your-ecs-cluster-name
ECS_SERVICE_NAME=your-ecs-service-name
ECS_NORMAL_DESIRED_COUNT=1

# AWS認証（本番環境ではIAMロール推奨）
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
```

## 必要なIAMポリシー

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecs:UpdateService",
                "ecs:DescribeServices"
            ],
            "Resource": [
                "arn:aws:ecs:ap-northeast-1:*:service/your-cluster-name/your-service-name"
            ]
        }
    ]
}
```

## テスト用エンドポイント

### ECSサービス状態確認
```bash
GET /api/ecs/status
```

### 手動停止
```bash
POST /api/ecs/stop
```

### 手動起動
```bash
POST /api/ecs/start
```

## スケジュール詳細

| 曜日 | 時間 | 動作 | 条件 |
|------|------|------|------|
| 月-金 | 21:00 | 停止 | 祝日でない場合のみ |
| 月-金 | 09:00 | 起動 | 祝日でない場合のみ |
| 土日 | 21:00 | 停止 | 常に実行 |

## 祝日判定

- `japanese-holidays`パッケージを使用
- 日本の国民の祝日、振替休日、国民の休日に対応
- 祝日は平日扱いしない（終日停止）

## 注意事項

1. サーバー起動時に環境変数が不正な場合、スケジューラーは無効化されます
2. AWS認証エラーがあってもサーバーは起動します（ログにエラー出力）
3. タイムゾーンは`Asia/Tokyo`で固定
4. サーバー停止時はスケジュールも停止します