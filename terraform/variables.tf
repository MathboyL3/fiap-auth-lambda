variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "localstack_endpoint" {
  description = "Endpoint do LocalStack para o Terraform/host (AWS local)."
  type        = string
  default     = "http://localhost:4566"
}

variable "lambda_aws_endpoint" {
  description = "Endpoint do LocalStack visto de DENTRO do container da Lambda (rede Docker)."
  type        = string
  default     = "http://fiap-localstack:4566"
}

variable "lambda_zip_path" {
  description = "Caminho para o artefato .zip da Lambda."
  type        = string
  default     = "../dist/function.zip"
}

variable "jwt_secret" {
  description = "Segredo JWT HS256 (>=32 chars). Compartilhado com a aplicacao .NET."
  type        = string
  sensitive   = true
}

variable "jwt_issuer" {
  type    = string
  default = "Oficina.Api"
}

variable "jwt_audience" {
  type    = string
  default = "Oficina.Api"
}

variable "database_url" {
  description = "Connection string do Postgres (Railway). Injetada como secret."
  type        = string
  sensitive   = true
}

variable "pg_ssl" {
  description = "Modo SSL para o driver pg (require|disable)."
  type        = string
  default     = "require"
}
