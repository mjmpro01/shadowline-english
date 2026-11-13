// Package secretbox seals the few secrets the server has to keep and use
// again — the password or key it signs in to a remote file server with — so a
// copy of the database alone does not give them away.
//
// The key comes from SESSION_SECRET, which lives in the server's environment
// and not in the database. Changing SESSION_SECRET leaves what was sealed
// unreadable: the secret then has to be entered again.
package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"

	"golang.org/x/crypto/hkdf"
)

// ErrOpen is a sealed secret that cannot be opened with this key: sealed under
// another SESSION_SECRET, or damaged.
var ErrOpen = errors.New("the stored secret cannot be read with this server's key — enter it again")

// Box seals and opens secrets for one purpose.
type Box struct {
	aead cipher.AEAD
}

// New is a box whose key is derived from the server's secret for a purpose: a
// different purpose gets a different key from the same secret.
func New(serverSecret, purpose string) (*Box, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(hkdf.New(sha256.New, []byte(serverSecret), nil, []byte(purpose)), key); err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

// Seal is the secret encrypted, with its nonce in front.
func (b *Box) Seal(plain string) ([]byte, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return b.aead.Seal(nonce, nonce, []byte(plain), nil), nil
}

// Open is the secret back.
func (b *Box) Open(sealed []byte) (string, error) {
	n := b.aead.NonceSize()
	if len(sealed) < n {
		return "", ErrOpen
	}
	plain, err := b.aead.Open(nil, sealed[:n], sealed[n:], nil)
	if err != nil {
		return "", ErrOpen
	}
	return string(plain), nil
}
