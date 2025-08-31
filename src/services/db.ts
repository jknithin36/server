import dotenv from "dotenv";
import { Pool } from "pg";
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const isSSL =
  process.env.DATABASE_URL?.includes("sslmode=require") ||
  process.env.PGSSL === "true";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon requires SSL; allow self-signed chain
  ssl: isSSL ? { rejectUnauthorized: false } : undefined,
  // Good defaults for Neon/pgbouncer
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
