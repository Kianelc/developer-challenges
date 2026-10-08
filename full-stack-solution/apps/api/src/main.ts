import { createApp } from "./app";
import { loadEnv } from "./config/env";

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, (error?: Error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`API listening on http://localhost:${env.PORT}/api`);
});
