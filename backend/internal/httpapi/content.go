package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/ilyaero1911/api-aggregator/backend/internal/store/db"
)

// Тексты сайта, новости и журнал аккаунта.

var siteKeys = []string{"footer_tagline_ru", "footer_tagline_en", "company_name", "company_inn", "company_ogrn", "company_address", "company_email", "company_phone"}

func (s *Server) siteInfo(r *http.Request) map[string]string {
	all := s.settings.All(r.Context())
	out := map[string]string{}
	for _, k := range siteKeys {
		var v string
		_ = json.Unmarshal(all[k], &v)
		out[k] = v
	}
	return out
}

func (s *Server) contentPublicRoutes(r chi.Router) {
	r.Get("/site", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, s.siteInfo(r)) })
	r.Get("/pages/{slug}", s.publicPage)
}

// publicPage подставляет реквизиты компании вместо {company}, {inn} и т.п.
func (s *Server) publicPage(w http.ResponseWriter, r *http.Request) {
	p, err := s.q.GetPage(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		writeErr(w, 404, "not_found", "Page not found")
		return
	}
	si := s.siteInfo(r)
	rep := strings.NewReplacer("{company}", si["company_name"], "{inn}", si["company_inn"], "{ogrn}", si["company_ogrn"],
		"{address}", si["company_address"], "{email}", si["company_email"], "{phone}", si["company_phone"])
	p.BodyRu, p.BodyEn = rep.Replace(p.BodyRu), rep.Replace(p.BodyEn)
	writeJSON(w, 200, p)
}

func (s *Server) contentAccountRoutes(r chi.Router) {
	r.Get("/news", func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.q.UserAnnouncements(r.Context(), currentUser(r).ID)
		if err != nil {
			s.internal(w, err)
			return
		}
		unread := 0
		for _, a := range rows {
			if !a.Read {
				unread++
			}
		}
		writeJSON(w, 200, map[string]any{"data": rows, "unread": unread})
	})
	r.Post("/news/read", func(w http.ResponseWriter, r *http.Request) {
		_ = s.q.MarkAnnouncementsRead(r.Context(), currentUser(r).ID)
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
	r.Get("/me/events", func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.q.ListUserEvents(r.Context(), db.ListUserEventsParams{UserID: currentUser(r).ID, Limit: 200})
		if err != nil {
			s.internal(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"data": rows})
	})
	r.Get("/me/identities", func(w http.ResponseWriter, r *http.Request) {
		rows, _ := s.q.ListUserIdentities(r.Context(), currentUser(r).ID)
		writeJSON(w, 200, map[string]any{"data": rows, "providers": s.oauthList()})
	})
}

func (s *Server) contentAdminRoutes(r chi.Router) {
	r.Get("/pages", func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.q.ListPages(r.Context())
		if err != nil {
			s.internal(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"data": rows, "site": s.siteInfo(r)})
	})
	r.Put("/pages", func(w http.ResponseWriter, r *http.Request) {
		var in db.UpsertPageParams
		if !readJSON(w, r, &in) {
			return
		}
		if in.Slug == "" || in.TitleRu == "" {
			writeErr(w, 400, "bad_input", "slug and title are required")
			return
		}
		p, err := s.q.UpsertPage(r.Context(), in)
		if err != nil {
			s.internal(w, err)
			return
		}
		s.audit(r.Context(), currentUser(r).ID, "page.save", p.Slug, map[string]int32{"version": p.Version})
		writeJSON(w, 200, p)
	})
	r.Get("/announcements", func(w http.ResponseWriter, r *http.Request) {
		rows, err := s.q.ListAnnouncements(r.Context(), true)
		if err != nil {
			s.internal(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"data": rows})
	})
	r.Post("/announcements", func(w http.ResponseWriter, r *http.Request) {
		var in db.CreateAnnouncementParams
		if !readJSON(w, r, &in) {
			return
		}
		if strings.TrimSpace(in.TitleRu) == "" {
			writeErr(w, 400, "bad_input", "Title is required")
			return
		}
		if in.Kind == "" {
			in.Kind = "info"
		}
		a, err := s.q.CreateAnnouncement(r.Context(), in)
		if err != nil {
			s.internal(w, err)
			return
		}
		s.audit(r.Context(), currentUser(r).ID, "news.create", a.ID.String(), map[string]string{"title": a.TitleRu})
		writeJSON(w, 201, a)
	})
	r.Put("/announcements/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathUUID(w, r, "id")
		if !ok {
			return
		}
		var in db.UpdateAnnouncementParams
		if !readJSON(w, r, &in) {
			return
		}
		in.ID = id
		if in.Kind == "" {
			in.Kind = "info"
		}
		a, err := s.q.UpdateAnnouncement(r.Context(), in)
		if err != nil {
			s.internal(w, err)
			return
		}
		s.audit(r.Context(), currentUser(r).ID, "news.update", id.String(), nil)
		writeJSON(w, 200, a)
	})
	r.Delete("/announcements/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathUUID(w, r, "id")
		if !ok {
			return
		}
		if err := s.q.DeleteAnnouncement(r.Context(), id); err != nil {
			s.internal(w, err)
			return
		}
		s.audit(r.Context(), currentUser(r).ID, "news.delete", id.String(), nil)
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
}
