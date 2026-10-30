import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ServerModule } from "./server.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ServerModule, { logger: ["warn", "error"] });
  app.setGlobalPrefix("api");
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "127.0.0.1");
  console.log(`\nAdmin running at http://localhost:${port}\n`);
}

void bootstrap();
