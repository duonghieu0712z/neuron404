#!/bin/sh
set -eu

node dist/docker-init.js
exec "$@"
