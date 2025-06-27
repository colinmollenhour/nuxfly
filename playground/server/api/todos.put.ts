import { todo } from "../db/schema";
import { eq } from "drizzle-orm";
import { useDrizzle } from "../utils/drizzle";

export default defineEventHandler(async (event) => {
  const { id, completed } = await readBody(event);
  await useDrizzle().update(todo).set({ completed }).where(eq(todo.id, id));
  return { message: "Todo updated" };
});
