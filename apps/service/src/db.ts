import { Pool } from "pg";
export interface Database {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: any[]; rowCount?: number | null }>;
}
export function database(url: string): Pool {
  return new Pool({ connectionString: url, max: 10 });
}
export async function migrate(db: Database) {
  await db.query(`CREATE TABLE IF NOT EXISTS fleet_state (id text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS fleet_sessions (id text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS fleet_workers (id text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS fleet_reviews (id text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS fleet_operations (id text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS fleet_tasks (id text PRIMARY KEY, value jsonb NOT NULL, position serial UNIQUE);
CREATE TABLE IF NOT EXISTS fleet_events (sequence serial PRIMARY KEY, value jsonb NOT NULL);`);
}
const tables = new Set([
  "state",
  "sessions",
  "workers",
  "reviews",
  "operations",
  "tasks",
]);
export class Store {
  constructor(readonly db: Database) {}
  table(name: string) {
    if (!tables.has(name)) throw new Error("Invalid collection");
    return `fleet_${name}`;
  }
  async get<T = any>(name: string, id: string): Promise<T | undefined> {
    return (
      await this.db.query(`SELECT value FROM ${this.table(name)} WHERE id=$1`, [
        id,
      ])
    ).rows[0]?.value;
  }
  async all<T = any>(name: string): Promise<T[]> {
    return (
      await this.db.query(
        `SELECT value FROM ${this.table(name)}${name === "tasks" ? " ORDER BY position" : ""}`,
      )
    ).rows.map((r) => r.value);
  }
  async put(name: string, id: string, value: unknown) {
    await this.db.query(
      `INSERT INTO ${this.table(name)} (id,value) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value`,
      [id, JSON.stringify(value)],
    );
  }
  async remove(name: string, id: string) {
    await this.db.query(`DELETE FROM ${this.table(name)} WHERE id=$1`, [id]);
  }
  async event(type: string, data: unknown) {
    const value = { type, data, createdAt: new Date().toISOString() };
    await this.db.query("INSERT INTO fleet_events (value) VALUES ($1)", [
      JSON.stringify(value),
    ]);
  }
}
