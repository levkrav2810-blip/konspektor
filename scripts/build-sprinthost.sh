#!/usr/bin/env bash
# Собирает готовую к выкладке папку dist-sprinthost/: standalone-сборка Next.js + app.js для Passenger.
set -euo pipefail
cd "$(dirname "$0")/.."
NEXT_OUTPUT=standalone npm run build
rm -rf dist-sprinthost
cp -r .next/standalone dist-sprinthost
mkdir -p dist-sprinthost/.next
cp -r .next/static dist-sprinthost/.next/static
cp -r public dist-sprinthost/public
cp deploy/sprinthost/app.js dist-sprinthost/app.js
mkdir -p dist-sprinthost/tmp
echo "Готово: dist-sprinthost/ ($(du -sh dist-sprinthost | cut -f1))"
