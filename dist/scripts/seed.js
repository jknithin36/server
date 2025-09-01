import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "../src/services/db";
async function main() {
    const file = process.argv[2] || path.join(process.cwd(), "data", "rules.json");
    const raw = fs.readFileSync(file, "utf8");
    const rules = JSON.parse(raw);
    const upsert = `
    INSERT INTO rules (id, title, summary, source, level, state, city, conditions, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
    ON CONFLICT (id) DO UPDATE SET
      title      = EXCLUDED.title,
      summary    = EXCLUDED.summary,
      source     = EXCLUDED.source,
      level      = EXCLUDED.level,
      state      = EXCLUDED.state,
      city       = EXCLUDED.city,
      conditions = EXCLUDED.conditions,
      updated_at = now()
  `;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const r of rules) {
            const j = r.jurisdiction || {};
            await client.query(upsert, [
                r.id,
                r.title,
                r.summary ?? null,
                r.source ?? null,
                r.level,
                j.state ?? null,
                j.city ?? null,
                r.conditions ?? {},
            ]);
        }
        await client.query("COMMIT");
        console.log(`Seeded ${rules.length} rules`);
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("Seed failed:", e);
        process.exitCode = 1;
    }
    finally {
        client.release();
        await pool.end();
    }
}
main();
