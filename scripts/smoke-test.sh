#!/usr/bin/env bash
# Testa o endpoint de auth: envia um CPF e mostra a resposta.
set -euo pipefail
cd "$(dirname "$0")/../terraform"
URL="$(terraform output -raw auth_url_localstack)"
CPF="${1:-52998224725}"
echo "POST $URL  (cpf=$CPF)"
curl -s -X POST "$URL" -H "content-type: application/json" -d "{\"cpf\":\"$CPF\"}"
echo
