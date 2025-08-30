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

## APIエンドポイント

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

### 遅延停止申請（1時間後停止）
```bash
POST /api/ecs/delay-stop
Content-Type: application/json

{
  "requester": "user-name"  # 申請者名（オプション）
}
```

**レスポンス例（初回申請）:**
```json
{
  "success": true,
  "message": "Delayed stop scheduled successfully",
  "scheduledTime": "2024-01-01T23:30:00.000Z"
}
```

**レスポンス例（既存申請を置換）:**
```json
{
  "success": true,
  "message": "Delayed stop scheduled successfully (replaced previous request scheduled for 2024-01-01T23:15:00.000Z)",
  "scheduledTime": "2024-01-01T23:45:00.000Z",
  "previousRequest": {
    "scheduledTime": "2024-01-01T23:15:00.000Z",
    "requester": "user-a"
  }
}
```

### 遅延停止申請の取消
```bash
DELETE /api/ecs/delay-stop
```

### 遅延停止申請状況確認
```bash
GET /api/ecs/delay-status
```

**レスポンス例（申請あり）:**
```json
{
  "status": "success",
  "hasRequest": true,
  "requestTime": "2024-01-01T22:30:00.000Z",
  "scheduledTime": "2024-01-01T23:30:00.000Z",
  "requester": "user-name"
}
```

**レスポンス例（申請なし）:**
```json
{
  "status": "success",
  "hasRequest": false
}
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

## 遅延停止機能

### 概要
- 通常の21:00停止を1時間遅らせることが可能
- 申請から1時間後に自動停止実行
- **既存の遅延停止申請がある場合、自動的に取り消して新しい申請を受け付けます**
- **遅延停止申請がある場合、21:00の通常停止はスキップされます**

### 使用例
```bash
# 遅延停止申請
curl -X POST http://localhost:3000/api/ecs/delay-stop \
  -H "Content-Type: application/json" \
  -d '{"requester": "夜間作業者"}'

# 申請状況確認
curl http://localhost:3000/api/ecs/delay-status

# 申請取消（必要に応じて）
curl -X DELETE http://localhost:3000/api/ecs/delay-stop
```

## 注意事項

1. サーバー起動時に環境変数が不正な場合、スケジューラーは無効化されます
2. AWS認証エラーがあってもサーバーは起動します（ログにエラー出力）
3. タイムゾーンは`Asia/Tokyo`で固定
4. サーバー停止時はスケジュールも停止します
5. **遅延停止申請は常に受け付けられ、既存申請は自動的に取り消されます**
6. 遅延停止は申請から正確に1時間後に実行されます
7. **遅延停止申請中は通常の21:00停止は自動的にスキップされます**
8. 既存申請の取り消し・新規申請はログに記録されます