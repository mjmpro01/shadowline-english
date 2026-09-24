// Package tutor talks to the language model behind the learner's chat.
//
// Any OpenAI-compatible chat endpoint will do. The deployment this was written
// for uses 9router, which exposes one at /v1/chat/completions and routes each
// request to whichever provider is behind the model name — `cc/claude-…`,
// `glm/…`, or a combo alias configured in its dashboard. Nothing here knows
// which; it speaks the wire format and streams what comes back.
package tutor

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Message is one turn of the conversation, in the wire format's own shape.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Client is one configured endpoint, key and model.
type Client struct {
	BaseURL string
	APIKey  string
	Model   string
	HTTP    *http.Client
}

// defaultHTTP has no overall timeout: an answer streams for as long as it
// streams, and the caller's context is what ends it. The transport still gives
// up on an endpoint that never answers at all.
//
// A clone of the default transport, not a new one. A bare http.Transport{} has
// no Proxy function, so it ignores HTTPS_PROXY and dials the router directly —
// which on any network that only lets traffic out through a proxy means the
// tutor never answers, while curl from the same machine works fine. That is
// exactly how it was found.
var defaultHTTP = func() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 30 * time.Second
	return &http.Client{Transport: transport}
}()

// ErrUpstream is the model endpoint refusing or failing. The handler turns it
// into one sentence for the learner; the detail is for the log.
var ErrUpstream = errors.New("the tutor could not answer")

// replyBudget caps how long one answer can be. A tutor that writes an essay
// in reply to "what does this word mean" is worse, and dearer, than one that
// does not.
const replyBudget = 700

// Usage is what the endpoint said an answer cost, in tokens. Reported is false
// when it said nothing: a stream stopped before its last chunk, or a router
// that does not count.
type Usage struct {
	PromptTokens     int
	CompletionTokens int
	Reported         bool
}

// usageField is the `usage` object an OpenAI-compatible endpoint puts on the
// last chunk of a stream when asked to, and on a whole answer always.
type usageField struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
}

func (u *usageField) usage() Usage {
	if u == nil {
		return Usage{}
	}
	return Usage{PromptTokens: u.PromptTokens, CompletionTokens: u.CompletionTokens, Reported: true}
}

// Stream sends the conversation and calls onDelta with each piece of the
// answer as it arrives. It returns when the answer is complete, the context is
// cancelled — the learner closed the chat — or the endpoint fails, and with
// what the endpoint said the answer cost, when it said.
func (c *Client) Stream(ctx context.Context, messages []Message, onDelta func(string) error) (Usage, error) {
	body, err := json.Marshal(map[string]any{
		"model":       c.Model,
		"messages":    messages,
		"stream":      true,
		"max_tokens":  replyBudget,
		"temperature": 0.4,
		// The token counts, on the last chunk. Without this a streamed answer
		// has no cost attached, and the tutor's bill is a guess.
		"stream_options": map[string]bool{"include_usage": true},
	})
	if err != nil {
		return Usage{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(c.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Usage{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = defaultHTTP
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return Usage{}, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		detail, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return Usage{}, fmt.Errorf("%w: %s: %s", ErrUpstream, res.Status, strings.TrimSpace(string(detail)))
	}

	filter := &thinkFilter{emit: onDelta}

	// Some routers answer a streaming request with one ordinary JSON body when
	// the provider behind them cannot stream. Both shapes are handled rather
	// than assuming the one that was asked for.
	read := readEvents
	if !strings.HasPrefix(res.Header.Get("Content-Type"), "text/event-stream") {
		read = readWhole
	}
	usage, err := read(res.Body, filter.write)
	if err != nil {
		return usage, err
	}
	return usage, filter.flush()
}

// readEvents walks an SSE body: `data: {json}` lines, a blank line between
// events, and `data: [DONE]` at the end.
func readEvents(body io.Reader, onDelta func(string) error) (Usage, error) {
	scanner := bufio.NewScanner(body)
	// A single event can carry a long delta; the default 64K line is not a
	// limit anybody chose.
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	var usage *usageField
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			return usage.usage(), nil
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
			Usage *usageField `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// One malformed event is not worth losing the answer over.
			continue
		}
		if chunk.Error != nil {
			return usage.usage(), fmt.Errorf("%w: %s", ErrUpstream, chunk.Error.Message)
		}
		if chunk.Usage != nil {
			usage = chunk.Usage
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content == "" {
				continue
			}
			if err := onDelta(choice.Delta.Content); err != nil {
				return usage.usage(), err
			}
		}
	}
	return usage.usage(), scanner.Err()
}

func readWhole(body io.Reader, onDelta func(string) error) (Usage, error) {
	var whole struct {
		Choices []struct {
			Message Message `json:"message"`
		} `json:"choices"`
		Usage *usageField `json:"usage"`
	}
	if err := json.NewDecoder(io.LimitReader(body, 1<<20)).Decode(&whole); err != nil {
		return Usage{}, fmt.Errorf("%w: unreadable answer: %v", ErrUpstream, err)
	}
	if len(whole.Choices) == 0 || whole.Choices[0].Message.Content == "" {
		return whole.Usage.usage(), fmt.Errorf("%w: an empty answer", ErrUpstream)
	}
	return whole.Usage.usage(), onDelta(whole.Choices[0].Message.Content)
}
