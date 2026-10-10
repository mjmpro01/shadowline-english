#!/bin/sh
# Certbot deploy hook: certificates made with `certonly --webroot` are renewed
# on disk, but nginx keeps serving the old ones from memory until it reloads.
# Installed into /etc/letsencrypt/renewal-hooks/deploy/; see
# docs/deploy-prod.md, "nginx and certificates".
systemctl reload nginx
