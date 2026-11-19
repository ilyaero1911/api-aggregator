package gateway

import "net/http/httptest"

type recorderBox struct {
	w *httptest.ResponseRecorder
}

func newRecorder() recorderBox {
	return recorderBox{w: httptest.NewRecorder()}
}
