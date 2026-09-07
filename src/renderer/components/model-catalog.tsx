import * as stylex from "@stylexjs/stylex"
import { CheckIcon } from "lucide-react"
import { useState } from "react"
import type { PrimeModel } from "../../packages/prime-agent"
import { usePrimeModels } from "../prime-agent-state"
import { AnimatedTabs } from "./ui/animated-tabs"
import { Input } from "./ui/input"
import { ProviderBrand, providerName } from "./provider-brand"
import { theme } from "../theme.stylex"

export function sortModels(models: readonly PrimeModel[]) {
  return [...models].sort((a, b) => {
    const aDate = Date.parse(a.updatedAt ?? "")
    const bDate = Date.parse(b.updatedAt ?? "")
    if (Number.isFinite(aDate) || Number.isFinite(bDate)) return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0)
    return b.label.localeCompare(a.label, undefined, { numeric: true })
  })
}
export function modelPrice(model: PrimeModel) {
  if (model.provider === "openai-codex") return "Subscription"
  if (!model.cost || (model.cost.input === 0 && model.cost.output === 0)) return "Price unavailable"
  return `$${Number(model.cost.input.toFixed(6))} in / $${Number(model.cost.output.toFixed(6))} out · per 1M tokens`
}
export function ModelCatalog({ hidden, onToggleHidden, provider, model: selectedModel, onSelect }: { hidden: ReadonlySet<string>; onToggleHidden: (model: PrimeModel) => void; provider: string; model: string; onSelect: (model: PrimeModel) => void }) {
  const catalog = usePrimeModels(undefined)
  const models = catalog.data ?? []
  const companies = [...new Set(models.map((model) => providerName(model.provider)))].sort()
  const [company, setCompany] = useState("All")
  const [showHidden, setShowHidden] = useState(false)
  const [query, setQuery] = useState("")
  const filtered = sortModels(models.filter((model) => (!hidden.has(`${model.provider}:${model.id}`) || showHidden) && (company === "All" || providerName(model.provider) === company) && `${model.label} ${model.id} ${model.provider}`.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => Number(b.available !== false) - Number(a.available !== false))
  return <div {...stylex.props(styles.root)}>
    <Input aria-label="Search all models" placeholder="Search models…" value={query} onChange={(event) => setQuery(event.target.value)}/>
    {companies.length > 1 ? <AnimatedTabs tabs={[{ label: "All" }, ...companies.map((label) => ({ label }))]} value={company} onValueChange={setCompany} aria-label="Model providers"/> : companies.length === 1 ? <p {...stylex.props(styles.note)}>{companies[0]}</p> : null}
      <div>
        
        {hidden.size > 0 ? <button type="button" aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)} {...stylex.props(styles.note)}>{showHidden ? "Hide hidden" : `Show hidden (${hidden.size})`}</button> : null}
        <div {...stylex.props(styles.list)}>
          {filtered.map((model) => <div key={`${model.provider}:${model.id}`} {...stylex.props(styles.modelRow)}><button type="button" aria-pressed={model.provider === provider && model.id === selectedModel} disabled={model.available === false} onClick={() => onSelect(model)} {...stylex.props(styles.row)}>
            <ProviderBrand provider={model.provider}/><span {...stylex.props(styles.text)}><strong>{model.label}</strong><span {...stylex.props(styles.price)}>{modelPrice(model)}</span></span>{model.provider === provider && model.id === selectedModel ? <CheckIcon size={16} aria-label="Selected"/> : null}
          </button><button type="button" aria-label={`${hidden.has(`${model.provider}:${model.id}`) ? "Show" : "Hide"} ${model.label}`} onClick={() => onToggleHidden(model)}>{hidden.has(`${model.provider}:${model.id}`) ? "Show" : "Hide"}</button></div>)}
          {catalog.isPending ? <p role="status">Loading model catalog…</p> : catalog.isError ? <button type="button" onClick={() => { void catalog.refetch() }}>Couldn’t load models. Retry</button> : !filtered.length ? <p role="status">No matching models. <button type="button" onClick={() => { setQuery(""); setCompany("All") }}>Clear filters</button></p> : null}
        </div>
      </div>

  </div>
}
const styles = stylex.create({
  modelRow: { display: "flex", alignItems: "center", gap: 8 },
  root: { minWidth: 0 },
  note: { fontSize: 12, lineHeight: 1.5, color: theme["--muted"], marginBlock: 8 },
  price: { fontVariantNumeric: "tabular-nums", color: theme["--muted"] },
  list: { maxHeight: "40dvh", overflowY: "auto", overscrollBehavior: "contain" },
  row: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 12, textAlign: "left", borderRadius: 8, cursor: "pointer", backgroundColor: { default: "transparent", ":hover:not(:disabled)": theme["--surface-muted"] }, opacity: { default: 1, ":disabled": 0.6 } },
  text: { display: "grid", flex: 1, gap: 4, fontSize: 13, lineHeight: 1.5, overflowWrap: "anywhere" },
})
