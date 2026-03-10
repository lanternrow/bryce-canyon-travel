import postgres from "postgres";
import { readFileSync } from "fs";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });
const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

console.log("Running schema...");
await sql.unsafe(schema);
console.log("Schema created successfully!");
await sql.end();
