package remote

import (
	"context"
	"crypto/tls"
	"io"
	"strings"

	"github.com/jlaffaye/ftp"
)

type ftpsRemote struct {
	conn *ftp.ServerConn
}

func dialFTPS(ctx context.Context, c Config) (Remote, error) {
	tlsConfig := &tls.Config{
		ServerName:         c.Host,
		InsecureSkipVerify: c.TLSSkipVerify,
		MinVersion:         tls.VersionTLS12,
		// Many servers (vsftpd's require_ssl_reuse) want the data connection
		// to resume the control connection's TLS session.
		ClientSessionCache: tls.NewLRUClientSessionCache(4),
	}
	options := []ftp.DialOption{ftp.DialWithContext(ctx), ftp.DialWithTimeout(c.timeout())}
	if c.TLSMode == Implicit {
		options = append(options, ftp.DialWithTLS(tlsConfig))
	} else {
		options = append(options, ftp.DialWithExplicitTLS(tlsConfig))
	}
	conn, err := ftp.Dial(c.addr(), options...)
	if err != nil {
		return nil, err
	}
	if err := conn.Login(c.Username, c.Password); err != nil {
		conn.Quit()
		return nil, err
	}
	return &ftpsRemote{conn: conn}, nil
}

func (r *ftpsRemote) List(dir string) ([]Entry, error) {
	entries, err := r.conn.List(dir)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(entries))
	for _, e := range entries {
		if e.Name == "." || e.Name == ".." || e.Type == ftp.EntryTypeLink {
			continue
		}
		out = append(out, Entry{Path: Join(dir, e.Name), Name: e.Name, Size: int64(e.Size), Dir: e.Type == ftp.EntryTypeFolder})
	}
	return out, nil
}

func (r *ftpsRemote) Open(file string) (io.ReadCloser, error) { return r.conn.Retr(file) }

func (r *ftpsRemote) Put(file string, src io.Reader) error { return r.conn.Stor(file, src) }

func (r *ftpsRemote) Rename(from, to string) error {
	// FTP's rename does not replace on every server: clear the way first.
	_ = r.conn.Delete(to)
	return r.conn.Rename(from, to)
}

func (r *ftpsRemote) Remove(file string) error { return r.conn.Delete(file) }

// MkdirAll makes each folder on the way that is not there. FTP has no "make
// if missing", so a failure is only an error when the folder is not there
// after.
func (r *ftpsRemote) MkdirAll(dir string) error {
	parts := strings.Split(strings.Trim(dir, "/"), "/")
	at := ""
	if strings.HasPrefix(dir, "/") {
		at = "/"
	}
	for _, p := range parts {
		if p == "" {
			continue
		}
		at = Join(at, p)
		if err := r.conn.MakeDir(at); err != nil {
			if _, listErr := r.conn.List(at); listErr != nil {
				return err
			}
		}
	}
	return nil
}

func (r *ftpsRemote) Close() error { return r.conn.Quit() }
