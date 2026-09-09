import { readHiddenModelKeys, writeStoredModelKeys } from "./model-picker"
import { ModelCatalog, sortModels, modelPrice } from "./model-catalog"
import * as stylex from "@stylexjs/stylex"
import { useRef, useState } from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { usePrimeModels } from "../prime-agent-state"
import { ProviderBrand, providerName } from "./provider-brand"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
} from "./ui/dropdown-menu"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  label: { display: "grid", fontSize: 13, gap: 6 },
  optionText: {
    display: "grid",
    flex: 1,
    gap: 2,
    lineHeight: 1.4,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  price: { color: theme["--muted"], fontSize: 11, lineHeight: 1.5 },
  trigger: {
    alignItems: "center",
    backgroundColor: { ":hover": theme["--surface-muted"], default: "transparent" },
    borderRadius: 8,
    color: theme["--muted"],
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 13,
    gap: 6,
    maxWidth: 190,
    minHeight: 36,
    minWidth: 0,
    paddingInline: 8,
  },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
})

const modelKey = (p: string, m: string) => JSON.stringify([p, m])

export const DraftModelPicker = ({
  sessionId,
  provider,
  model,
  disabled,
  onChange,
}: {
  sessionId: string | undefined
  provider: string
  model: string
  disabled: boolean
  onChange: (provider: string, model: string) => void
}) => {
  const catalog = usePrimeModels(sessionId)
  const [hidden, setHidden] = useState(readHiddenModelKeys)
  const models = sortModels(catalog.data ?? []).filter(
    (item) => !hidden.has(`${item.provider}:${item.id}`),
  )
  const toggleHidden = (item: { provider: string; id: string }) => {
    const next = new Set(hidden)
    const key = `${item.provider}:${item.id}`
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    setHidden(next)
    writeStoredModelKeys("ernie:hidden-models:v1", next)
  }
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [browse, setBrowse] = useState(false)
  const selected = models.find((item) => item.provider === provider && item.id === model)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={triggerRef}
          disabled={disabled}
          {...stylex.props(styles.trigger)}
          title={model ? `${providerName(provider)} · ${model}` : "Choose model"}
        >
          {provider ? <ProviderBrand provider={provider} /> : null}
          <span {...stylex.props(styles.truncate)}>
            {selected?.label ?? (model || "Choose model")}
          </span>
          <ChevronDownIcon size={14} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Choose model">
          <DropdownMenuRadioGroup
            value={modelKey(provider, model)}
            onValueChange={(value: unknown) => {
              const item = models.find(
                (candidate) => modelKey(candidate.provider, candidate.id) === value,
              )
              if (item) {
                onChange(item.provider, item.id)
              }
            }}
          >
            {models.slice(0, 6).map((item) => (
              <DropdownMenuRadioItem
                key={modelKey(item.provider, item.id)}
                value={modelKey(item.provider, item.id)}
                disabled={disabled}
              >
                <ProviderBrand provider={item.provider} />
                <span {...stylex.props(styles.optionText)}>
                  {item.label}
                  <small {...stylex.props(styles.price)}>{modelPrice(item)}</small>
                </span>
                <DropdownMenuRadioItemIndicator>
                  <CheckIcon size={14} />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
            {model && !selected ? (
              <DropdownMenuRadioItem value={modelKey(provider, model)} disabled={disabled}>
                <ProviderBrand provider={provider} />
                <span {...stylex.props(styles.optionText)}>{model}</span>
                <DropdownMenuRadioItemIndicator>
                  <CheckIcon size={14} />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ) : null}
          </DropdownMenuRadioGroup>
          <DropdownMenuItem disabled={disabled} onClick={() => setBrowse(true)}>
            Browse all models…
          </DropdownMenuItem>
          {catalog.isFetching ? (
            <DropdownMenuItem disabled>Loading models…</DropdownMenuItem>
          ) : null}
          {catalog.isError ? (
            <DropdownMenuItem
              onClick={() => {
                void catalog.refetch()
              }}
            >
              Retry loading models
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={browse} onOpenChange={setBrowse}>
        <DialogContent finalFocus={triggerRef}>
          <DialogTitle>All models</DialogTitle>
          <DialogDescription>Browse catalog</DialogDescription>
          <ModelCatalog
            hidden={hidden}
            onToggleHidden={toggleHidden}
            provider={provider}
            model={model}
            onSelect={(item) => {
              onChange(item.provider, item.id)
              setBrowse(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
