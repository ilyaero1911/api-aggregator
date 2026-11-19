package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/ilyaero1911/api-aggregator/adapters"
	"github.com/ilyaero1911/api-aggregator/apierr"
	"github.com/ilyaero1911/api-aggregator/routing"
)

func (s *Service) guardChat(w http.ResponseWriter, r *http.Request, key Key, body *chatRequest) bool {
	if key.Management {
		writeErr(w, apierr.New(apierr.Forbidden, "management-ключ не вызывает модель"))
		return true
	}
	if name := PresetName(body.Model, body.Preset); name != "" && s.Presets != nil {
		item, ok := s.Presets.Get(name)
		if !ok {
			writeErr(w, apierr.New(apierr.InvalidRequest, "пресет не найден").WithParam("preset"))
			return true
		}
		body.Model = item.Model
		if len(item.Models) > 0 {
			body.Models = item.Models
		}
		if item.System != "" {
			raw, _ := json.Marshal(item.System)
			body.Messages = append([]chatMessage{{Role: "system", Content: raw}}, body.Messages...)
		}
	}
	base, variant := SplitVariant(body.Model)
	if s.Catalog != nil {
		if card, ok := s.Catalog.Resolve(base); ok {
			base = card.ID
			if card.Expensive {
				tier := s.Tiers[key.Account]
				_, _, expensive := TierLimits(tier)
				if !expensive {
					writeErr(w, apierr.New(apierr.Forbidden, "уровень аккаунта не открывает эту модель"))
					return true
				}
			}
		} else if _, disabled := s.catalogDisabled(base); disabled {
			writeErr(w, apierr.New(apierr.ModelNotFound, ""))
			return true
		}
	}
	if body.Model == "auto" && s.Catalog != nil {
		text := messageText(body.Messages)
		cards := map[string]ModelCard{}
		allow := []string{}
		for _, card := range s.Catalog.List() {
			cards[card.ID] = card
			allow = append(allow, card.ID)
		}
		picked := AutoChoice(text, allow, cards)
		if picked == "" {
			writeErr(w, apierr.New(apierr.ModelNotFound, ""))
			return true
		}
		base = picked
	}
	body.Model = base
	if variant != "" {
		r.Header.Set("X-Model-Variant", variant)
	}
	text := messageText(body.Messages)
	if s.Moderator != nil {
		if blocked, _ := s.Moderator(text); blocked {
			writeErr(w, apierr.New(apierr.Moderation, ""))
			return true
		}
	}
	if kind := LeakOrInjection(text); kind != "" {
		writeErr(w, apierr.New(apierr.Moderation, kind))
		return true
	}
	if policy, ok := s.Policies[key.Account]; ok && !policy.Allows(body.Model, "") {
		writeErr(w, apierr.New(apierr.Forbidden, "политика организации"))
		return true
	}
	if err := keyRules(key, body.Model, clientIP(r)); err != nil {
		writeErr(w, apierr.New(apierr.Forbidden, err.Error()))
		return true
	}
	if s.Limiter != nil {
		rpm := key.RPM
		if rpm <= 0 {
			rpm = 60
		}
		if tier, ok := s.Tiers[key.Account]; ok {
			limit, _, _ := TierLimits(tier)
			if rpm > limit {
				rpm = limit
			}
		}
		decision := s.Limiter.Allow("key:"+key.Account, rpm, 1, s.now())
		w.Header().Set("x-ratelimit-limit-requests", strconvItoa(decision.Limit))
		w.Header().Set("x-ratelimit-remaining-requests", strconvItoa(decision.Remaining))
		w.Header().Set("x-ratelimit-reset-requests", decision.Reset.Format(time.RFC3339))
		if !decision.OK {
			w.Header().Set("retry-after", "60")
			err := apierr.New(apierr.RateLimit, "")
			err.Metadata = &apierr.Metadata{LimitSource: decision.Source}
			writeErr(w, err)
			return true
		}
	}
	if s.Free != nil && variant == "free" {
		topped := s.Tiers[key.Account] == TierPaying || s.Tiers[key.Account] == TierEnterprise
		ok, _ := s.Free.Allow(key.Account, true, topped, s.now())
		if !ok {
			writeErr(w, apierr.New(apierr.RateLimit, "квота бесплатной модели"))
			return true
		}
	}
	if s.Fair != nil {
		priority := 0
		if s.Tiers[key.Account] == TierPaying {
			priority = 1
		}
		if s.Tiers[key.Account] == TierEnterprise {
			priority = 2
		}
		if _, ok := s.Fair.Acquire(key.Account, priority); !ok {
			writeErr(w, apierr.New(apierr.RateLimit, "нет свободного слота провайдера"))
			return true
		}
	}
	return false
}

func (s *Service) catalogDisabled(id string) (ModelCard, bool) {
	if s.Catalog == nil {
		return ModelCard{}, false
	}
	s.Catalog.mu.Lock()
	defer s.Catalog.mu.Unlock()
	card, ok := s.Catalog.models[id]
	return card, ok && card.Disabled
}

func keyRules(key Key, model, ip string) error {
	rec := &Record{Active: true, Models: key.Models, DenyModels: key.DenyModels, Providers: key.Providers, CIDRs: key.CIDRs, Budget: key.Budget, Spent: key.Spent}
	return (&Vault{}).Allows(rec, model, "", ip, time.Now())
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func messageText(messages []chatMessage) string {
	var b strings.Builder
	for _, m := range messages {
		b.Write(m.Content)
		b.WriteByte('\n')
	}
	return b.String()
}

func (s *Service) remember(key Key, gen, model string, endpoint routing.Endpoint, reply adapters.Reply, attempts int, cacheHit bool) {
	if s.Gens == nil {
		return
	}
	reason := "ok"
	if cacheHit {
		reason = "cache_hit"
	}
	s.Gens.Put(Generation{
		ID: gen, Account: key.Account, Model: model, Provider: endpoint.Provider,
		Endpoint: endpoint.ID, Tokens: reply.Usage.Output, Finish: reply.Finish,
		Status: "ok", Attempts: attempts, Reason: reason, CacheHit: cacheHit,
	})
}

func (s *Service) models(w http.ResponseWriter, r *http.Request) {
	if s.Catalog == nil {
		writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": []any{}})
		return
	}
	tag := fmt.Sprintf(`W/"%d"`, s.Catalog.Version)
	w.Header().Set("ETag", tag)
	if r.Header.Get("If-None-Match") == tag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	type row struct {
		ID         string           `json:"id"`
		Object     string           `json:"object"`
		Name       string           `json:"name"`
		Context    int              `json:"context_length"`
		Pricing    map[string]int64 `json:"pricing"`
		Modalities []string         `json:"architecture"`
	}
	var data []row
	for _, card := range s.Catalog.List() {
		data = append(data, row{ID: card.ID, Object: "model", Name: card.Name, Context: card.Context, Pricing: card.Pricing, Modalities: card.Modalities})
	}
	writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": data})
}

func (s *Service) generation(w http.ResponseWriter, r *http.Request) {
	key, err := s.Keys.Lookup(secretFrom(r), s.now())
	if err != nil {
		writeErr(w, apierr.As(err))
		return
	}
	if s.Gens == nil {
		writeErr(w, apierr.New(apierr.ModelNotFound, "generation не найден"))
		return
	}
	item, ok := s.Gens.Get(key.Account, r.URL.Query().Get("id"))
	if !ok {
		writeErr(w, apierr.New(apierr.ModelNotFound, "generation не найден"))
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Service) keyInfo(w http.ResponseWriter, r *http.Request) {
	key, err := s.Keys.Lookup(secretFrom(r), s.now())
	if err != nil {
		writeErr(w, apierr.As(err))
		return
	}
	tier := s.Tiers[key.Account]
	if tier == "" {
		tier = TierNew
	}
	rpm, tpm, expensive := TierLimits(tier)
	writeJSON(w, http.StatusOK, map[string]any{"account": key.Account, "tier": tier, "rpm": rpm, "tpm": tpm, "expensive": expensive})
}

func (s *Service) createKey(w http.ResponseWriter, r *http.Request) {
	key, err := s.Keys.Lookup(secretFrom(r), s.now())
	if err != nil {
		writeErr(w, apierr.As(err))
		return
	}
	if !key.Management || s.Vault == nil {
		writeErr(w, apierr.New(apierr.Forbidden, "нужен management-ключ"))
		return
	}
	var body struct {
		Name   string `json:"name"`
		Budget int64  `json:"budget"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	issued, rec, err := s.Vault.Create(key.Account, body.Name, key.ID, false, s.now())
	if err != nil {
		writeErr(w, apierr.New(apierr.InvalidRequest, err.Error()))
		return
	}
	rec.Budget = body.Budget
	writeJSON(w, http.StatusOK, map[string]any{"id": rec.ID, "secret": issued.Secret, "prefix": issued.Prefix, "budget": rec.Budget})
}

func (s *Service) listKeys(w http.ResponseWriter, r *http.Request) {
	key, err := s.Keys.Lookup(secretFrom(r), s.now())
	if err != nil {
		writeErr(w, apierr.As(err))
		return
	}
	if s.Vault == nil {
		writeJSON(w, http.StatusOK, []Record{})
		return
	}
	writeJSON(w, http.StatusOK, s.Vault.List(key.Account))
}

func (s *Service) deleteKey(w http.ResponseWriter, r *http.Request) {
	key, err := s.Keys.Lookup(secretFrom(r), s.now())
	if err != nil {
		writeErr(w, apierr.As(err))
		return
	}
	if !key.Management || s.Vault == nil {
		writeErr(w, apierr.New(apierr.Forbidden, ""))
		return
	}
	if !s.Vault.RevokeID(chi.URLParam(r, "id")) {
		writeErr(w, apierr.New(apierr.ModelNotFound, ""))
		return
	}
	_ = key
	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

func (s *Service) abuse(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Account string `json:"account"`
		Key     string `json:"key"`
		Reason  string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, apierr.New(apierr.InvalidRequest, ""))
		return
	}
	if s.Abuse == nil {
		s.Abuse = &Abuse{}
	}
	s.Abuse.Report(body.Account, body.Key, body.Reason, s.Keys, body.Key)
	writeJSON(w, http.StatusOK, map[string]any{"status": "accepted", "journal": len(s.Abuse.Journal())})
}

func (s *Service) stream(w http.ResponseWriter, r *http.Request, key Key, body chatRequest, gen string, hold int64) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("X-Generation-Id", gen)
	flusher, _ := w.(http.Flusher)
	ctx, cancel := context.WithTimeout(r.Context(), s.deadline(body.Model).Max)
	defer cancel()
	if s.StreamMock == nil {
		_ = s.Ledger.Release(key.Account, gen)
		writeErr(w, apierr.New(apierr.NoAvailableProvider, ""))
		return
	}
	var text strings.Builder
	reply, err := s.StreamMock(ctx, body.Model, func(delta string) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		text.WriteString(delta)
		fmt.Fprintf(w, "data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", delta)
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	})
	if err != nil {
		fmt.Fprintf(w, "data: {\"error\":{\"code\":%q}}\n\n", apierr.As(err).Code)
		partial := int64(text.Len())
		if partial == 0 {
			_ = s.Ledger.Release(key.Account, gen)
		} else if partial > hold {
			_ = s.Ledger.Capture(key.Account, gen, hold)
		} else {
			_ = s.Ledger.Capture(key.Account, gen, partial)
		}
		return
	}
	if err := s.Ledger.Capture(key.Account, gen, hold); err != nil {
		fmt.Fprintf(w, "data: {\"error\":{\"code\":\"provider_error\"}}\n\n")
		return
	}
	if reply.Usage.Output == 0 {
		reply.Usage.Output = int64(text.Len())
	}
	fmt.Fprintf(w, "data: {\"usage\":{\"completion_tokens\":%d}}\n\n", reply.Usage.Output)
	fmt.Fprint(w, "data: [DONE]\n\n")
	if flusher != nil {
		flusher.Flush()
	}
	s.remember(key, gen, body.Model, routing.Endpoint{}, reply, 1, false)
	if s.Fair != nil {
		s.Fair.Release(key.Account)
	}
}

func (s *Service) picked(model string, body chatRequest, variant string) []routing.Endpoint {
	if s.Routes == nil {
		return nil
	}
	need := Need{Variant: variant, Tokens: len(messageText(body.Messages))}
	if len(body.Tools) > 0 {
		need.Tools = true
	}
	if strings.Contains(messageText(body.Messages), "image_url") {
		need.Image = true
	}
	if body.Provider != nil {
		need.Prefs = *body.Provider
	}
	list := Filter(s.Routes.All(model), need)
	if body.Provider != nil && body.Provider.AllowFallbacks != nil && !*body.Provider.AllowFallbacks && len(list) > 1 {
		list = list[:1]
	}
	return list
}
