// src/routes/check.ts
import { Router } from "express";
import { BusinessFormSchema } from "../lib/schema";
import { matchRules } from "../services/match";

export const check = Router();

check.post("/v1/check", async (req, res) => {
  const t0 = Date.now();

  // ---- query flags (optional) ----
  // includeReasons=false -> strip verbose "appliesBecause"
  const includeReasons = String(req.query.includeReasons ?? "true") !== "false";
  // levels=state,city -> only return those buckets
  const levelsParam = String(req.query.levels ?? "federal,state,city")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  const wantFederal = levelsParam.includes("federal");
  const wantState = levelsParam.includes("state");
  const wantCity = levelsParam.includes("city");

  // limit=50 -> cap number of items per bucket (def: no cap)
  const perBucketLimit = Number.isFinite(Number(req.query.limit))
    ? Math.max(0, Number(req.query.limit))
    : undefined;

  // ---- validate body ----
  const parsed = BusinessFormSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const payload = parsed.data;

    const { grouped, count } = await matchRules(payload);

    // optionally filter buckets
    const filtered = {
      federal: wantFederal ? grouped.federal : [],
      state: wantState ? grouped.state : [],
      city: wantCity ? grouped.city : [],
      // reserved bucket; keep empty unless you start using it
      industry: [],
    };

    // optionally strip appliesBecause to keep response small
    const stripReasons = <T extends { appliesBecause?: unknown }>(arr: T[]) =>
      includeReasons
        ? arr
        : arr.map(({ appliesBecause, ...rest }) => rest as T);

    const capped = (arr: any[]) =>
      typeof perBucketLimit === "number" ? arr.slice(0, perBucketLimit) : arr;

    const response = {
      business: {
        name: payload.businessName ?? "Business",
        industry: payload.industry,
        location: `${payload.city}, ${payload.state}`,
      },
      grouped: {
        federal: capped(stripReasons(filtered.federal)),
        state: capped(stripReasons(filtered.state)),
        city: capped(stripReasons(filtered.city)),
        industry: [],
      },
      count, // total matches across all buckets before filtering
      meta: {
        durationMs: Date.now() - t0,
        countsByBucket: {
          federal: grouped.federal.length,
          state: grouped.state.length,
          city: grouped.city.length,
        },
        includeReasons,
        levelsReturned: {
          federal: wantFederal,
          state: wantState,
          city: wantCity,
        },
        perBucketLimit: perBucketLimit ?? null,
      },
    };

    // concise structured log
    console.log(
      "POST /v1/check",
      JSON.stringify({
        durationMs: response.meta.durationMs,
        count: response.count,
        byBucket: response.meta.countsByBucket,
        city: payload.city,
        state: payload.state,
        industry: payload.industry,
      })
    );

    return res.json(response);
  } catch (e: any) {
    console.error("check error:", e?.stack || e);
    return res
      .status(500)
      .json({ error: "Internal error", message: e?.message ?? "unknown" });
  }
});
