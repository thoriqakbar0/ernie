import { definePlugin } from "@zenbujs/core/config"

export default definePlugin({
  name: "app",
  services: [
    "./src/main/services/*.ts",
    "./src/main/prime-agent/service.ts",
  ],
  events: "./src/main/events.ts",
})
