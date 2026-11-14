package remote_test

import (
	"context"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/shadowline/server/internal/remote"
)

// FTPS needs a real server to talk TLS with, which Go's standard library has
// no stand-in for. Run one and point FTPS_TEST_ADDR at it, with a user
// "shadow" / "line-of-sight" whose home holds inbox/Talks/one.mp4 — for
// example pyftpdlib's TLS_FTPHandler with a self-signed certificate.
func ftpsConfig(t *testing.T) remote.Config {
	t.Helper()
	addr := os.Getenv("FTPS_TEST_ADDR")
	if addr == "" {
		t.Skip("set FTPS_TEST_ADDR to an FTPS server to run this")
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := strconv.Atoi(port)
	return remote.Config{Protocol: remote.FTPS, Host: host, Port: n, Username: "shadow", Password: "line-of-sight",
		TLSMode: remote.Explicit, TLSSkipVerify: true, Timeout: 5 * time.Second}
}

func TestFilesComeAndGoOverFTPS(t *testing.T) {
	c := ftpsConfig(t)
	r, err := remote.Dial(context.Background(), c)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	inner, err := r.List("/inbox/Talks")
	if err != nil || len(inner) != 1 || inner[0].Name != "one.mp4" || inner[0].Dir {
		t.Fatalf("the series: %+v %v", inner, err)
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
	if !strings.HasPrefix(string(body), "a video") {
		t.Fatalf("read %q", body)
	}
	if err := r.Put("/processing/Talks/one.mp4.txt", strings.NewReader("why")); err != nil {
		t.Fatal(err)
	}
	if err := r.Remove("/processing/Talks/one.mp4.txt"); err != nil {
		t.Fatal(err)
	}
	// Put back, for the next run.
	if err := r.Rename("/processing/Talks/one.mp4", "/inbox/Talks/one.mp4"); err != nil {
		t.Fatal(err)
	}
}

func TestFTPSSaysWhatIsWrong(t *testing.T) {
	c := ftpsConfig(t)
	wrong := c
	wrong.Password = "nope"
	if _, err := remote.Dial(context.Background(), wrong); remote.Classify(err) != remote.BadLogin {
		t.Fatalf("a wrong password: %v (%s)", err, remote.Classify(err))
	}
	checked := c
	checked.TLSSkipVerify = false
	if _, err := remote.Dial(context.Background(), checked); remote.Classify(err) != remote.BadTLS {
		t.Fatalf("a self-signed certificate checked: %v (%s)", err, remote.Classify(err))
	}
}
