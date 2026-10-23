import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const pool = await mysql.createPool(process.env.RAW_DATABASE_URL!);
export const raw_db = await drizzle(pool);