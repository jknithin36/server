import { pool } from "../services/db";
import type { Payload } from "../lib/schema";

/** Row shape coming from the DB SELECT (note we alias state/city) */
type RuleRow = {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
  level: "federal" | "state" | "city";
  jurisdiction_state: string | null; // alias of rules.state
  jurisdiction_city: string | null; // alias of rules.city
  conditions: any | null; // JSONB
};

function normalizeStr(s?: string | null) {
  return (s ?? "").trim();
}
function normState(s?: string | null) {
  return normalizeStr(s).toUpperCase();
}
function normCity(s?: string | null) {
  return normalizeStr(s).toLowerCase();
}
function lc(s?: string | null) {
  return normalizeStr(s).toLowerCase();
}
function hasAny<T>(a: readonly T[] = [], b: readonly T[] = []) {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  for (const x of b) if (set.has(x)) return true;
  return false;
}

/** Build matching context from the submitted payload */
function buildCtx(p: Payload) {
  const requiresFood = !!(p.handlesFood || p.onSitePrep || p.meatDairy);
  const requiresAlcohol = !!(p.sellsAlcohol || p.alcoholType);

  // multi-state footprint: primary + other + remote + sales + privacy
  const statesSet = new Set<string>([normState(p.state)]);
  for (const s of p.otherStates ?? []) statesSet.add(normState(s));
  for (const s of p.remoteEmployeeStates ?? []) statesSet.add(normState(s));
  for (const s of p.salesStates ?? []) statesSet.add(normState(s));
  if (p.collectsFromCA) statesSet.add("CA");
  for (const s of p.collectsFromOtherStates ?? []) statesSet.add(normState(s));
  const statesArr = Array.from(statesSet);
  const citiesArr = [normCity(p.city)].filter(Boolean);

  return {
    raw: p,
    state: normState(p.state),
    city: normCity(p.city),
    statesArr,
    citiesArr,
    industry: normalizeStr(p.industry ?? ""),
    industryLc: lc(p.industry),
    employeesTotal: Number.isFinite(p.employeesTotal)
      ? (p.employeesTotal as number)
      : 0,

    // food & alcohol nuance
    requiresFood,
    requiresAlcohol,
    alcoholType: p.alcoholType,
    alcoholSalesContext: p.alcoholSalesContext,
    onSitePrep: !!p.onSitePrep,
    seatingOnPrem: !!p.seatingOnPrem,
    meatDairy: !!p.meatDairy,

    // workforce
    employsMinors: !!p.employsMinors,
    minorsAges: (p.minorsAges ?? []).map(String),
    tippedWorkers: !!p.tippedWorkers,
    tippedPercentBand: p.tippedPercentBand,
    usesContractors1099: !!p.usesContractors1099,

    // transport/safety
    commercialVehicles: !!p.commercialVehicles,
    hasCDLDrivers: !!p.hasCDLDrivers,
    trucksOver10kInterstate: !!p.trucksOver10kInterstate,
    usesForklifts: !!p.usesForklifts,
    hazardousMaterials: !!p.hazardousMaterials,

    // privacy/data
    collectsCustomerData: !!p.collectsCustomerData,
    handlesPHI: !!p.handlesPHI,
    childrenUnder13: !!p.childrenUnder13,
    collectsFromCA: !!p.collectsFromCA,
    collectsFromOtherStates: (p.collectsFromOtherStates ?? []).map(normState),
    dataVolumeBand: p.dataVolumeBand,
    sellsOrSharesData: !!p.sellsOrSharesData,
    usesBiometrics: !!p.usesBiometrics,

    // business structure & ops
    revenueBand: p.revenueBand,
    legalStructure: p.legalStructure,
    payrollFrequency: p.payrollFrequency,
    numLocations: p.numLocations,
    publicFacingSite: !!p.publicFacingSite,
    hasWebsiteOrApp: !!p.hasWebsiteOrApp,
    acceptsCardPayments: !!p.acceptsCardPayments,
  };
}

/** Evaluate JSONB conditions against the business context. */
function evalConditions(
  conditions: any | null | undefined,
  ctx: ReturnType<typeof buildCtx>
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!conditions || Object.keys(conditions).length === 0) {
    reasons.push("Applies generally (no extra conditions).");
    return { ok: true, reasons };
  }

  // 1) employees
  if (typeof conditions.employeesMin === "number") {
    if ((ctx.employeesTotal ?? 0) < conditions.employeesMin)
      return { ok: false, reasons: [] };
    reasons.push(
      `Meets minimum employees threshold (have ${ctx.employeesTotal} ≥ ${conditions.employeesMin}).`
    );
  }
  if (typeof conditions.employeesMax === "number") {
    if ((ctx.employeesTotal ?? 0) > conditions.employeesMax)
      return { ok: false, reasons: [] };
    reasons.push(
      `Within maximum employees threshold (have ${ctx.employeesTotal} ≤ ${conditions.employeesMax}).`
    );
  }

  // 2) industry (case-insensitive)
  if (Array.isArray(conditions.industry) && conditions.industry.length) {
    const set = new Set((conditions.industry as string[]).map(lc));
    if (!set.has(ctx.industryLc)) return { ok: false, reasons: [] };
    reasons.push(`Industry matches (${ctx.industry}).`);
  }

  // 3) derived operational flags
  if (conditions.requiresFood === true) {
    if (!ctx.requiresFood) return { ok: false, reasons: [] };
    reasons.push("Handles food / on-site prep.");
  }
  if (conditions.requiresAlcohol === true) {
    if (!ctx.requiresAlcohol) return { ok: false, reasons: [] };
    reasons.push("Sells alcohol.");
  }

  // 4) alcohol nuance
  if (Array.isArray(conditions.alcoholType) && conditions.alcoholType.length) {
    if (
      !ctx.alcoholType ||
      !(conditions.alcoholType as string[]).includes(ctx.alcoholType)
    )
      return { ok: false, reasons: [] };
    reasons.push(`Alcohol type allowed (${ctx.alcoholType}).`);
  }
  if (
    Array.isArray(conditions.alcoholSalesContext) &&
    conditions.alcoholSalesContext.length
  ) {
    if (
      !ctx.alcoholSalesContext ||
      !(conditions.alcoholSalesContext as string[]).includes(
        ctx.alcoholSalesContext
      )
    )
      return { ok: false, reasons: [] };
    reasons.push(`Alcohol sales context matches (${ctx.alcoholSalesContext}).`);
  }

  // 5) location limits
  if (Array.isArray(conditions.cities) && conditions.cities.length) {
    const allowed = (conditions.cities as string[]).map(normCity);
    if (!hasAny<string>(allowed, ctx.citiesArr))
      return { ok: false, reasons: [] };
    reasons.push("City explicitly included.");
  }

  // 6) minors / tipped
  if (typeof conditions.employsMinors === "boolean") {
    if (ctx.employsMinors !== conditions.employsMinors)
      return { ok: false, reasons: [] };
    reasons.push(
      ctx.employsMinors ? "Employs minors." : "Does not employ minors."
    );
  }
  if (Array.isArray(conditions.minorsAges) && conditions.minorsAges.length) {
    if (!hasAny<string>(conditions.minorsAges, ctx.minorsAges))
      return { ok: false, reasons: [] };
    reasons.push("Minor age range matches.");
  }
  if (typeof conditions.tippedWorkers === "boolean") {
    if (ctx.tippedWorkers !== conditions.tippedWorkers)
      return { ok: false, reasons: [] };
    reasons.push(
      ctx.tippedWorkers ? "Has tipped workers." : "No tipped workers."
    );
  }
  if (
    Array.isArray(conditions.tippedPercentBand) &&
    conditions.tippedPercentBand.length
  ) {
    if (
      !ctx.tippedPercentBand ||
      !(conditions.tippedPercentBand as string[]).includes(
        ctx.tippedPercentBand
      )
    )
      return { ok: false, reasons: [] };
    reasons.push(`Tipped share matches (${ctx.tippedPercentBand}).`);
  }

  // 7) transport / safety
  for (const key of [
    "commercialVehicles",
    "hasCDLDrivers",
    "trucksOver10kInterstate",
    "usesForklifts",
    "hazardousMaterials",
  ] as const) {
    if (typeof conditions[key] === "boolean") {
      if ((ctx as any)[key] !== conditions[key])
        return { ok: false, reasons: [] };
      reasons.push(`${conditions[key] ? "Requires" : "No"} ${key}.`);
    }
  }

  // 8) privacy / data
  for (const key of [
    "collectsCustomerData",
    "handlesPHI",
    "childrenUnder13",
    "collectsFromCA",
    "sellsOrSharesData",
    "usesBiometrics",
  ] as const) {
    if (typeof conditions[key] === "boolean") {
      if ((ctx as any)[key] !== conditions[key])
        return { ok: false, reasons: [] };
      reasons.push(`${conditions[key] ? "Has" : "No"} ${key}.`);
    }
  }
  if (
    Array.isArray(conditions.collectsFromOtherStates) &&
    conditions.collectsFromOtherStates.length
  ) {
    const want = new Set(
      (conditions.collectsFromOtherStates as string[]).map(normState)
    );
    if (!ctx.collectsFromOtherStates.some((s) => want.has(s)))
      return { ok: false, reasons: [] };
    reasons.push("Collects data from specified states.");
  }
  if (
    Array.isArray(conditions.dataVolumeBand) &&
    conditions.dataVolumeBand.length
  ) {
    if (
      !ctx.dataVolumeBand ||
      !(conditions.dataVolumeBand as string[]).includes(ctx.dataVolumeBand)
    )
      return { ok: false, reasons: [] };
    reasons.push(`Data volume band matches (${ctx.dataVolumeBand}).`);
  }

  // 9) structure / payroll
  for (const [key, val] of [
    ["revenueBand", "revenueBand"],
    ["legalStructure", "legalStructure"],
    ["payrollFrequency", "payrollFrequency"],
    ["numLocations", "numLocations"],
  ] as const) {
    const cond = (conditions as any)[key];
    if (Array.isArray(cond) && cond.length) {
      if (!(cond as string[]).includes((ctx as any)[val] ?? ""))
        return { ok: false, reasons: [] };
      reasons.push(`${key} matches.`);
    }
  }

  // 10) facility nuance
  for (const key of [
    "onSitePrep",
    "seatingOnPrem",
    "meatDairy",
    "publicFacingSite",
    "hasWebsiteOrApp",
    "acceptsCardPayments",
  ] as const) {
    if (typeof conditions[key] === "boolean") {
      if ((ctx as any)[key] !== conditions[key])
        return { ok: false, reasons: [] };
      reasons.push(`${conditions[key] ? "Has" : "No"} ${key}.`);
    }
  }

  return {
    ok: true,
    reasons: reasons.length ? reasons : ["Meets rule conditions."],
  };
}

function computeDueDate(
  conditions: any | null | undefined,
  payload: Payload
): string | null {
  const dueFrom = conditions?.dueFrom as string | undefined; // e.g., "firstPayrollDate"
  const dueInDays = Number(conditions?.dueInDays ?? 0);
  if (!dueFrom) return null;
  const base = (payload as any)[dueFrom] as string | undefined; // "YYYY-MM-DD"
  if (!base) return null;
  const d = new Date(base + "T00:00:00Z");
  if (Number.isFinite(dueInDays) && dueInDays !== 0)
    d.setUTCDate(d.getUTCDate() + dueInDays);
  return d.toISOString().slice(0, 10);
}

/** Convert DB row to public shape (with reasons + optional actionization) */
function toPublic(r: RuleRow, reasons: string[], payload: Payload) {
  const c = r.conditions || {};
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? "",
    source: r.source ?? "",
    level: r.level,
    jurisdiction: {
      state: r.jurisdiction_state,
      city: r.jurisdiction_city,
    },
    appliesBecause: reasons,
    action: c.action ?? "",
    owner: c.owner ?? "",
    effort: c.effort ?? "",
    dueDate: computeDueDate(c, payload),
  };
}

/** Tiny jurisdiction candidate cache (60s) */
const jurCache = new Map<string, { rows: RuleRow[]; exp: number }>();
function cacheKey(states: string[], cities: string[]) {
  return `${states.slice().sort().join(",")}|${cities
    .slice()
    .sort()
    .join(",")}`;
}

export async function matchRules(payload: Payload) {
  const ctx = buildCtx(payload);
  const key = cacheKey(ctx.statesArr, ctx.citiesArr);
  const now = Date.now();

  let rows: RuleRow[] | undefined;
  const hit = jurCache.get(key);
  if (hit && hit.exp > now) {
    rows = hit.rows;
  }

  if (!rows) {
    const t0 = process.hrtime.bigint();
    const r = await pool.query<RuleRow>(
      `SELECT
          id, title, summary, source, level,
          state AS jurisdiction_state,
          city  AS jurisdiction_city,
          conditions
       FROM rules
       WHERE
         level = 'federal'
         OR (level = 'state' AND state = ANY($1))
         OR (level = 'city'  AND state = ANY($1) AND LOWER(city) = ANY($2))
       ORDER BY
         CASE level WHEN 'federal' THEN 1 WHEN 'state' THEN 2 ELSE 3 END,
         title ASC`,
      [ctx.statesArr, ctx.citiesArr]
    );
    rows = r.rows;
    jurCache.set(key, { rows, exp: now + 60_000 });

    // optional timing log (set DEBUG_MATCH=1 to see)
    if (process.env.DEBUG_MATCH) {
      const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n);
      console.log(`[matchRules] DB candidates=${rows.length} in ${ms}ms`);
    }
  }

  // Evaluate JSON conditions in app code (clear, flexible)
  const t1 = process.hrtime.bigint();
  const matched: { row: RuleRow; reasons: string[] }[] = [];
  for (const r of rows) {
    const { ok, reasons } = evalConditions(r.conditions, ctx);
    if (ok) matched.push({ row: r, reasons });
  }
  if (process.env.DEBUG_MATCH) {
    const ms = Number((process.hrtime.bigint() - t1) / 1_000_000n);
    console.log(`[matchRules] eval matched=${matched.length} in ${ms}ms`);
  }

  const grouped = {
    federal: matched
      .filter((m) => m.row.level === "federal")
      .map((m) => toPublic(m.row, m.reasons, ctx.raw)),
    state: matched
      .filter((m) => m.row.level === "state")
      .map((m) => toPublic(m.row, m.reasons, ctx.raw)),
    city: matched
      .filter((m) => m.row.level === "city")
      .map((m) => toPublic(m.row, m.reasons, ctx.raw)),
    industry: [] as ReturnType<typeof toPublic>[], // reserved
  };

  const count =
    grouped.federal.length +
    grouped.state.length +
    grouped.city.length +
    grouped.industry.length;

  return { grouped, count };
}
