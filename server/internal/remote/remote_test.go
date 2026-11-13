package remote_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/shadowline/server/internal/remote"
	"github.com/shadowline/server/internal/remote/remotetest"
)

func serve(t *testing.T) *remotetest.SFTPServer {
	t.Helper()
	s, err := remotetest.StartSFTP("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func config(s *remotetest.SFTPServer) remote.Config {
	return remote.Config{Protocol: remote.SFTP, Host: s.Host, Port: s.Port, Username: remotetest.Username,
		Password: remotetest.Password, HostKey: s.HostKey, Timeout: 5 * time.Second}
}

func TestAnSFTPServerIsOnlyTrustedByItsKey(t *testing.T) {
	s := serve(t)
	c := config(s)

	c.HostKey = ""
	_, err := remote.Dial(context.Background(), c)
	var unknown *remote.UnknownHostKeyError
	if !errors.As(err, &unknown) || unknown.Fingerprint != s.HostKey || remote.Classify(err) != remote.UnknownKey {
		t.Fatalf("an untrusted server: %v", err)
	}
	c.HostKey = "SHA256:somebody-else"
	if _, err := remote.Dial(context.Background(), c); remote.Classify(err) != remote.KeyMismatch {
		t.Fatalf("a different key: %v", err)
	}
	c = config(s)
	c.Password = "wrong"
	if _, err := remote.Dial(context.Background(), c); remote.Classify(err) != remote.BadLogin {
		t.Fatalf("a wrong password: %v (%s)", err, remote.Classify(err))
	}
	c = config(s)
	c.Port = 1
	if _, err := remote.Dial(context.Background(), c); remote.Classify(err) != remote.Unreachable {
		t.Fatalf("nothing listening: %v (%s)", err, remote.Classify(err))
	}
}

func TestFilesComeAndGoOverSFTP(t *testing.T) {
	s := serve(t)
	if err := s.Put("/inbox/Talks/one.mp4", "video bytes"); err != nil {
		t.Fatal(err)
	}
	r, err := remote.Dial(context.Background(), config(s))
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()

	entries, err := r.List("/inbox")
	if err != nil || len(entries) != 1 || !entries[0].Dir || entries[0].Name != "Talks" {
		t.Fatalf("the inbox: %+v %v", entries, err)
	}
	inner, _ := r.List("/inbox/Talks")
	if len(inner) != 1 || inner[0].Size != int64(len("video bytes")) || inner[0].Path != "/inbox/Talks/one.mp4" {
		t.Fatalf("the series: %+v", inner)
	}
	if err := r.MkdirAll("/processing/Talks"); err != nil {
		t.Fatal(err)
	}
	if err := r.Rename("/inbox/Talks/one.mp4", "/processing/Talks/one.mp4"); err != nil {
		t.Fatal(err)
	}
	f, err := r.Open("/processing/Talks/one.mp4")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(f)
	f.Close()
	if string(body) != "video bytes" {
		t.Fatalf("read %q", body)
	}
	if err := r.Put("/processing/Talks/one.mp4.txt", strings.NewReader("why")); err != nil {
		t.Fatal(err)
	}
	if err := r.Remove("/processing/Talks/one.mp4.txt"); err != nil {
		t.Fatal(err)
	}
	if s.Exists("/inbox/Talks/one.mp4") || !s.Exists("/processing/Talks/one.mp4") || s.Exists("/processing/Talks/one.mp4.txt") {
		t.Fatal("the files are not where they were put")
	}
	if _, err := r.List("/nowhere"); remote.Classify(err) != remote.NoSuchFolder {
		t.Fatalf("a missing folder: %v (%s)", err, remote.Classify(err))
	}
}
