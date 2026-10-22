import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "mysql",
    out: "src/database/db/out",
    schema: "src/database/db/schema.ts",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    }
})