// Command sftp-fixture is a stand-in file server for the browser tests and
// for trying the console's auto import by hand: an SFTP server in memory, with
// a couple of videos already in its inbox. Never deployed.
//
//	SFTP_FIXTURE_ADDR=127.0.0.1:2222 go run ./cmd/sftp-fixture
//
// It signs in as remotetest.Username with remotetest.Password.
package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/shadowline/server/internal/remote/remotetest"
)

func main() {
	addr := os.Getenv("SFTP_FIXTURE_ADDR")
	if addr == "" {
		addr = "127.0.0.1:2222"
	}
	s, err := remotetest.StartSFTP(addr)
	if err != nil {
		log.Fatal(err)
	}
	for file, body := range map[string]string{
		"/inbox/Friends S1/Episode_01.mp4": "a video",
		"/inbox/loose.mov":                 "another video",
	} {
		if err := s.Put(file, body); err != nil {
			log.Fatal(err)
		}
	}
	fmt.Printf("sftp fixture on %s as %s, host key %s\n", s.Addr, remotetest.Username, s.HostKey)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	s.Close()
}
