# Helm deployment gate

Namespace/ingress/services/secret references будут добавлены после рабочего gateway, выбора cloud и tenant policy. Текущий воспроизводимый runtime — docker-compose.yml. Пустой chart не выдаётся за production deployment. До stage: requests/limits, probes разделённые liveness/readiness, network policies, external secrets, PDB и migration Job; до GA — multi-zone topology и rollback drill.
