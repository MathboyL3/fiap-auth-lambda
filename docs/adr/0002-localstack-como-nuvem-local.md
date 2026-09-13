# ADR-0002 — LocalStack como nuvem local (API Gateway + Lambda)

- **Status:** Aceito
- **Data:** Fase 3
- **Decisores:** Equipe Tech Challenge

## Contexto
O enunciado pede **API Gateway + Lambda** provisionados por **Terraform** com deploy para a nuvem. A equipe optou por **rodar localmente/free** simulando cloud, sem custo de AWS.

## Decisão
Usar **LocalStack** (Docker) para emular **API Gateway, Lambda, Secrets Manager, IAM e CloudWatch Logs**. O provider `hashicorp/aws` aponta os `endpoints` para `http://localhost:4566` com credenciais fake; a Lambda Node executa de verdade no runtime `nodejs20.x`.

## Justificativa
- **Fidelidade:** os recursos Terraform são `aws_lambda_function`, `aws_api_gateway_*`, `aws_secretsmanager_secret` — **idênticos** aos da AWS real. Migração futura = remover o bloco `endpoints`.
- **Custo zero e offline.**
- A Lambda roda o **mesmo artefato** (.zip) que rodaria na AWS.

## Detalhe de implementação (gotcha)
Dentro do **container da Lambda**, `localhost:4566` **não** é o LocalStack (é o próprio container). Por isso:
- `localstack_endpoint = http://localhost:4566` → usado pelo **host/Terraform**.
- `lambda_aws_endpoint = http://fiap-localstack:4566` (nome do container na rede Docker) → injetado como `AWS_ENDPOINT_URL` **na Lambda**, para que ela alcance o Secrets Manager.

## Consequências
- **Positivas:** requisito "API Gateway + Lambda via Terraform, com deploy" cumprido localmente, sem custo, portável para AWS.
- **Negativas:** LocalStack Community tem limites (ex.: não roda RDS real — por isso o banco é o Railway, ver `fiap-infra-db`). A URL de invocação local tem o formato `/restapis/<id>/<stage>/_user_request_/<path>`.
