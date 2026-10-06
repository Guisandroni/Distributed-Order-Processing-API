# Infrastructure (Terraform + AWS)

Versioned IaC for `dev` and `prod`. **Validate-only in CI** (fmt + validate, no credentials, no resources, zero cloud spend). `plan`/`apply` are documented manual steps below.

## Layout

```text
infra/
├── providers.tf        # AWS provider + local backend (default)
├── variables.tf        # region / environment / project (+ sensitive DB user)
├── outputs.tf          # environment echo (endpoint outputs live per-env)
├── environments/
│   ├── dev/{main.tf,outputs.tf}    # isolated dev stack
│   └── prod/{main.tf,outputs.tf}   # isolated prod stack
└── modules/
    ├── network/    # VPC + 2 private subnets + outputs
    ├── database/   # RDS PostgreSQL 17 + subnet group
    ├── cache/      # ElastiCache Redis 7
    ├── messaging/  # Amazon MQ RabbitMQ 4
    ├── api/        # ECS Fargate service (2 replicas default) + /health check
    └── worker/     # ECS Fargate service (1 replica, scales independently)
```

## CI gate

```bash
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false && terraform -chdir=infra validate
terraform -chdir=infra/environments/dev init -backend=false && terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/prod init -backend=false && terraform -chdir=infra/environments/prod validate
```

## Manual plan / apply (needs AWS credentials — never in the repo)

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
cd infra/environments/dev
terraform init
terraform plan -var='db_password=... (from secret manager)' -out dev.plan
terraform apply dev.plan
```

Passwords (`db_password`, broker `password`) come from the secret manager at plan/apply time. No `.tfvars` with secrets is committed; state files (`*.tfstate*`) are git-ignored.

## Environments

- `dev`: `t4g.micro` instances, no final snapshot, `10.0.0.0/16`.
- `prod`: `t4g.small` (+`mq.m5.large`), snapshots kept, `10.1.0.0/16`.
- Networks, data, and workloads are fully separated per environment.

## Production state path (documented, not provisioned)

For real AWS usage, move off the local backend:

```hcl
backend "s3" {
  bucket         = "order-platform-tfstate"
  key            = "prod/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "order-platform-tfstate-lock"
  encrypt        = true
}
```

Remote state + DynamoDB locking keep sensitive state out of local disk and serialize applies.
