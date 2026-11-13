package remote

import (
	"context"
	"errors"
	"io"
	"net"
	"os"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type sftpRemote struct {
	conn   *ssh.Client
	client *sftp.Client
}

func dialSFTP(ctx context.Context, c Config) (Remote, error) {
	var auth []ssh.AuthMethod
	if c.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(c.PrivateKey))
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) && c.Password != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(c.PrivateKey), []byte(c.Password))
		}
		if err != nil {
			return nil, errors.New("the private key cannot be read: " + err.Error())
		}
		auth = append(auth, ssh.PublicKeys(signer))
	} else {
		auth = append(auth, ssh.Password(c.Password),
			// Some servers only take a password asked for interactively.
			ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range answers {
					answers[i] = c.Password
				}
				return answers, nil
			}))
	}
	config := &ssh.ClientConfig{
		User: c.Username,
		Auth: auth,
		HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
			seen := ssh.FingerprintSHA256(key)
			switch {
			case c.HostKey == "":
				return &UnknownHostKeyError{Fingerprint: seen}
			case c.HostKey != seen:
				return &HostKeyMismatchError{Seen: seen, Trusted: c.HostKey}
			}
			return nil
		},
		Timeout: c.timeout(),
	}

	dialer := net.Dialer{Timeout: c.timeout()}
	raw, err := dialer.DialContext(ctx, "tcp", c.addr())
	if err != nil {
		return nil, err
	}
	sc, chans, reqs, err := ssh.NewClientConn(raw, c.addr(), config)
	if err != nil {
		raw.Close()
		// The host key's own error, not ssh's wrapping of it.
		var unknown *UnknownHostKeyError
		var mismatch *HostKeyMismatchError
		if errors.As(err, &unknown) {
			return nil, unknown
		}
		if errors.As(err, &mismatch) {
			return nil, mismatch
		}
		return nil, err
	}
	conn := ssh.NewClient(sc, chans, reqs)
	client, err := sftp.NewClient(conn)
	if err != nil {
		conn.Close()
		return nil, err
	}
	return &sftpRemote{conn: conn, client: client}, nil
}

func (r *sftpRemote) List(dir string) ([]Entry, error) {
	infos, err := r.client.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(infos))
	for _, fi := range infos {
		out = append(out, Entry{Path: Join(dir, fi.Name()), Name: fi.Name(), Size: fi.Size(), Dir: fi.IsDir()})
	}
	return out, nil
}

func (r *sftpRemote) Open(file string) (io.ReadCloser, error) { return r.client.Open(file) }

func (r *sftpRemote) Put(file string, src io.Reader) error {
	f, err := r.client.OpenFile(file, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, src); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func (r *sftpRemote) Rename(from, to string) error {
	// POSIX rename replaces what is there, as FTP's does; plain SFTP rename
	// refuses to.
	if err := r.client.PosixRename(from, to); err != nil {
		return r.client.Rename(from, to)
	}
	return nil
}

func (r *sftpRemote) Remove(file string) error { return r.client.Remove(file) }

func (r *sftpRemote) MkdirAll(dir string) error { return r.client.MkdirAll(dir) }

func (r *sftpRemote) Close() error {
	r.client.Close()
	return r.conn.Close()
}
