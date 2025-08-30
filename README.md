
# バックエンドサーバーとの通信

```sh
docker compose up -d
docker compose exec script bash
curl http://api:3000/api/health
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
