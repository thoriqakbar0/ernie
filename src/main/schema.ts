import { createSchema } from "@zenbujs/core/db"
import { z } from "zod"
import { emptyRoster } from "../packages/agents"

// Zenbu 0.6 requires a Zod storage field. Effect owns all parsing and domain rules.
export default createSchema({ roster: z.unknown().default(emptyRoster), rosterWriteId: z.string().default("") })
