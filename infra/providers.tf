terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend local por padrão. O caminho de produção (remote state + trava)
  # está documentado em infra/README.md e NÃO é provisionado aqui:
  # zero gasto cloud nesta feature.
  backend "local" {}
}

provider "aws" {
  region = var.aws_region

  # Sem credenciais no repositório: via ambiente (AWS_ACCESS_KEY_ID,
  # AWS_SECRET_ACCESS_KEY) ou perfil SSO na hora do plan/apply manual.
  # fmt + validate rodam sem credenciais e sem criar recursos.
}
