# Локальный запуск: make up && make api (в одном терминале) && make web (в другом)
.PHONY: up down api web build test sqlc

up:        ## Postgres и Redis в docker
	docker compose up -d --wait

down:
	docker compose down

api:       ## Go-сервер на :8090 (миграции применяются при старте)
	cd backend && go run ./cmd/server

web:       ## Next.js на :3100, /api и /v1 проксируются на :8090
	cd web && pnpm install && pnpm dev

build:
	cd backend && go build -o bin/server ./cmd/server
	cd web && pnpm install && pnpm build

test:
	cd backend && go vet ./... && go test ./...
	cd web && pnpm typecheck

sqlc:      ## перегенерировать запросы после правки internal/store/queries
	cd backend && sqlc generate
