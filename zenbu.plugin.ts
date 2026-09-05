import { definePlugin } from "@zenbujs/core/config"

export default definePlugin({
  name: "app",
  services: [
    "./src/main/services/*.ts",
    "./src/main/prime-agent/service.ts",
  ],
  schema: "./src/main/schema.ts",
  events: "./src/main/events.ts",
})
