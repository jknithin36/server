import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const sqlPath = path.resolve("db/migrations/01_schema.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon
});

(async () => {
  try {
    await pool.query("BEGIN");
    await pool.query(sql);
    await pool.query("COMMIT");
    console.log("✅ Migration applied");
  } catch (e) {
    await pool.query("ROLLBACK");
    console.error(" Migration failed:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
