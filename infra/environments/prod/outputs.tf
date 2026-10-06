output "vpc_id" {
  description = "VPC id from the network module"
  value       = module.network.vpc_id
}

output "database_endpoint" {
  description = "Database endpoint (host only, no credentials)"
  value       = module.database.endpoint
}

output "cache_endpoint" {
  description = "Redis endpoint (host only, no credentials)"
  value       = module.cache.endpoint
}

output "messaging_endpoint" {
  description = "Broker endpoint (host only, no credentials)"
  value       = module.messaging.endpoint
}
