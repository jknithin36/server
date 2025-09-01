import { Router } from "express";
import { pool } from "../services/db";
export const debug = Router();
debug.get("/v1/debug/db", async (_req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT
        current_user,
        current_database(),
        inet_server_addr() AS server_ip,
        current_setting('server_version') AS pg_version,
        (SELECT COUNT(*)::int FROM rules) AS rules_count
    `);
        // mask sensitive bits if you want
        res.json(rows[0]);
    }
    catch (e) {
        res.status(500).json({ error: e?.message || "db error" });
    }
});
