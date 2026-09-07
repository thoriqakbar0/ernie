import { definePlugin } from "@zenbujs/core/config"

export default definePlugin({
  events: "./src/main/events.ts",
  name: "app",
  schema: "./src/main/schema.ts",
  services: ["./src/main/services/*.ts", "./src/main/prime-agent/service.ts"],
})
