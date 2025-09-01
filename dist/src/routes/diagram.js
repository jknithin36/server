import { Router } from "express";
export const diagram = Router();
/**
 * Mermaid diagram of the backend data flow.
 * Open in a Mermaid viewer to render.
 */
diagram.get("/v1/diagram.mmd", (_req, res) => {
    const mmd = `
flowchart TD
  UserForm["Business Form (Zod)"] -->|POST /v1/check| API[Express API]
  API --> MatchService["matchRules()"]
  MatchService --> SQL[("Postgres: rules table")]
  SQL --> MatchService
  MatchService --> Conditions["evalConditions()"]
  Conditions --> Grouping["group {federal, state, city}"]
  Grouping --> Response["JSON response (count, grouped, reasons, action, dueDate)"]

  subgraph Postgres
    SQL -->|indexes| IDX1[(level,state,city)]
    SQL -->|jsonb GIN| IDX2[(conditions)]
    SQL -->|lower(city) idx| IDX3[(state, lower(city))]
  end
`.trim();
    res.set("Cache-Control", "public, max-age=300");
    res.type("text/plain").send(mmd);
});
