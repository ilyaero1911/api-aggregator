"""Emit idempotent local migrations for psql. Production uses pinned goose."""
from pathlib import Path
import sys

if sys.argv[1:] != ['up']:
    raise SystemExit('Only local up is supported. Down is destructive; use the isolated migration test.')
print('BEGIN; CREATE SCHEMA IF NOT EXISTS ng_migrations;')
print('CREATE TABLE IF NOT EXISTS ng_migrations.versions(version text PRIMARY KEY);')
for path in sorted(Path('deploy/migrations').glob('*.sql')):
    print(f"SELECT NOT EXISTS(SELECT 1 FROM ng_migrations.versions WHERE version='{path.name}') AS apply \\gset")
    print('\\if :apply')
    print(path.read_text().split('-- +goose Down')[0])
    print(f"INSERT INTO ng_migrations.versions(version) VALUES('{path.name}');")
    print('\\endif')
print('COMMIT;')
