// Package routing — выбор эндпоинта провайдера, health-трекинг, circuit breaker,
// ретраи и fallback между моделями.
package routing

import "sort"

// Endpoint — один способ обслужить модель: провайдер, регион, приоритет.
// Полная сущность с ценой и параметрами — ID24_API-83, здесь только поля маршрутизации.
type Endpoint struct {
	ID       string
	Model    string
	Provider string
	Region   string
	Priority int // меньше — раньше
	Weight   int
	Disabled bool // ручное отключение
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
