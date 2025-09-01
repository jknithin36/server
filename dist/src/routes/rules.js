import { Router } from "express";
import { pool } from "../services/db";
export const rules = Router();
/**
 * Browse/search rules catalog (paginated)
 * GET /v1/rules?q=poster&state=CA&city=Los%20Angeles&level=state&page=1&pageSize=50
 *
 * Response shape:
 * {
 *   page, pageSize, total, items: [{ id, title, summary, source, level, state, city }]
 * }
 * Also sets: X-Total-Count header and Cache-Control.
 */
rules.get("/v1/rules", async (req, res) => {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const state = typeof req.query.state === "string"
            ? req.query.state.trim().toUpperCase()
            : "";
        const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
        const level = typeof req.query.level === "string"
            ? req.query.level.trim().toLowerCase()
            : "";
        // pagination
        const page = Math.max(1, Number(req.query.page ?? 1));
        const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
        const offset = (page - 1) * pageSize;
        const where = [];
        const params = [];
        if (q) {
            params.push(`%${q}%`);
            where.push(`(title ILIKE $${params.length} OR summary ILIKE $${params.length} OR source ILIKE $${params.length})`);
        }
        // If state is given but level is NOT explicitly set, include federal alongside that state's rows.
        const levelValid = ["federal", "state", "city"].includes(level);
        if (state) {
            params.push(state);
            if (!levelValid) {
                where.push(`(state = $${params.length} OR level = 'federal')`);
            }
            else {
                where.push(`state = $${params.length}`);
            }
        }
        if (city) {
            params.push(city.toLowerCase());
            // Uses idx_rules_state_lcity if state is also filtered; still efficient standalone.
            where.push(`LOWER(city) = $${params.length}`);
        }
        if (levelValid) {
            params.push(level);
            where.push(`level = $${params.length}`);
        }
        const sql = `
      SELECT
        id, title, summary, source, level, state, city,
        COUNT(*) OVER() AS __total
      FROM rules
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY
        CASE level WHEN 'federal' THEN 1 WHEN 'state' THEN 2 ELSE 3 END,
        state NULLS FIRST,
        city NULLS FIRST,
        title ASC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
        params.push(pageSize, offset);
        const { rows } = await pool.query(sql, params);
        const total = rows[0]?.__total ? Number(rows[0].__total) : 0;
        res.set("X-Total-Count", String(total));
        res.set("Cache-Control", "public, max-age=300");
        res.json({
            page,
            pageSize,
            total,
            items: rows.map(({ __total, ...r }) => r),
        });
    }
    catch (e) {
        console.error("GET /v1/rules error:", e);
        res.status(500).json({ error: "Internal error", message: e?.message });
    }
});
