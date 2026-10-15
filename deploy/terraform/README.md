# Terraform provisioning gate

Не создаёт платные ресурсы. Требуются утверждённые ADR-003, организация/billing и регион. Затем IaC: private VPC/subnets, NAT allowlist, managed PG/cache/CH, private S3, WireGuard/IPsec bastion, workload identities, secret manager, encrypted state с locking. Plan проходит review до apply; фактического облачного аккаунта и state сейчас нет.
