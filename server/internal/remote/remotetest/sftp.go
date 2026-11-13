// Package remotetest runs a real SFTP server in memory, for tests and for the
// browser tests' stand-in file server: the same SSH handshake, host key check
// and SFTP commands as a real server, with nothing on disk.
package remotetest

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"io"
	"net"
	"path"
	"sync"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// Username and Password sign in to the server.
const (
	Username = "shadow"
	Password = "line-of-sight"
)

// SFTPServer is an SFTP server listening on Addr.
type SFTPServer struct {
	Addr     string
	Host     string
	Port     int
	HostKey  string // its key's fingerprint, "SHA256:…"
	listener net.Listener
	handlers sftp.Handlers
	wg       sync.WaitGroup
}

// hostSeed makes the host key the same on every run, so a fingerprint can be
// written into a test.
var hostSeed = []byte("shadowline-remotetest-host-key!!")

// StartSFTP listens on addr ("127.0.0.1:0" for any free port) and serves
// until Close.
func StartSFTP(addr string) (*SFTPServer, error) {
	signer, err := ssh.NewSignerFromKey(ed25519.NewKeyFromSeed(hostSeed))
	if err != nil {
		return nil, err
	}
	config := &ssh.ServerConfig{
		PasswordCallback: func(c ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			if c.User() == Username && string(pass) == Password {
				return nil, nil
			}
			return nil, errors.New("password rejected")
		},
	}
	config.AddHostKey(signer)
	l, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	at := l.Addr().(*net.TCPAddr)
	s := &SFTPServer{
		Addr: l.Addr().String(), Host: at.IP.String(), Port: at.Port,
		HostKey:  ssh.FingerprintSHA256(signer.PublicKey()),
		listener: l, handlers: sftp.InMemHandler(),
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}
			go s.serve(conn, config)
		}
	}()
	return s, nil
}

func (s *SFTPServer) serve(conn net.Conn, config *ssh.ServerConfig) {
	defer conn.Close()
	_, chans, reqs, err := ssh.NewServerConn(conn, config)
	if err != nil {
		return
	}
	go ssh.DiscardRequests(reqs)
	for nc := range chans {
		if nc.ChannelType() != "session" {
			_ = nc.Reject(ssh.UnknownChannelType, "only sessions")
			continue
		}
		ch, requests, err := nc.Accept()
		if err != nil {
			return
		}
		go func() {
			for req := range requests {
				ok := req.Type == "subsystem" && len(req.Payload) > 4 && string(req.Payload[4:]) == "sftp"
				_ = req.Reply(ok, nil)
				if ok {
					server := sftp.NewRequestServer(ch, s.handlers)
					_ = server.Serve()
					server.Close()
					return
				}
			}
		}()
	}
}

// Put writes a file, making its folders, as if someone had uploaded it.
func (s *SFTPServer) Put(file string, body string) error {
	return s.with(func(c *sftp.Client) error {
		if err := c.MkdirAll(path.Dir(file)); err != nil {
			return err
		}
		f, err := c.Create(file)
		if err != nil {
			return err
		}
		if _, err := io.WriteString(f, body); err != nil {
			return err
		}
		return f.Close()
	})
}

// Mkdir makes a folder and those above it.
func (s *SFTPServer) Mkdir(dir string) error {
	return s.with(func(c *sftp.Client) error { return c.MkdirAll(dir) })
}

// Exists is whether a file or folder is there.
func (s *SFTPServer) Exists(p string) bool {
	err := s.with(func(c *sftp.Client) error { _, err := c.Stat(p); return err })
	return err == nil
}

func (s *SFTPServer) with(fn func(*sftp.Client) error) error {
	conn, err := ssh.Dial("tcp", s.Addr, &ssh.ClientConfig{
		User:            Username,
		Auth:            []ssh.AuthMethod{ssh.Password(Password)},
		HostKeyCallback: ssh.FixedHostKey(mustPublic()),
	})
	if err != nil {
		return err
	}
	defer conn.Close()
	c, err := sftp.NewClient(conn)
	if err != nil {
		return err
	}
	defer c.Close()
	return fn(c)
}

func mustPublic() ssh.PublicKey {
	signer, err := ssh.NewSignerFromKey(ed25519.NewKeyFromSeed(hostSeed))
	if err != nil {
		panic(fmt.Sprint("remotetest host key: ", err))
	}
	return signer.PublicKey()
}

// Close stops listening.
func (s *SFTPServer) Close() error {
	err := s.listener.Close()
	s.wg.Wait()
	return err
}
