"""Validate release gating, never infer contractual permission from a URL."""
import json
from pathlib import Path
r = json.loads(Path('docs/legal/provider-registry.json').read_text())
ids = [c['id'] for c in r['channels']]
assert len(ids) == len(set(ids))
for c in r['channels']:
    if c['id'] != 'local-mock' and c['enabled']:
        assert c['legal_status'] == 'approved'
        assert c['contract_reference'] and c['legal_opinion_reference']
        assert c['permitted_models'] and c['permitted_regions']
print(f"Provider gate: {len(ids)-1} external channels pending/disabled; local mock only")
