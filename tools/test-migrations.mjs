import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const migrations = readdirSync("deploy/migrations")
  .filter((x) => x.endsWith(".sql"))
  .sort()
  .map((name) => {
    const [up, down] = readFileSync("deploy/migrations/" + name, "utf8").split(
      "-- +goose Down",
    );
    assert.ok(down, `down migration missing: ${name}`);
    return { name, up, down };
  });
const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, status: "passed" });
  console.log(`PASS ${name}`);
}
async function rejected(sql) {
  await db.exec("BEGIN");
  let failed = false;
  try {
    await db.exec(sql);
    await db.exec("COMMIT");
  } catch {
    failed = true;
    await db.exec("ROLLBACK");
  }
  assert.ok(failed, "invalid transaction unexpectedly succeeded");
}
const tenant = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const account = "00000000-0000-0000-0000-000000000401";
const account2 = "00000000-0000-0000-0000-000000000402";
const transaction = "00000000-0000-0000-0000-000000000501";
try {
  await check("up migrations apply on a clean PostgreSQL engine", async () => {
    for (const m of migrations) await db.exec(m.up);
  });
  await check("all required tables are tenant scoped", async () => {
    const expected = JSON.parse(
      readFileSync("schema/foundation-tables.json", "utf8"),
    );
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='neurogateway'",
    );
    assert.deepEqual(
      tables.rows.map((x) => x.table_name).sort(),
      [expected.root, ...expected.tenant_scoped].sort(),
    );
    for (const table of expected.tenant_scoped) {
      const r = await db.query(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema='neurogateway' AND table_name=$1 AND column_name='tenant_id'",
        [table],
      );
      assert.equal(r.rows[0]?.is_nullable, "NO");
    }
  });
  await check(
    "deterministic seed applies twice without duplicating money",
    async () => {
      const seed = readFileSync("deploy/seed.sql", "utf8");
      await db.exec(seed);
      await db.exec(seed);
      const r = await db.query(
        "SELECT count(*)::int AS n FROM neurogateway.ledger_transactions",
      );
      assert.equal(r.rows[0].n, 1);
    },
  );
  await check("seed balance is exactly 100 RUB in microkopecks", async () => {
    const r = await db.query(
      "SELECT (-sum(amount_microkopecks))::text AS balance FROM neurogateway.ledger_entries WHERE tenant_id=$1 AND account_id=$2",
      [tenant, account2],
    );
    assert.equal(r.rows[0].balance, "10000000000");
  });
  await check("RLS filters rows for a non-owner application role", async () => {
    await db.exec(
      "CREATE ROLE ng_rls_test NOLOGIN;GRANT USAGE ON SCHEMA neurogateway TO ng_rls_test;GRANT SELECT ON ALL TABLES IN SCHEMA neurogateway TO ng_rls_test;SET ROLE ng_rls_test;SET app.tenant_id='" +
        tenant +
        "';",
    );
    try {
      const r = await db.query("SELECT tenant_id FROM neurogateway.users");
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].tenant_id, tenant);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  await check("cross-tenant references are rejected", async () =>
    rejected(
      `INSERT INTO neurogateway.sessions(tenant_id,user_id,token_hash,expires_at) VALUES('${other}','00000000-0000-0000-0000-000000000101','bad',now()+interval '1 hour');`,
    ),
  );
  await check("an unbalanced journal rolls back at commit", async () =>
    rejected(
      `INSERT INTO neurogateway.ledger_transactions(tenant_id,id,kind) VALUES('${tenant}','00000000-0000-0000-0000-000000000502','adjustment');INSERT INTO neurogateway.ledger_entries(tenant_id,transaction_id,account_id,line_no,amount_microkopecks) VALUES('${tenant}','00000000-0000-0000-0000-000000000502','${account}',1,10);`,
    ),
  );
  await check("an empty journal is rejected", async () =>
    rejected(
      `INSERT INTO neurogateway.ledger_transactions(tenant_id,kind) VALUES('${tenant}','adjustment');`,
    ),
  );
  await check("posted entries cannot be updated", async () =>
    rejected(
      `UPDATE neurogateway.ledger_entries SET amount_microkopecks=1 WHERE tenant_id='${tenant}';`,
    ),
  );
  await check("posted journals cannot receive new entries", async () =>
    rejected(
      `INSERT INTO neurogateway.ledger_entries(tenant_id,transaction_id,account_id,line_no,amount_microkopecks) VALUES('${tenant}','${transaction}','${account}',3,10),('${tenant}','${transaction}','${account2}',4,-10);`,
    ),
  );
  await check("posted account currency cannot change", async () =>
    rejected(
      `UPDATE neurogateway.ledger_accounts SET currency='USD' WHERE tenant_id='${tenant}' AND id='${account2}';`,
    ),
  );
  await check("posted account cannot move between wallets", async () =>
    rejected(
      `UPDATE neurogateway.ledger_accounts SET wallet_id=NULL WHERE tenant_id='${tenant}' AND id='${account2}';`,
    ),
  );
  await check("unapproved external provider cannot be enabled", async () =>
    rejected(
      `INSERT INTO neurogateway.providers(tenant_id,name,channel,legal_status,enabled,region) VALUES('${tenant}','unapproved','direct','pending',true,'unset');`,
    ),
  );
  await check(
    "usage table never stores prompt or completion text",
    async () => {
      const r = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='neurogateway' AND table_name='usage_events'",
      );
      assert.ok(
        !r.rows.some((x) =>
          ["prompt", "completion", "content"].includes(x.column_name),
        ),
      );
    },
  );
  await check("down migrations remove the project schema", async () => {
    for (const m of [...migrations].reverse()) await db.exec(m.down);
    const r = await db.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='neurogateway'",
    );
    assert.equal(r.rows[0].n, 0);
  });
  await check("up migrations reapply after rollback", async () => {
    for (const m of migrations) await db.exec(m.up);
  });
  const version = (await db.query("SELECT version()")).rows[0].version;
  mkdirSync("docs/verification", { recursive: true });
  writeFileSync(
    "docs/verification/migrations.json",
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        engine: version,
        harness: "PGlite embedded PostgreSQL (not a Docker integration run)",
        migrations: migrations.map((x) => x.name),
        results,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
