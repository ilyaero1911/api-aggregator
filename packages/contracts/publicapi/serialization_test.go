package publicapi_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/ilyaero1911/api-aggregator/packages/contracts/publicapi"
)

// The schema tests validate constraints; this test verifies that generated Go
// representations preserve multimodal unions, tools and optional zero values.
func TestCanonicalRoundTrip(t *testing.T) {
	cases := []string{
		`{"model":"mock/chat","messages":[{"role":"developer","content":"rules"},{"role":"user","content":"hello"}],"temperature":0,"stream":false,"store":false}`,
		`{"model":"mock/chat","messages":[{"role":"user","content":[{"type":"text","text":"caption"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AA=="}},{"type":"file","file":{"filename":"a.pdf","file_data":"AA=="}},{"type":"input_audio","input_audio":{"data":"AA==","format":"wav"}}]}]}`,
		`{"model":"mock/chat","messages":[{"role":"assistant","tool_calls":[{"id":"c1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},{"role":"tool","tool_call_id":"c1","content":"ok"}],"tool_choice":"auto","parallel_tool_calls":true,"stop":["end"],"reasoning":{"effort":"low"}}`,
	}
	for _, input := range cases {
		var typed publicapi.ChatCompletionRequest
		if err := json.Unmarshal([]byte(input), &typed); err != nil {
			t.Fatal(err)
		}
		output, err := json.Marshal(typed)
		if err != nil {
			t.Fatal(err)
		}
		var before, after any
		if err := json.Unmarshal([]byte(input), &before); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(output, &after); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Errorf("roundtrip changed payload\nbefore: %s\nafter: %s", input, output)
		}
	}
}
