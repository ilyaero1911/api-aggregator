// Package payments — заготовка под платёжного провайдера.
//
// Сейчас работает только Fake: он «выставляет счёт» со ссылкой на страницу фиктивной оплаты
// во фронтенде, где можно подтвердить или отменить платёж. Чтобы подключить настоящего
// провайдера (ЮKassa, CloudPayments и т.п.), достаточно реализовать Provider и зарегистрировать
// его в Registry: создание платежа, разбор вебхука и проверку подписи.
package payments

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
)

type Invoice struct {
	ID            uuid.UUID
	AmountKopecks int64
	Description   string
	ReturnURL     string
}

type Created struct {
	ExternalID      string
	ConfirmationURL string
}

// Event — результат разбора вебхука.
type Event struct {
	PaymentID uuid.UUID
	Status    string // succeeded | failed | canceled
}

type Provider interface {
	Name() string
	Create(ctx context.Context, inv Invoice) (Created, error)
	// Webhook проверяет подпись и возвращает событие. Fake вебхуков не шлёт.
	Webhook(r *http.Request) (Event, error)
}

type Registry struct {
	providers map[string]Provider
	def       string
}

func NewRegistry(def string, ps ...Provider) *Registry {
	r := &Registry{providers: map[string]Provider{}, def: def}
	for _, p := range ps {
		r.providers[p.Name()] = p
	}
	return r
}

func (r *Registry) Default() Provider { return r.providers[r.def] }

func (r *Registry) Get(name string) (Provider, bool) {
	p, ok := r.providers[name]
	return p, ok
}

// Fake — фиктивная оплата для локальной разработки.
type Fake struct{ PublicURL string }

func (Fake) Name() string { return "fake" }

func (f Fake) Create(_ context.Context, inv Invoice) (Created, error) {
	return Created{
		ExternalID:      "fake_" + inv.ID.String()[:8],
		ConfirmationURL: f.PublicURL + "/pay/" + inv.ID.String(),
	}, nil
}

func (Fake) Webhook(*http.Request) (Event, error) {
	return Event{}, errors.New("fake provider has no webhooks")
}
