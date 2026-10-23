import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const pool = await mysql.createPool(process.env.DATABASE_URL!);
export const db = await drizzle(pool);