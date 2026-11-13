package secretbox

import (
	"bytes"
	"errors"
	"testing"
)

func TestASecretComesBackOnlyWithItsKey(t *testing.T) {
	box, err := New("a-session-secret-of-at-least-32-chars", "remote-import")
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := box.Seal("hunter2")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, []byte("hunter2")) {
		t.Fatal("the secret is in the sealed bytes")
	}
	if got, err := box.Open(sealed); err != nil || got != "hunter2" {
		t.Fatalf("opened %q, %v", got, err)
	}
	again, _ := box.Seal("hunter2")
	if bytes.Equal(again, sealed) {
		t.Fatal("the same secret sealed twice looks the same")
	}

	other, _ := New("another-session-secret-of-32-chars!!", "remote-import")
	if _, err := other.Open(sealed); !errors.Is(err, ErrOpen) {
		t.Fatalf("another server's key opened it: %v", err)
	}
	purpose, _ := New("a-session-secret-of-at-least-32-chars", "something-else")
	if _, err := purpose.Open(sealed); !errors.Is(err, ErrOpen) {
		t.Fatalf("another purpose's key opened it: %v", err)
	}
	if _, err := box.Open([]byte("x")); !errors.Is(err, ErrOpen) {
		t.Fatalf("a short box opened: %v", err)
	}
}
