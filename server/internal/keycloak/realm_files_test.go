package keycloak_test

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The production realm (keycloak-prod/) is the development one (keycloak/)
// with the secret, the redirect URLs and the mail server read from the
// environment. A setting added to one and not the other would differ between a
// laptop and the server without anybody noticing, so the two are compared:
// with those fields put back to the development values, they must be equal.
func TestTheProductionRealmIsTheDevelopmentOneWithPlaceholders(t *testing.T) {
	dev := readRealm(t, "../../keycloak/shadowline-realm.json")
	prod := readRealm(t, "../../keycloak-prod/shadowline-realm.json")

	client := apiClient(t, prod)
	for field, want := range map[string]any{
		"secret":       "${KEYCLOAK_CLIENT_SECRET}",
		"redirectUris": []any{"${KEYCLOAK_REDIRECT_URL}", "${APP_ORIGIN}/login", "${APP_ORIGIN}/*"},
		"webOrigins":   []any{"${APP_ORIGIN}"},
	} {
		if !reflect.DeepEqual(client[field], want) {
			t.Errorf("production client %s = %v, want %v", field, client[field], want)
		}
		client[field] = apiClient(t, dev)[field]
	}
	smtp, _ := prod["smtpServer"].(map[string]any)
	for _, key := range []string{"host", "port", "from", "user", "password"} {
		if s, _ := smtp[key].(string); len(s) < 3 || s[:2] != "${" {
			t.Errorf("production smtpServer.%s = %q, want a placeholder", key, s)
		}
	}
	prod["smtpServer"] = dev["smtpServer"]

	if !reflect.DeepEqual(dev, prod) {
		t.Fatal("keycloak-prod/shadowline-realm.json differs from keycloak/shadowline-realm.json " +
			"in more than the secret, redirect URLs and mail server: change both")
	}
}

func readRealm(t *testing.T, path string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var realm map[string]any
	if err := json.Unmarshal(raw, &realm); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	return realm
}

func apiClient(t *testing.T, realm map[string]any) map[string]any {
	t.Helper()
	clients, _ := realm["clients"].([]any)
	for _, c := range clients {
		if m, ok := c.(map[string]any); ok && m["clientId"] == "shadowline-api" {
			return m
		}
	}
	t.Fatal("no shadowline-api client in the realm")
	return nil
}
