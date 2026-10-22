/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "mysql",
    out: "src/database/raw_db/out",
    schema: "src/database/raw_db/schema.ts",
    dbCredentials: {
        url: process.env.RAW_DATABASE_URL!,
    }
})