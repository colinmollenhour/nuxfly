import { todo } from "@@/server/db/schema";
import { useDrizzle } from "@@/server/utils/drizzle";

export default defineEventHandler(async (event) => {
  const { title } = await readBody(event);
  await useDrizzle().insert(todo).values({ title });
  return { message: "Todo added" };
});
