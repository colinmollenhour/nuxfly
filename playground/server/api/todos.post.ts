import { todo } from "../db/schema";
import { useDrizzle } from "../utils/drizzle";

export default defineEventHandler(async (event) => {
  const { title } = await readBody(event);
  await useDrizzle().insert(todo).values({ title });
  return { message: "Todo added" };
});
