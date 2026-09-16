// Package auth turns a Google identity into a session cookie, and decides admin
// rights from configuration rather than from anything the browser sends.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Signer holds the server secret. It signs the OAuth state parameter and the
// disk-storage URLs; session ids are random rather than signed, because they are
// looked up in the database anyway.
type Signer struct{ key []byte }

func NewSigner(secret string) *Signer { return &Signer{key: []byte(secret)} }

func (s *Signer) mac(parts ...string) string {
	h := hmac.New(sha256.New, s.key)
	for _, p := range parts {
		// Length-prefixed so ("ab","c") and ("a","bc") do not sign the same.
		fmt.Fprintf(h, "%d:%s", len(p), p)
	}
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

// SignPath produces the query string Disk storage appends to a file URL.
func (s *Signer) SignPath(bucket, key string, expires time.Time) string {
	exp := strconv.FormatInt(expires.Unix(), 10)
	return "expires=" + exp + "&sig=" + s.mac("file", bucket, key, exp)
}

// VerifyPath checks a signature produced by SignPath and that it has not aged
// out. Comparison is constant-time via hmac.Equal.
func (s *Signer) VerifyPath(bucket, key, exp, sig string) bool {
	unix, err := strconv.ParseInt(exp, 10, 64)
	if err != nil || time.Now().After(time.Unix(unix, 0)) {
		return false
	}
	return hmac.Equal([]byte(sig), []byte(s.mac("file", bucket, key, exp)))
}

// SignState binds the OAuth state parameter to this server and an expiry, so a
// callback cannot be replayed with a state the server never issued.
func (s *Signer) SignState(nonce string, expires time.Time) string {
	exp := strconv.FormatInt(expires.Unix(), 10)
	return nonce + "." + exp + "." + s.mac("state", nonce, exp)
}

func (s *Signer) VerifyState(state string) bool {
	nonce, rest, ok := strings.Cut(state, ".")
	if !ok {
		return false
	}
	exp, sig, ok := strings.Cut(rest, ".")
	if !ok {
		return false
	}
	unix, err := strconv.ParseInt(exp, 10, 64)
	if err != nil || time.Now().After(time.Unix(unix, 0)) {
		return false
	}
	return hmac.Equal([]byte(sig), []byte(s.mac("state", nonce, exp)))
}

// RandomID returns a URL-safe random string with 256 bits of entropy, used for
// session ids, OAuth nonces and PKCE verifiers.
func RandomID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
