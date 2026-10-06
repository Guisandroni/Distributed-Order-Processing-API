variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "username" {
  type      = string
  default   = "orderplatform"
  sensitive = true
}

variable "password" {
  description = "Master password — from the secret manager at plan/apply time, never committed"
  type        = string
  sensitive   = true
  default     = null
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = var.subnet_ids

  tags = {
    Environment = var.environment
  }
}

resource "aws_db_instance" "main" {
  identifier               = "${var.project}-${var.environment}"
  engine                   = "postgres"
  engine_version           = "17"
  instance_class           = var.environment == "prod" ? "db.t4g.small" : "db.t4g.micro"
  allocated_storage        = 20
  db_name                  = replace(var.project, "-", "")
  username                 = var.username
  password                 = var.password
  db_subnet_group_name     = aws_db_subnet_group.main.name
  skip_final_snapshot      = var.environment != "prod"
  delete_automated_backups = var.environment != "prod"

  tags = {
    Environment = var.environment
  }
}

output "endpoint" {
  value = aws_db_instance.main.endpoint
}
