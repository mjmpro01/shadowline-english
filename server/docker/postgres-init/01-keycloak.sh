#!/bin/bash
# Runs once on first Postgres volume init. Keycloak needs its own database
# beside shadowline on the same server.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
	SELECT 'CREATE DATABASE keycloak'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
EOSQL
