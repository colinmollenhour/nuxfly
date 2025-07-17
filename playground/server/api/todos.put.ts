import { todo } from "@@/server/db/schema";
import { eq } from "drizzle-orm";
import { useDrizzle } from "@@/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const { id, completed } = await readBody(event);
  await useDrizzle().update(todo).set({ completed }).where(eq(todo.id, id));
  return { message: "Todo updated" };
});
