import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { PrimeModel } from "../../packages/prime-agent"

type ModelPickerProps = Readonly<{
  disabled: boolean
  models: readonly PrimeModel[]
  onSelect: (model: PrimeModel) => void
  selectedModelId: string
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
const preferredPickerWidth = 360

/** Selects one model from Prime Agent's searchable model catalog. */
export function ModelPicker({
  disabled,
  models,
  onSelect,
  selectedModelId,
  side,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [enabledProviders, setEnabledProviders] = useState<ReadonlySet<string> | undefined>()
  const [position, setPosition] = useState<PickerPosition>()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = models.find(({ id }) => id === selectedModelId)
  const providers = useMemo(
    () => [...new Set(models.map(({ provider }) => provider))].sort((left, right) => left.localeCompare(right)),
    [models],
  )
  const activeProviders = useMemo(
    () => enabledProviders ?? new Set(providers),
    [enabledProviders, providers],
  )
  const filteredModels = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return models.filter((model) => {
      if (!activeProviders.has(model.provider)) return false
      const searchText = `${model.label} ${model.id} ${model.provider}`.toLocaleLowerCase()
      return terms.every((term) => searchText.includes(term))
    })
  }, [activeProviders, models, query])
  const groupedModels = useMemo(() => providers.flatMap((provider) => {
    const providerModels = filteredModels.filter((model) => model.provider === provider)
    return providerModels.length > 0 ? [{ provider, models: providerModels }] : []
  }), [filteredModels, providers])

  const toggleProvider = (provider: string) => {
    const next = new Set(activeProviders)
    if (next.has(provider)) next.delete(provider)
    else next.add(provider)
    setEnabledProviders(next.size === providers.length ? undefined : next)
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
      const maxHeight = Math.max(180, Math.min(420, placeAbove ? spaceAbove : spaceBelow))
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
      ) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Model: ${selected?.label ?? "Select model"}`}
        className="flex h-7 max-w-48 items-center gap-1.5 rounded-md px-2.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        disabled={disabled}
        onClick={() => {
          setQuery("")
          setOpen((current) => !current)
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="grid size-4 shrink-0 place-items-center rounded bg-zinc-200 text-[9px] font-semibold uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {selected?.provider.slice(0, 1) ?? "M"}
        </span>
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? "Select model"}</span>
        <ChevronIcon />
      </button>

      {open && position ? createPortal(
        <div
          aria-label="Model picker"
          className="fixed z-[100] flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white/95 text-zinc-900 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95 dark:text-zinc-100"
          data-model-picker-popup
          role="dialog"
          style={position}
        >
          <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
            <div className="flex items-center gap-2 rounded-md px-2 focus-within:ring-1 focus-within:ring-zinc-400">
              <SearchIcon />
              <input
                aria-label="Search models"
                autoFocus
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models..."
                value={query}
              />
            </div>
          </div>
          <div className="h-[52px] shrink-0 border-b border-zinc-200 dark:border-zinc-800">
            <div aria-label="Model companies" className="h-full overflow-x-auto overflow-y-hidden px-2">
              <div className="flex h-full min-w-max items-center gap-1">
                {providers.map((provider) => {
                  const enabled = activeProviders.has(provider)
                  return (
                    <button
                      aria-label={provider}
                      aria-pressed={enabled}
                      className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold uppercase leading-none ${enabled ? "bg-zinc-900 text-white ring-1 ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"}`}
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
            </div>
          </div>
          <div aria-label="Models" className="min-h-0 overflow-y-auto p-1.5" role="listbox">
            {groupedModels.length > 0 ? groupedModels.map(({ provider, models: providerModels }) => (
              <section aria-label={provider} key={provider}>
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{provider}</p>
                {providerModels.map((model) => {
                  const isSelected = model.id === selectedModelId
                  return (
                    <button
                      aria-selected={isSelected}
                      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
                      key={`${model.provider}:${model.id}`}
                      onClick={() => {
                        onSelect(model)
                        setOpen(false)
                      }}
                      role="option"
                      type="button"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-100 text-[10px] font-semibold uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                        {model.provider.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{model.label}</span>
                        <span className="block truncate text-xs capitalize text-zinc-400">{model.provider}</span>
                      </span>
                      {isSelected ? <CheckIcon /> : null}
                    </button>
                  )
                })}
              </section>
            )) : (
              <p className="px-3 py-8 text-center text-sm text-zinc-400">No models found</p>
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
    : provider.slice(0, 1)
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 14 14">
      <path d="m4 5.5 3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10 10 3 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" fill="none" viewBox="0 0 16 16">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}
