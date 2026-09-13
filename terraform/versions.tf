terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Provider AWS apontando para o LocalStack (endpoints locais + credenciais fake).
# Para usar AWS real, basta remover o bloco endpoints e usar credenciais reais.
provider "aws" {
  region                      = var.aws_region
  access_key                  = "test"
  secret_key                  = "test"
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    lambda         = var.localstack_endpoint
    apigateway     = var.localstack_endpoint
    secretsmanager = var.localstack_endpoint
    iam            = var.localstack_endpoint
    sts            = var.localstack_endpoint
    logs           = var.localstack_endpoint
    cloudwatch     = var.localstack_endpoint
  }
}
