import { json, mysqlTable, text, timestamp } from "drizzle-orm/mysql-core";

export const Logs = mysqlTable('logs', {
    module: text(),
    context: text(),
    message: text(),
    data: json(),
    level: text(),
    createdAt: timestamp(),
})