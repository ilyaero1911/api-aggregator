package routing

import (
	"context"
	"strings"

	"github.com/ilyaero1911/api-aggregator/adapters"
	"github.com/ilyaero1911/api-aggregator/apierr"
)

// MaxModels — сколько моделей можно перечислить в параметре models.
const MaxModels = 5

// Request — модель запроса и запасные модели из параметра models.
type Request struct {
	Model  string
	Models []string
}

// Result — ответ и то, как он получен. Model — фактическая модель: она
// уходит в поле model ответа и в биллинг.
type Result struct {
	Reply    adapters.Reply
	Model    string
	Endpoint Endpoint
	Attempts []Attempt
}

// Chain — порядок моделей: model, затем models без повторов.
func (q Request) Chain() []string {
	var chain []string
	seen := map[string]bool{}
	for _, m := range append([]string{q.Model}, q.Models...) {
		if m != "" && !seen[m] {
			seen[m] = true
			chain = append(chain, m)
		}
	}
	return chain
}

// Complete выполняет запрос с fallback: сначала эндпоинты той же модели
// (ретраи и breaker из Model), затем следующая модель из models — при ошибке
// провайдера, недоступности, модерации или превышении контекста.
// Ошибки клиента (invalid_request, баланс, ключ) на другую модель не переходят.
func (r *Router) Complete(ctx context.Context, q Request, call Call) (Result, error) {
	chain := q.Chain()
	if len(chain) == 0 {
		return Result{}, apierr.New(apierr.InvalidRequest, "Не указана модель").WithParam("model")
	}
	if len(q.Models) > MaxModels {
		return Result{}, apierr.New(apierr.InvalidRequest, "В models больше 5 моделей").WithParam("models")
	}
	for _, m := range chain {
		if !r.Registry.Has(m) {
			param := "models"
			if m == q.Model {
				param = "model"
			}
			return Result{}, apierr.New(apierr.ModelNotFound, "Модель не найдена: "+m).WithParam(param)
		}
	}
	var res Result
	var last error
	for _, m := range chain {
		reply, e, err := r.Model(ctx, m, call, &res.Attempts)
		if err == nil {
			res.Reply, res.Model, res.Endpoint = reply, m, e
			r.log(q, res, nil)
			return res, nil
		}
		last = err
		if !apierr.As(err).Fallbackable() || ctx.Err() != nil {
			break
		}
	}
	r.log(q, res, last)
	return res, last
}

func (r *Router) log(q Request, res Result, err error) {
	if r.Logger == nil {
		return
	}
	steps := make([]string, 0, len(res.Attempts))
	reasons := make([]string, 0, len(res.Attempts))
	for _, a := range res.Attempts {
		steps = append(steps, a.Model+"@"+a.Endpoint)
		if a.Code != "" {
			reasons = append(reasons, a.Model+"@"+a.Endpoint+": "+a.Reason+" "+string(a.Code))
		}
	}
	attrs := []any{
		"model_requested", q.Model,
		"model_used", res.Model,
		"endpoint", res.Endpoint.ID,
		"attempts", len(res.Attempts),
		"chain", strings.Join(steps, " → "),
		"fallback_reasons", strings.Join(reasons, "; "),
	}
	if err != nil {
		attrs = append(attrs, "error", string(apierr.As(err).Code))
		r.Logger.Warn("routing", attrs...)
		return
	}
	r.Logger.Info("routing", attrs...)
}
