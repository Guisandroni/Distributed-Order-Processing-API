variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-${var.environment}"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project}-${var.environment}"
  engine               = "redis"
  node_type            = var.environment == "prod" ? "cache.t4g.small" : "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name

  tags = {
    Environment = var.environment
  }
}

output "endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}
