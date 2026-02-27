import { config } from "dotenv";
import { resolve } from "path";

// Load .env from backend directory
config({ path: resolve(__dirname, "../.env") });

import { Client } from "pg";

async function repairMigration() {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Render internal host (dpg-xxx-a) is not resolvable locally - use external host
  if (connectionString.includes("@dpg-") && connectionString.includes("-a/")) {
    connectionString = connectionString.replace(
      /@(dpg-[a-z0-9]+-a)\//,
      "@$1.oregon-postgres.render.com/"
    );
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const migrationName = "20260225130000_cleaning_laundry_workflow";

  await client.query(`
    UPDATE "_prisma_migrations"
    SET "rolled_back_at" = NOW()
    WHERE "migration_name" = '${migrationName}';
  `);

  console.log("Migration successfully marked as rolled back.");

  await client.end();
}

repairMigration().catch((err) => {
  console.error("Migration repair failed:", err);
  process.exit(1);
});
