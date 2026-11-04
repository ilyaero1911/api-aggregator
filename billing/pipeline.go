package billing

// Pipeline — очередь событий и воркер. Пока воркер остановлен, события лежат в буфере.
type Pipeline struct {
	On      bool
	Buf     []Event
	Done    map[string]struct{}
	Ledger  *Ledger
	Catalog Catalog
	Budgets map[string]*Budget
	Journal *Journal
}

func NewPipeline(ledger *Ledger, catalog Catalog) *Pipeline {
	return &Pipeline{
		Ledger:  ledger,
		Catalog: catalog,
		Budgets: map[string]*Budget{},
		Journal: &Journal{},
		Done:    map[string]struct{}{},
	}
}

func (p *Pipeline) Push(e Event) error {
	if !p.On {
		p.Buf = append(p.Buf, e)
		return nil
	}
	return p.apply(e)
}

func (p *Pipeline) Stop() { p.On = false }

func (p *Pipeline) Start() {
	p.On = true
	rest := make([]Event, 0)
	for _, e := range p.Buf {
		if err := p.apply(e); err != nil {
			rest = append(rest, e)
		}
	}
	p.Buf = rest
}

func (p *Pipeline) apply(e Event) error {
	if e.Fail {
		return ErrState
	}
	if _, ok := p.Done[e.GenerationID]; ok {
		return nil
	}
	priced, err := p.Catalog.Quote(e.At, e.Provider, e.Model, e.Account, e.Usage)
	if err != nil {
		return err
	}
	budget := p.Budgets[e.Key]
	if budget != nil && priced.Amount > 0 {
		if err := budget.Reserve(e.At, priced.Amount); err != nil {
			p.Journal.Add(e, 0, "rejected")
			p.Done[e.GenerationID] = struct{}{}
			return nil
		}
	}
	if priced.Amount > 0 {
		if err := p.Ledger.Authorize(e.Account, e.GenerationID, e.Model, priced.Amount, e.At); err != nil {
			if budget != nil {
				budget.Release(priced.Amount)
			}
			return err
		}
	}
	if e.Status != "ok" {
		_ = p.Ledger.Release(e.Account, e.GenerationID)
		if budget != nil && priced.Amount > 0 {
			budget.Release(priced.Amount)
		}
		p.Journal.Add(e, 0, e.Status)
		p.Done[e.GenerationID] = struct{}{}
		return nil
	}
	if err := p.Ledger.Capture(e.Account, e.GenerationID, priced.Amount); err != nil {
		return err
	}
	if budget != nil && priced.Amount > 0 {
		budget.Capture(priced.Amount, priced.Amount)
	}
	p.Journal.Add(e, priced.Amount, "ok")
	p.Done[e.GenerationID] = struct{}{}
	return nil
}
