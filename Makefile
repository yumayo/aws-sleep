.DEFAULT_GOAL := setup-claude

.PHONY: setup-claude

setup-claude:
	mkdir -p .claude.local
	[ ! -f .claude.local/.claude.json ] && echo '{}' > .claude.local/.claude.json || true
	mkdir -p .claude.local/.claude
	mkdir -p app/api/data
	[ ! -f app/api/data/config.json ] && echo '{"ecsItems":[],"rdsItems":[],"awsRegion":"ap-northeast-1"}' > app/api/data/config.json || true
