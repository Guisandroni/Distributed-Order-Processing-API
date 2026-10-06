variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  description = "AWS region used to derive availability zones"
  type        = string
  default     = "us-east-1"
}

resource "aws_vpc" "main" {
  cidr_block           = var.environment == "prod" ? "10.1.0.0/16" : "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.project}-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.environment == "prod" ? "10.1.1.0/24" : "10.0.1.0/24"
  availability_zone = "${var.region}a"

  tags = {
    Name        = "${var.project}-${var.environment}-private-a"
    Environment = var.environment
  }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.environment == "prod" ? "10.1.2.0/24" : "10.0.2.0/24"
  availability_zone = "${var.region}b"

  tags = {
    Name        = "${var.project}-${var.environment}-private-b"
    Environment = var.environment
  }
}


output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}
