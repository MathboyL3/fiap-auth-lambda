#!/usr/bin/env bash
# Deploy local completo: sobe LocalStack, empacota a Lambda e aplica o Terraform.
# Requer: Docker, Terraform, Node. Variaveis: JWT_SECRET, DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${JWT_SECRET:?defina JWT_SECRET (>=32 chars, igual ao da app .NET)}"
: "${DATABASE_URL:?defina DATABASE_URL (connection string do Railway)}"

echo "==> Subindo LocalStack..."
docker compose up -d
echo "==> Aguardando LocalStack ficar pronto..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:4566/_localstack/health >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "==> Instalando deps e empacotando a Lambda..."
npm ci
npm run package

echo "==> terraform apply..."
cd terraform
terraform init -input=false
terraform apply -auto-approve -input=false \
  -var="jwt_secret=${JWT_SECRET}" \
  -var="database_url=${DATABASE_URL}"

echo
echo "==> Endpoint de autenticacao:"
terraform output -raw auth_url_localstack
echo
