import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL not set — database queries will fail");
}

const sql = postgres(connectionString || "", {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export default sql;
