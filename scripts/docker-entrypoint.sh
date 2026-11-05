#!/bin/sh
set -eu

node --import tsx scripts/docker-init.ts
exec "$@"
