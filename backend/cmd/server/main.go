// Сервер агрегатора: HTTP API, шлюз /v1 и фоновые задачи (курс валют, обслуживание).
package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/redis/go-redis/v9"

	"github.com/ilyaero1911/api-aggregator/backend/internal/auth"
	"github.com/ilyaero1911/api-aggregator/backend/internal/billing"
	"github.com/ilyaero1911/api-aggregator/backend/internal/config"
	"github.com/ilyaero1911/api-aggregator/backend/internal/fx"
	"github.com/ilyaero1911/api-aggregator/backend/internal/gateway"
	"github.com/ilyaero1911/api-aggregator/backend/internal/httpapi"
	"github.com/ilyaero1911/api-aggregator/backend/internal/notify"
	"github.com/ilyaero1911/api-aggregator/backend/internal/payments"
	"github.com/ilyaero1911/api-aggregator/backend/internal/settings"
	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
	"github.com/ilyaero1911/api-aggregator/backend/migrations"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := migrate(pool); err != nil {
		return err
	}
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		log.Info("migrations applied")
		return nil
	}

	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	rdb := redis.NewClient(ropt)
	defer rdb.Close()

	q := db.New(pool)
	st := settings.New(q)
	sealer := auth.NewSealer(cfg.SecretKey)
	bill := billing.New(pool)
	rates := fx.New(q, rdb, st, cfg.FxCBRURL, cfg.FxBackupURL, log)
	engine := gateway.NewEngine(q, bill, rates, st, rdb, sealer, log)
	tg := notify.NewTelegram(cfg.TelegramToken, cfg.TelegramChatID, st, log)
	pay := payments.NewRegistry(cfg.PaymentProvider, payments.Fake{PublicURL: cfg.PublicURL})

	go rates.Run(ctx, cfg.FxRefresh)
	go maintenance(ctx, q, log)

	srv := &http.Server{
		Addr: cfg.Addr,
		Handler: httpapi.New(httpapi.Deps{Cfg: cfg, Pool: pool, Redis: rdb, Billing: bill, FX: rates, Settings: st,
			Engine: engine, Payments: pay, Sealer: sealer, Log: log, Telegram: tg}).Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
	}()
	log.Info("listening", "addr", cfg.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func migrate(pool *pgxpool.Pool) error {
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	goose.SetLogger(goose.NopLogger())
	var sqldb *sql.DB = stdlib.OpenDBFromPool(pool)
	defer sqldb.Close()
	return goose.Up(sqldb, ".")
}

// maintenance закрывает истёкшие подписки и чистит старые сессии.
func maintenance(ctx context.Context, q *db.Queries, log *slog.Logger) {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for {
		if n, err := q.ExpireSubscriptions(ctx); err == nil && n > 0 {
			log.Info("subscriptions expired", "count", n)
		}
		_ = q.DeleteExpiredSessions(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
