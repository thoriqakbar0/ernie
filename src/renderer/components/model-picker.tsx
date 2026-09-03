import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { PrimeModel } from "../../packages/prime-agent"

type ModelPickerProps = Readonly<{
  disabled: boolean
  models: readonly PrimeModel[]
  onSelect: (model: PrimeModel) => void
  selectedModel: PrimeModel | undefined
  side: "bottom" | "top"
}>

type PickerPosition = Readonly<{
  left: number
  maxHeight: number
  top: number
  width: number
}>

const pickerGap = 8
const viewportInset = 12
const preferredPickerWidth = 380

export function ModelPicker({
  disabled,
  models,
  onSelect,
  selectedModel,
  side,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [excludedProviders, setExcludedProviders] = useState<ReadonlySet<string>>(() => new Set())
  const [position, setPosition] = useState<PickerPosition>()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = models.find((model) =>
    model.id === selectedModel?.id && model.provider === selectedModel.provider)
  const providers = useMemo(
    () => [...new Set(models.map(({ provider }) => provider))].sort((left, right) => left.localeCompare(right)),
    [models],
  )
  const filteredModels = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return models.filter((model) => {
      if (excludedProviders.has(model.provider)) return false
      const searchText = `${model.label} ${model.id} ${model.provider}`.toLocaleLowerCase()
      return terms.every((term) => searchText.includes(term))
    })
  }, [excludedProviders, models, query])
  const groupedModels = useMemo(() => providers.flatMap((provider) => {
    const providerModels = filteredModels.filter((model) => model.provider === provider)
    return providerModels.length > 0 ? [{ provider, models: providerModels }] : []
  }), [filteredModels, providers])

  const closePicker = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const toggleProvider = (provider: string) => {
    setExcludedProviders((current) => {
      const next = new Set(current)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  useLayoutEffect(() => {
    if (!open) return

    const placePicker = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const width = Math.min(preferredPickerWidth, window.innerWidth - viewportInset * 2)
      const left = Math.min(
        Math.max(trigger.left, viewportInset),
        window.innerWidth - width - viewportInset,
      )
      const spaceAbove = trigger.top - viewportInset - pickerGap
      const spaceBelow = window.innerHeight - trigger.bottom - viewportInset - pickerGap
      const placeAbove = side === "top"
        ? spaceAbove >= Math.min(280, spaceBelow)
        : spaceBelow < 280 && spaceAbove > spaceBelow
      const maxHeight = Math.max(180, Math.min(440, placeAbove ? spaceAbove : spaceBelow))
      const top = placeAbove
        ? Math.max(viewportInset, trigger.top - maxHeight - pickerGap)
        : trigger.bottom + pickerGap
      setPosition({ left, maxHeight, top, width })
    }

    placePicker()
    window.addEventListener("resize", placePicker)
    window.addEventListener("scroll", placePicker, true)
    return () => {
      window.removeEventListener("resize", placePicker)
      window.removeEventListener("scroll", placePicker, true)
    }
  }, [open, side])

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !document.querySelector("[data-model-picker-popup]")?.contains(event.target)
      ) closePicker(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker(true)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Model: ${selected?.label ?? "Select model"}`}
        className="model-trigger"
        disabled={disabled}
        onClick={() => {
          setQuery("")
          setOpen((current) => !current)
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="model-trigger__provider">{selected?.provider.slice(0, 2) ?? "AI"}</span>
        <span className="model-trigger__label">{selected?.label ?? "Select model"}</span>
        <ChevronIcon />
      </button>

      {open && position ? createPortal(
        <div
          aria-label="Model picker"
          className="model-popup"
          data-model-picker-popup
          role="dialog"
          style={position}
        >
          <div className="model-search">
            <SearchIcon />
            <input
              aria-label="Search models"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models…"
              value={query}
            />
          </div>
          <div aria-label="Model companies" className="provider-filters">
            {providers.map((provider) => {
              const enabled = !excludedProviders.has(provider)
              return (
                <button
                  aria-label={provider}
                  aria-pressed={enabled}
                  className="provider-filter"
                  key={provider}
                  onClick={() => toggleProvider(provider)}
                  title={provider}
                  type="button"
                >
                  {companyMark(provider)}
                </button>
              )
            })}
          </div>
          <div aria-label="Models" className="model-options" role="listbox">
            {groupedModels.length > 0 ? groupedModels.map(({ provider, models: providerModels }) => (
              <section aria-label={provider} className="model-group" key={provider}>
                <p>{provider}</p>
                {providerModels.map((model) => {
                  const isSelected = model.id === selectedModel?.id &&
                    model.provider === selectedModel.provider
                  return (
                    <button
                      aria-selected={isSelected}
                      className="model-option"
                      key={`${model.provider}:${model.id}`}
                      onClick={() => {
                        onSelect(model)
                        closePicker(true)
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="model-option__mark">{model.provider.slice(0, 2)}</span>
                      <span className="model-option__copy">
                        <span>{model.label}</span>
                        <small>{model.id}</small>
                      </span>
                      {isSelected ? <CheckIcon /> : null}
                    </button>
                  )
                })}
              </section>
            )) : (
              <p className="model-empty" role="status">No models match “{query}”.</p>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function companyMark(provider: string) {
  const words = provider.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return words.length > 1
    ? words.slice(0, 2).map((word) => word[0]).join("")
    : provider.slice(0, 2)
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 14 14">
      <path d="m4 5.5 3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10 10 3 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}
