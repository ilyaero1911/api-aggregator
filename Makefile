SHELL := /bin/sh
GO ?= go
NODE ?= node
PNPM ?= pnpm
COMPOSE ?= docker compose
SERVICE ?= gateway

.PHONY: install lint format test test-go test-db test-sdk build run gen up down migrate seed bench hooks
install:
	$(PNPM) install --frozen-lockfile
	$(GO) mod download
gen:
	python3 tools/generate-contracts.py
	$(GO) run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0 --config tools/oapi-public.yaml schema/openapi.yaml
	$(GO) run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0 --config tools/oapi-internal.yaml schema/internal.openapi.yaml
	$(PNPM) run gen:ts
	$(PNPM) exec prettier --write schema/openapi.yaml schema/internal.openapi.yaml schema/llm-request.schema.json schema/llm-response.schema.json
format:
	$(GO) run mvdan.cc/gofumpt@v0.12.0 -w services internal benchmarks/sse/go packages/contracts
	$(PNPM) exec prettier --write '**/*.{mjs,ts,tsx,json,yaml,yml}'
lint:
	$(GO) vet ./...
	$(PNPM) run lint:api
	$(PNPM) exec eslint benchmarks tools tests packages/sdk/src apps/web/app apps/web/src
	$(PNPM) exec tsc --noEmit
	python3 tools/check_risks.py
	python3 tools/check_provider_registry.py
test-go:
	$(GO) test -race -coverprofile=coverage.out ./...
test-db:
	$(PNPM) run test:db
test-sdk:
	mkdir -p .cache
	$(GO) build -o .cache/mock-provider ./services/mock-provider
	$(NODE) --test tests/sdk.test.mjs
test: test-go test-db test-sdk
	$(PNPM) run test:contracts
	$(NODE) --test tests/nfr.test.mjs
	python3 -m unittest discover -v
build:
	$(GO) build ./services/...
	NEXT_TELEMETRY_DISABLED=1 $(PNPM) --filter @neurogateway/web build
run:
	$(GO) run ./services/$(SERVICE)
up:
	$(COMPOSE) up -d --build --wait
	$(MAKE) migrate seed
down:
	$(COMPOSE) down
migrate:
	$(COMPOSE) exec -T postgres sh -c 'command -v psql >/dev/null'
	python3 tools/migrate_local.py up | $(COMPOSE) exec -T postgres psql -v ON_ERROR_STOP=1 -U ngdev -d neurogateway
seed:
	$(COMPOSE) exec -T postgres psql -v ON_ERROR_STOP=1 -U ngdev -d neurogateway < deploy/seed.sql
bench:
	mkdir -p .cache
	$(GO) build -o .cache/sse-go ./benchmarks/sse/go
	$(NODE) benchmarks/sse/run.mjs
hooks:
	git config core.hooksPath .githooks
