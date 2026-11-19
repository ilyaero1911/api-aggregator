package gateway

import (
	"regexp"
	"strings"
)

// Mask — замена ПДн на маркер и обратная подстановка в ответе.
type Mask struct {
	text string
	swap map[string]string
	n    int
}

var pii = []*regexp.Regexp{
	regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`),
	regexp.MustCompile(`(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}`),
	regexp.MustCompile(`\b\d{4}\s?\d{6}\b`),
	regexp.MustCompile(`\b\d{3}-\d{3}-\d{3}\s?\d{2}\b`),
	regexp.MustCompile(`\b\d{10}\b|\b\d{12}\b`),
	regexp.MustCompile(`\b(?:\d[ -]?){13,19}\b`),
}

var secretLeak = regexp.MustCompile(`(?:sk-|AKIA|ng-v1-)[A-Za-z0-9]{8,}`)
var injection = regexp.MustCompile(`(?i)ignore (all |previous |the )?instructions|забудь (все |предыдущие )?инструкции`)

func MaskText(text string) Mask {
	m := Mask{text: text, swap: map[string]string{}}
	for _, re := range pii {
		m.text = re.ReplaceAllStringFunc(m.text, func(found string) string {
			if !plausible(found) {
				return found
			}
			m.n++
			token := "⟦" + strconvItoa(m.n) + "⟧"
			m.swap[token] = found
			return token
		})
	}
	return m
}

func plausible(found string) bool {
	digits := 0
	for _, r := range found {
		if r >= '0' && r <= '9' {
			digits++
		}
	}
	if strings.Contains(found, "@") || strings.Contains(found, "+7") || strings.Contains(found, "-") {
		return true
	}
	return digits == 10 || digits == 12 || digits >= 13 || (digits == 10 && strings.Contains(found, " "))
}

func (m Mask) Restore(text string) string {
	for token, raw := range m.swap {
		text = strings.ReplaceAll(text, token, raw)
	}
	return text
}

func (m Mask) Hidden() int { return len(m.swap) }

func LeakOrInjection(text string) string {
	if secretLeak.MatchString(text) {
		return "secret"
	}
	if injection.MatchString(text) {
		return "injection"
	}
	return ""
}

// OrgPolicy — разрешённые модели и запрет логирования у провайдера.
type OrgPolicy struct {
	Models    []string
	Providers []string
	NoLog     bool
}

func (p OrgPolicy) Allows(model, provider string) bool {
	if len(p.Models) > 0 && !contains(p.Models, model) {
		return false
	}
	if len(p.Providers) > 0 && provider != "" && !contains(p.Providers, provider) {
		return false
	}
	return true
}
