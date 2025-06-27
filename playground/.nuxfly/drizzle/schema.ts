import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const todo = sqliteTable("todo", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
});
