import { todo } from "@@/server/db/schema";
import { useDrizzle } from "@@/server/utils/drizzle";

export default defineEventHandler(async () => {
  return useDrizzle().select().from(todo).all();
});
