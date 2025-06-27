import { todo } from "../db/schema";
import { useDrizzle } from "../utils/drizzle";

export default defineEventHandler(async () => {
  return useDrizzle().select().from(todo).all();
});
