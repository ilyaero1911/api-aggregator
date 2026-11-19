// Package routing — выбор эндпоинта провайдера, health-трекинг, circuit breaker,
// ретраи и fallback между моделями.
package routing

import "sort"

// Endpoint — один способ обслужить модель: провайдер, регион, приоритет, цена и лимиты.
type Endpoint struct {
	ID           string
	Model        string
	Provider     string
	Region       string
	Priority     int // меньше — раньше
	Weight       int
	Disabled     bool // ручное отключение
	PriceMinor   int64
	Context      int
	MaxOutput    int
	Quantization string
	Params       []string
	DataPolicy   string
	Status       string
}

// Registry — эндпоинты по моделям.
type Registry struct {
	byModel map[string][]Endpoint
}

func NewRegistry(endpoints ...Endpoint) *Registry {
	r := &Registry{byModel: map[string][]Endpoint{}}
	for _, e := range endpoints {
		r.byModel[e.Model] = append(r.byModel[e.Model], e)
	}
	for _, list := range r.byModel {
		sort.SliceStable(list, func(i, j int) bool {
			if list[i].Priority != list[j].Priority {
				return list[i].Priority < list[j].Priority
			}
			return list[i].Weight > list[j].Weight
		})
	}
	return r
}

// Has — есть ли модель в реестре, даже если все её эндпоинты отключены.
func (r *Registry) Has(model string) bool {
	return len(r.byModel[model]) > 0
}

// All — все эндпоинты модели, включая выключенные.
func (r *Registry) All(model string) []Endpoint {
	if r == nil {
		return nil
	}
	return append([]Endpoint(nil), r.byModel[model]...)
}

// Upsert добавляет или заменяет эндпоинт и заново сортирует модель.
func (r *Registry) Upsert(e Endpoint) {
	if r.byModel == nil {
		r.byModel = map[string][]Endpoint{}
	}
	list := r.byModel[e.Model]
	replaced := false
	for i := range list {
		if list[i].ID == e.ID {
			list[i] = e
			replaced = true
			break
		}
	}
	if !replaced {
		list = append(list, e)
	}
	sort.SliceStable(list, func(i, j int) bool {
		if list[i].Priority != list[j].Priority {
			return list[i].Priority < list[j].Priority
		}
		return list[i].Weight > list[j].Weight
	})
	r.byModel[e.Model] = list
}

// Disable выключает эндпоинт. Выключенный не попадает в маршрут.
func (r *Registry) Disable(model, id string) bool {
	list := r.byModel[model]
	for i := range list {
		if list[i].ID != id {
			continue
		}
		list[i].Disabled = true
		list[i].Status = "disabled"
		r.byModel[model] = list
		return true
	}
	return false
}

// For — включённые эндпоинты модели в порядке приоритета.
func (r *Registry) For(model string) []Endpoint {
	var out []Endpoint
	for _, e := range r.byModel[model] {
		if !e.Disabled {
			out = append(out, e)
		}
	}
	return out
}
