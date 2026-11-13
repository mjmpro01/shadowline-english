package api

import (
	"context"
	"fmt"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/importer"
	"github.com/shadowline/server/internal/remote"
	"github.com/shadowline/server/internal/secretbox"
	"github.com/shadowline/server/internal/store"
)

// The file server videos are imported from, as the console sets it up: read,
// saved, and tested before saving.

// importSettingsBody is the console's form. Secret is the password or private
// key as typed; empty keeps the one saved.
type importSettingsBody struct {
	Protocol      string `json:"protocol"`
	Host          string `json:"host"`
	Port          int    `json:"port"`
	Username      string `json:"username"`
	SecretKind    string `json:"secretKind"`
	Secret        string `json:"secret"`
	TLSMode       string `json:"tlsMode"`
	TLSSkipVerify bool   `json:"tlsSkipVerify"`
	HostKey       string `json:"hostKey"`
	Inbox         string `json:"inbox"`
	Processing    string `json:"processing"`
	Done          string `json:"done"`
	Failed        string `json:"failed"`
	DefaultSeries string `json:"defaultSeries"`
	PollSeconds   int    `json:"pollSeconds"`
}

// testTimeout is how long the connection test may take, inside the minute
// every admin request has.
const testTimeout = 45 * time.Second

func (s *Server) importBox() (*secretbox.Box, error) {
	return secretbox.New(s.Cfg.SessionSecret, importer.SecretPurpose)
}

// clean trims the form and says what is wrong with it, if anything.
func (b *importSettingsBody) clean() string {
	b.Host = strings.TrimSpace(b.Host)
	// A host pasted as an address is taken for its host.
	for _, scheme := range []string{"sftp://", "ftps://", "ftp://", "ssh://"} {
		b.Host = strings.TrimPrefix(b.Host, scheme)
	}
	b.Host = strings.TrimSuffix(b.Host, "/")
	b.Username = strings.TrimSpace(b.Username)
	b.HostKey = strings.TrimSpace(b.HostKey)
	b.DefaultSeries = strings.TrimSpace(b.DefaultSeries)
	if b.SecretKind == "" {
		b.SecretKind = "password"
	}
	if b.TLSMode == "" {
		b.TLSMode = remote.Explicit
	}
	switch {
	case b.Protocol != remote.SFTP && b.Protocol != remote.FTPS:
		return "the protocol is SFTP or FTPS"
	case b.Host == "" || strings.ContainsAny(b.Host, " /"):
		return "the host is a name or an address, like files.example.com"
	case b.Port < 1 || b.Port > 65535:
		return "the port is a number from 1 to 65535"
	case b.Username == "":
		return "a username is needed"
	case b.SecretKind != "password" && b.SecretKind != "key":
		return "sign in with a password or a private key"
	case b.SecretKind == "key" && b.Protocol != remote.SFTP:
		return "only SFTP signs in with a private key"
	case b.TLSMode != remote.Explicit && b.TLSMode != remote.Implicit:
		return "FTPS is explicit or implicit TLS"
	case b.DefaultSeries == "" || len([]rune(b.DefaultSeries)) > 120:
		return "the default series needs a name"
	case b.PollSeconds < 60 || b.PollSeconds > 86400:
		return "the importer looks every 1 minute to 24 hours"
	}
	folders := []*string{&b.Inbox, &b.Processing, &b.Done, &b.Failed}
	seen := map[string]bool{}
	for _, f := range folders {
		*f = path.Clean("/" + strings.TrimSpace(*f))
		if *f == "/" {
			return "each folder needs its own path, not the server's top"
		}
		if seen[*f] {
			return "the four folders have to be different"
		}
		seen[*f] = true
	}
	// A folder inside the inbox would be read as a series of its own.
	for _, f := range folders[1:] {
		if strings.HasPrefix(*f+"/", b.Inbox+"/") {
			return "processing, done and failed cannot be inside the inbox"
		}
	}
	return ""
}

func (b importSettingsBody) settings() store.ImportSettings {
	return store.ImportSettings{
		Protocol: b.Protocol, Host: b.Host, Port: b.Port, Username: b.Username, SecretKind: b.SecretKind,
		TLSMode: b.TLSMode, TLSSkipVerify: b.TLSSkipVerify, HostKey: b.HostKey,
		Inbox: b.Inbox, Processing: b.Processing, Done: b.Done, Failed: b.Failed,
		DefaultSeries: b.DefaultSeries, PollSeconds: b.PollSeconds,
	}
}

// sameServer is whether the form is for the server the saved secret belongs
// to: the saved password is only ever sent where it was set up to go.
func sameServer(b importSettingsBody, saved *store.ImportSettings) bool {
	return saved != nil && saved.HasSecret && saved.Protocol == b.Protocol &&
		strings.EqualFold(saved.Host, b.Host) && saved.Port == b.Port &&
		saved.Username == b.Username && saved.SecretKind == b.SecretKind
}

// handleImportSettings is the file server as set up, without its secret; null
// before anyone has.
func (s *Server) handleImportSettings(w http.ResponseWriter, r *http.Request) {
	saved, err := s.Store.ImportSettings(r.Context())
	if err != nil {
		s.failErr(w, err, "import settings")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleSaveImportSettings(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body importSettingsBody
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if why := body.clean(); why != "" {
		failCode(w, http.StatusBadRequest, "import.invalid", why)
		return
	}
	saved, err := s.Store.ImportSettings(r.Context())
	if err != nil {
		s.failErr(w, err, "import settings")
		return
	}
	var sealed []byte
	switch {
	case body.Secret != "":
		box, err := s.importBox()
		if err != nil {
			s.failErr(w, err, "seal the import secret")
			return
		}
		if sealed, err = box.Seal(body.Secret); err != nil {
			s.failErr(w, err, "seal the import secret")
			return
		}
	case !sameServer(body, saved):
		failCode(w, http.StatusBadRequest, "import.noSecret", "enter the password or key for this server")
		return
	}
	if body.Protocol == remote.SFTP && body.HostKey == "" {
		failCode(w, http.StatusBadRequest, "import.noHostKey", "test the connection and trust the server's host key before saving")
		return
	}
	if err := s.Store.SaveImportSettings(r.Context(), body.settings(), sealed, u.ID); err != nil {
		s.failErr(w, err, "save import settings")
		return
	}
	after, err := s.Store.ImportSettings(r.Context())
	if err != nil {
		s.failErr(w, err, "import settings")
		return
	}
	writeJSON(w, http.StatusOK, after)
}

// handleTestImport tries the form as it is, saved or not: connects, signs in,
// reads the inbox, and checks the other folders can be written in.
func (s *Server) handleTestImport(w http.ResponseWriter, r *http.Request) {
	var body importSettingsBody
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if why := body.clean(); why != "" {
		failCode(w, http.StatusBadRequest, "import.invalid", why)
		return
	}
	config := remote.Config{
		Protocol: body.Protocol, Host: body.Host, Port: body.Port, Username: body.Username,
		TLSMode: body.TLSMode, TLSSkipVerify: body.TLSSkipVerify, HostKey: body.HostKey,
		Timeout: 15 * time.Second,
	}
	secret := body.Secret
	if secret == "" {
		saved, err := s.Store.ImportSettings(r.Context())
		if err != nil {
			s.failErr(w, err, "import settings")
			return
		}
		if !sameServer(body, saved) {
			failCode(w, http.StatusBadRequest, "import.noSecret", "enter the password or key for this server")
			return
		}
		box, err := s.importBox()
		if err != nil {
			s.failErr(w, err, "open the import secret")
			return
		}
		if secret, err = box.Open(saved.Secret); err != nil {
			failCode(w, http.StatusBadRequest, "import.noSecret", err.Error())
			return
		}
	}
	if body.SecretKind == "key" {
		config.PrivateKey = secret
	} else {
		config.Password = secret
	}
	dial := s.DialRemote
	if dial == nil {
		dial = remote.Dial
	}
	ctx, cancel := context.WithTimeout(r.Context(), testTimeout)
	defer cancel()
	report := importer.Check(ctx, dial, config, importer.Folders{
		Inbox: body.Inbox, Processing: body.Processing, Done: body.Done, Failed: body.Failed,
		DefaultSeries: body.DefaultSeries,
	})
	s.Log.Info("import connection tested", "host", body.Host, "protocol", body.Protocol, "ok", report.OK,
		"steps", fmt.Sprint(len(report.Steps)))
	writeJSON(w, http.StatusOK, report)
}
