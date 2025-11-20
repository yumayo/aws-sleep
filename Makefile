.PHONY: environment setup install-all-npm create-default-admin-user start-containers stop-containers

# 初期化（ディレクトリ作成、設定ファイル生成）
environment:
	mkdir -p app/api/data
	[ ! -f app/api/data/config.json ] && echo '{"ecsItems":[],"rdsItems":[],"awsRegion":"ap-northeast-1"}' > app/api/data/config.json || true
	[ ! -f env/api/.env ] && cp env/api/.env.example env/api/.env || true
	[ ! -f env/script/.env ] && cp env/script/.env.example env/script/.env || true

# コンテナ起動
start-containers:
	docker compose up -d

# コンテナ停止
stop-containers:
	docker compose down

# 依存関係のインストール（script, lib, api, webの順）
install-all-npm: start-containers
	@echo "scriptコンテナでscriptのnpm install中..."
	docker compose exec script bash -c '. ~/.nvm/nvm.sh && cd /workspace/app/script && npm install'
	@echo "scriptコンテナでlibのnpm install中..."
	docker compose exec script bash -c '. ~/.nvm/nvm.sh && cd /workspace/app/lib && npm install'
	@echo "scriptコンテナでlibをビルド中..."
	docker compose exec script bash -c '. ~/.nvm/nvm.sh && cd /workspace/app/lib && npm run build'
	@echo "scriptコンテナでapiのnpm install中..."
	docker compose exec script bash -c '. ~/.nvm/nvm.sh && cd /workspace/app/api && npm install'
	@echo "scriptコンテナでwebのnpm install中..."
	docker compose exec script bash -c '. ~/.nvm/nvm.sh && cd /workspace/app/web && npm install'

# 管理者ユーザー作成
create-default-admin-user: install-all-npm
	@echo "管理者ユーザー（admin/password123）を作成中..."
	docker compose exec script cli manage-users add admin password123

# 完全セットアップ（初回セットアップ手順を自動化）
setup: environment install-all-npm create-default-admin-user
	@echo "セットアップが完了しました！"
	@echo "http://localhost:5173 にアクセスして、admin/password123でログインできます"
	@echo ""
	@echo "次に必要な手順:"
	@echo "1. env/api/.env にAWSアクセスキーを設定"
	@echo "2. app/api/data/config.json にECS・RDS設定を追加"
