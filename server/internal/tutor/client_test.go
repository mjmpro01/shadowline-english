package tutor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeRouter answers the way 9router does: an OpenAI-compatible
// /chat/completions that streams server-sent events.
func fakeRouter(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return &Client{BaseURL: server.URL + "/v1", APIKey: "sk-test", Model: "cc/claude-sonnet-4-5"}
}

func stream(w http.ResponseWriter, pieces ...string) {
	w.Header().Set("Content-Type", "text/event-stream")
	for _, piece := range pieces {
		raw, _ := json.Marshal(map[string]any{
			"choices": []any{map[string]any{"delta": map[string]string{"content": piece}}},
		})
		fmt.Fprintf(w, "data: %s\n\n", raw)
		w.(http.Flusher).Flush()
	}
	fmt.Fprint(w, "data: [DONE]\n\n")
}

func collect(t *testing.T, c *Client) (string, error) {
	t.Helper()
	var got strings.Builder
	err := c.Stream(context.Background(), []Message{{Role: "user", Content: "hi"}}, func(d string) error {
		got.WriteString(d)
		return nil
	})
	return got.String(), err
}

func TestStreamSendsWhatTheRouterExpects(t *testing.T) {
	var seen struct {
		path, auth string
		body       map[string]any
	}
	c := fakeRouter(t, func(w http.ResponseWriter, r *http.Request) {
		seen.path = r.URL.Path
		seen.auth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&seen.body)
		stream(w, "ok")
	})
	if _, err := collect(t, c); err != nil {
		t.Fatalf("stream: %v", err)
	}
	if seen.path != "/v1/chat/completions" {
		t.Fatalf("asked %s, want /v1/chat/completions", seen.path)
	}
	if seen.auth != "Bearer sk-test" {
		t.Fatalf("Authorization %q — 9router takes the key as a bearer token", seen.auth)
	}
	if seen.body["model"] != "cc/claude-sonnet-4-5" || seen.body["stream"] != true {
		t.Fatalf("body %v — the model is the router's id, and the answer should stream", seen.body)
	}
	if seen.body["max_tokens"] == nil {
		t.Fatal("no cap on the length of an answer, which is a cap on its cost")
	}
}

func TestStreamHandsOverEachPieceInOrder(t *testing.T) {
	c := fakeRouter(t, func(w http.ResponseWriter, r *http.Request) {
		stream(w, "Stress ", "the ", "**second** ", "syllable.")
	})
	got, err := collect(t, c)
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	if got != "Stress the **second** syllable." {
		t.Fatalf("got %q", got)
	}
}

// Some routers answer a streaming request with one ordinary body when the
// provider behind them cannot stream.
func TestAWholeAnswerIsAcceptedToo(t *testing.T) {
	c := fakeRouter(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"role":"assistant","content":"All at once."}}]}`)
	})
	got, err := collect(t, c)
	if err != nil || got != "All at once." {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestARefusalIsAnUpstreamError(t *testing.T) {
	c := fakeRouter(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"invalid api key"}}`, http.StatusUnauthorized)
	})
	_, err := collect(t, c)
	if !errors.Is(err, ErrUpstream) {
		t.Fatalf("err %v, want ErrUpstream", err)
	}
	if !strings.Contains(err.Error(), "invalid api key") {
		t.Fatalf("err %q lost the router's own reason, which is what the log needs", err)
	}
}

func TestAnErrorPartWayThroughIsReported(t *testing.T) {
	c := fakeRouter(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, `data: {"choices":[{"delta":{"content":"Half"}}]}`+"\n\n")
		fmt.Fprint(w, `data: {"error":{"message":"provider quota exhausted"}}`+"\n\n")
	})
	got, err := collect(t, c)
	if got != "Half" || !errors.Is(err, ErrUpstream) {
		t.Fatalf("got %q, %v — the half that arrived, then the failure", got, err)
	}
}

func TestClosingTheChatStopsTheRequest(t *testing.T) {
	c := fakeRouter(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, `data: {"choices":[{"delta":{"content":"one"}}]}`+"\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- c.Stream(ctx, []Message{{Role: "user", Content: "hi"}}, func(string) error {
			cancel()
			return nil
		})
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the request kept running after the learner left — and kept being paid for")
	}
}

func TestSystemCarriesTheRealMeasurements(t *testing.T) {
	best := 71.4
	msg := System(&Clip{Title: "Clip 3", Line: "I'll be there for you", IPA: "/aɪl bi ðɛr/"},
		&Practice{
			Takes:   2,
			Best:    &best,
			Latest:  map[string]float64{"Stress": 42, "Intonation": 80},
			Unheard: []string{"there"},
		})
	for _, want := range []string{
		`"I'll be there for you"`,
		"/aɪl bi ðɛr/",
		"Best overall score: 71",
		// Sorted, so the same numbers make the same prompt.
		"Latest recording: Intonation 80, Stress 42",
		"Words not heard in the latest recording: there",
	} {
		if !strings.Contains(msg.Content, want) {
			t.Errorf("system prompt is missing %q", want)
		}
	}
	if msg.Role != "system" {
		t.Fatalf("role %q", msg.Role)
	}
}

func TestSystemSaysSoWhenThereIsNothingMeasured(t *testing.T) {
	msg := System(&Clip{Title: "Clip 1", Line: "Hello"}, &Practice{})
	if !strings.Contains(msg.Content, "no scored recording of this line yet") {
		t.Fatal("with no takes the tutor should be told there are none, not left to guess")
	}
	general := System(nil, nil)
	if strings.Contains(general.Content, "\n\nCurrent clip\n") {
		t.Fatal("a general question carried a clip block")
	}
}

func TestTheLimiterCountsAWindowPerLearner(t *testing.T) {
	l := &Limiter{Max: 2, Window: time.Minute}
	one, two := uuid.New(), uuid.New()
	now := time.Unix(1_000_000, 0)

	for i := 0; i < 2; i++ {
		if ok, _ := l.Allow(one, now); !ok {
			t.Fatalf("message %d refused inside the allowance", i+1)
		}
	}
	ok, wait := l.Allow(one, now.Add(10*time.Second))
	if ok {
		t.Fatal("a third message inside the window was allowed")
	}
	if wait != 50*time.Second {
		t.Fatalf("told to wait %s, want 50s — until the first message leaves the window", wait)
	}
	// Somebody else is not held to it.
	if ok, _ := l.Allow(two, now); !ok {
		t.Fatal("one learner's allowance was spent by another")
	}
	// And the window moves on.
	if ok, _ := l.Allow(one, now.Add(61*time.Second)); !ok {
		t.Fatal("still refused once the window had passed")
	}
}
