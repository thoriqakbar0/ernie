import { styles as sharedStyles } from "../component-styles"
import { styles } from "./model-picker.styles"
import * as stylex from "@stylexjs/stylex"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { PrimeEffort, PrimeModel } from "../../packages/prime-agent"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
type ModelPickerProps = Readonly<{
  acceptedEffort: string | undefined
  disabled: boolean
  models: readonly PrimeModel[]
  onEffortChange: (effort: PrimeEffort) => Promise<void>
  onEffortError: (message: string) => void
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
const popupStyles = stylex.create({
  position: (left: number, top: number, width: number, maxHeight: number) => ({
    left,
    top,
    width,
    maxHeight,
  }),
})
type ModelTier = "flagship" | "balanced" | "fast"
type ModelProfile = Readonly<{
  rank: number
  tier: ModelTier
}>
const pickerGap = 8
const viewportInset = 12
const preferredPickerWidth = 320
const searchVisibilityThreshold = 8
const pinnedModelsStorageKey = "ernie:pinned-models:v1"
const hiddenModelsStorageKey = "ernie:hidden-models:v1"
const effortLevels: readonly PrimeEffort[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]
const modelProfiles: ReadonlyMap<string, ModelProfile> = new Map<string, ModelProfile>([
  [
    "openai-codex:gpt-5.6-sol",
    {
      rank: 0,
      tier: "flagship",
    },
  ],
  [
    "openai-codex:gpt-5.6-terra",
    {
      rank: 1,
      tier: "balanced",
    },
  ],
  [
    "openai-codex:gpt-5.6-luna",
    {
      rank: 2,
      tier: "fast",
    },
  ],
])
export function ModelPicker({
  acceptedEffort,
  disabled,
  models,
  onEffortChange,
  onEffortError,
  onSelect,
  selectedModel,
  side,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [excludedProviders, setExcludedProviders] = useState<ReadonlySet<string>>(() => new Set())
  const [pinnedModelKeys, setPinnedModelKeys] = useState<ReadonlySet<string>>(readPinnedModelKeys)
  const [hiddenModelKeys, setHiddenModelKeys] = useState<ReadonlySet<string>>(readHiddenModelKeys)
  const [showHiddenModels, setShowHiddenModels] = useState(false)
  const [position, setPosition] = useState<PickerPosition>()
  const positioned = position !== undefined
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectedOptionRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selected = models.find(
    (model) => model.id === selectedModel?.id && model.provider === selectedModel.provider,
  )
  const providers = useMemo(
    () =>
      [...new Set(models.map(({ provider }) => provider))].toSorted((left, right) =>
        left.localeCompare(right),
      ),
    [models],
  )
  const showProviderFilters = providers.length > 1
  const showSearch = models.length > searchVisibilityThreshold
  const groupedModels = useMemo(() => {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    const groups = new Map<string, PrimeModel[]>()
    for (const model of models) {
      if (excludedProviders.has(model.provider)) continue
      if (!showHiddenModels && hiddenModelKeys.has(modelKey(model))) continue
      const searchText = `${model.label} ${model.id} ${model.provider}`.toLocaleLowerCase()
      if (!terms.every((term) => searchText.includes(term))) continue
      const group = groups.get(model.provider)
      if (group) group.push(model)
      else groups.set(model.provider, [model])
    }
    return providers.flatMap((provider) => {
      const providerModels = groups.get(provider)
      return providerModels
        ? [
            {
              provider,
              models: providerModels.toSorted((left, right) =>
                compareModelDisplayOrder(left, right, pinnedModelKeys),
              ),
            },
          ]
        : []
    })
  }, [
    excludedProviders,
    hiddenModelKeys,
    models,
    pinnedModelKeys,
    providers,
    query,
    showHiddenModels,
  ])
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
  const togglePinnedModel = (model: PrimeModel) => {
    const next = new Set(pinnedModelKeys)
    const key = modelKey(model)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPinnedModelKeys(next)
    writeStoredModelKeys(pinnedModelsStorageKey, next)
  }
  const toggleHiddenModel = (model: PrimeModel) => {
    const next = new Set(hiddenModelKeys)
    const key = modelKey(model)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setHiddenModelKeys(next)
    writeStoredModelKeys(hiddenModelsStorageKey, next)
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
      const placeAbove =
        side === "top"
          ? spaceAbove >= Math.min(280, spaceBelow)
          : spaceBelow < 280 && spaceAbove > spaceBelow
      const maxHeight = Math.max(180, Math.min(420, placeAbove ? spaceAbove : spaceBelow))
      const top = placeAbove
        ? Math.max(viewportInset, trigger.top - maxHeight - pickerGap)
        : trigger.bottom + pickerGap
      setPosition({
        left,
        maxHeight,
        top,
        width,
      })
    }
    placePicker()
    window.addEventListener("resize", placePicker)
    window.addEventListener("scroll", placePicker, {
      capture: true,
      passive: true,
    })
    return () => {
      window.removeEventListener("resize", placePicker)
      window.removeEventListener("scroll", placePicker, true)
    }
  }, [open, side])
  useLayoutEffect(() => {
    if (!open || !positioned) return
    const frame = window.requestAnimationFrame(() => {
      selectedOptionRef.current?.scrollIntoView({
        block: "nearest",
      })
      if (!showSearch) selectedOptionRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, positioned, selected?.id, selected?.provider, showSearch])
  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !popupRef.current?.contains(event.target) &&
        !(event.target instanceof Element && event.target.closest("[data-slot=select-content]"))
      )
        closePicker(false)
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
    <div ref={rootRef} {...stylex.props(styles.modelPicker)}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Model: ${selected?.label ?? "Select model"}`}
        disabled={disabled}
        onClick={() => {
          setQuery("")
          setOpen((current) => !current)
        }}
        ref={triggerRef}
        type="button"
        {...stylex.props(styles.modelTrigger)}
      >
        <span {...stylex.props(styles.modelTriggerLabel)}>{selected?.label ?? "Select model"}</span>
        <ChevronIcon xstyle={[sharedStyles.controlIcon]} />
      </button>

      {open && position
        ? createPortal(
            <div
              aria-label="Model picker"
              data-model-picker-popup
              ref={popupRef}
              role="dialog"
              {...stylex.props(
                styles.modelPopup,
                popupStyles.position(
                  position.left,
                  position.top,
                  position.width,
                  position.maxHeight,
                ),
              )}
            >
              {showSearch ? (
                <div {...stylex.props(styles.modelSearch)}>
                  <SearchIcon xstyle={[sharedStyles.controlIcon]} />
                  <input
                    aria-label="Search models"
                    autoFocus
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search models…"
                    ref={searchInputRef}
                    value={query}
                    {...stylex.props(styles.modelSearchInput)}
                  />
                </div>
              ) : null}
              {showProviderFilters ? (
                <div aria-label="Model companies" {...stylex.props(styles.providerFilters)}>
                  {providers.map((provider) => {
                    const enabled = !excludedProviders.has(provider)
                    return (
                      <button
                        aria-label={provider}
                        aria-pressed={enabled}
                        key={provider}
                        onClick={() => toggleProvider(provider)}
                        title={provider}
                        type="button"
                        {...stylex.props(styles.providerFilter)}
                      >
                        {companyMark(provider)}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {hiddenModelKeys.size > 0 ? (
                <button
                  aria-pressed={showHiddenModels}
                  onClick={() => setShowHiddenModels((current) => !current)}
                  type="button"
                  {...stylex.props(styles.hiddenModelsToggle)}
                >
                  {showHiddenModels ? "Hide hidden" : `Show hidden (${hiddenModelKeys.size})`}
                </button>
              ) : null}
              <div aria-label="Models" role="listbox" {...stylex.props(styles.modelOptions)}>
                {groupedModels.length > 0 ? (
                  groupedModels.map(({ provider, models: providerModels }) => (
                    <section aria-label={provider} key={provider}>
                      {showProviderFilters ? (
                        <p {...stylex.props(styles.providerName)}>{provider}</p>
                      ) : null}
                      {providerModels.map((model) => {
                        const isSelected =
                          model.id === selectedModel?.id &&
                          model.provider === selectedModel.provider
                        const isPinned = pinnedModelKeys.has(modelKey(model))
                        const isHidden = hiddenModelKeys.has(modelKey(model))
                        const profile = getModelProfile(model)
                        return (
                          <div
                            key={modelKey(model)}
                            {...stylex.props(
                              styles.modelOptionRow,
                              isHidden && styles.modelOptionRowHidden,
                              stylex.defaultMarker(),
                            )}
                          >
                            <button
                              aria-selected={isSelected}
                              onClick={() => {
                                onSelect(model)
                                closePicker(true)
                              }}
                              ref={isSelected ? selectedOptionRef : undefined}
                              role="option"
                              title={`${model.label} · ${model.id}`}
                              type="button"
                              {...stylex.props(
                                styles.modelOption,
                                styles.rowOption,
                              )}
                            >
                              <span {...stylex.props(styles.modelOptionCopy)}>
                                <span {...stylex.props(styles.modelOptionLabel)}>
                                  <span {...stylex.props(styles.modelName)}>{model.label}</span>
                                  {profile ? (
                                    <small {...stylex.props(styles.modelTier)}>
                                      {profile.tier}
                                    </small>
                                  ) : null}
                                </span>
                              </span>
                              {isSelected ? (
                                <CheckIcon
                                  xstyle={[
                                    sharedStyles.controlIcon,
                                    isSelected && styles.selectedIcon,
                                  ]}
                                />
                              ) : null}
                            </button>
                            <button
                              aria-label={`${isPinned ? "Unpin" : "Pin"} ${model.label}`}
                              aria-pressed={isPinned}
                              onClick={() => togglePinnedModel(model)}
                              title={`${isPinned ? "Unpin" : "Pin"} ${model.label}`}
                              type="button"
                              {...stylex.props(
                                styles.modelOptionPin,
                              )}
                            >
                              <PinIcon filled={isPinned} xstyle={[sharedStyles.controlIcon]} />
                            </button>
                            <button
                              aria-label={`${isHidden ? "Show" : "Hide"} ${model.label}`}
                              onClick={() => toggleHiddenModel(model)}
                              title={`${isHidden ? "Show" : "Hide"} ${model.label}`}
                              type="button"
                              {...stylex.props(
                                styles.modelOptionHide,
                              )}
                            >
                              <VisibilityIcon
                                hidden={isHidden}
                                xstyle={[sharedStyles.controlIcon]}
                              />
                            </button>
                          </div>
                        )
                      })}
                    </section>
                  ))
                ) : (
                  <div {...stylex.props(styles.modelEmpty)}>
                    <p role="status">{query ? `No models match “${query}”` : "No models are available for these filters."}</p>
                    <button type="button" {...stylex.props(styles.modelEmptyAction)} onClick={() => {
                      setQuery("")
                      setExcludedProviders(new Set())
                      if (!query && hiddenModelKeys.size > 0) setShowHiddenModels(true)
                      window.requestAnimationFrame(() => searchInputRef.current?.focus())
                    }}>{query ? "Clear search" : "Reset filters"}</button>
                  </div>
                )}
              </div>
              {selected ? (
                <ModelEffortControl
                  acceptedEffort={acceptedEffort}
                  disabled={disabled}
                  modelLabel={selected.label}
                  onEffortChange={onEffortChange}
                  onEffortError={onEffortError}
                />
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
/** Keeps reasoning settings separate from model navigation and reports rejected changes. */
function ModelEffortControl({
  acceptedEffort, disabled, modelLabel, onEffortChange, onEffortError,
}: Pick<ModelPickerProps, "acceptedEffort" | "disabled" | "onEffortChange" | "onEffortError"> & { modelLabel: string }) {
  return (
    <div {...stylex.props(styles.modelEffortControl)}>
      <span>Reasoning effort</span>
      <Select
        disabled={disabled}
        onValueChange={(value) => {
          if (value === null || !isPrimeEffort(value)) return
          void onEffortChange(value).catch((cause: unknown) => {
            onEffortError(cause instanceof Error ? cause.message : "Prime Agent effort change failed")
          })
        }}
        value={isPrimeEffort(acceptedEffort) ? acceptedEffort : null}
      >
        <SelectTrigger aria-label={`Effort for ${modelLabel}`} size="sm" xstyle={[styles.effortTrigger]}>
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {effortLevels.map((effort) => <SelectItem key={effort} value={effort}>{effort}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
function compareModelDisplayOrder(
  left: PrimeModel,
  right: PrimeModel,
  pinnedModelKeys: ReadonlySet<string>,
) {
  const pinRank =
    Number(pinnedModelKeys.has(modelKey(right))) - Number(pinnedModelKeys.has(modelKey(left)))
  if (pinRank !== 0) return pinRank
  const leftProfile = getModelProfile(left)
  const rightProfile = getModelProfile(right)
  if (leftProfile || rightProfile) {
    return (
      (leftProfile?.rank ?? Number.MAX_SAFE_INTEGER) -
      (rightProfile?.rank ?? Number.MAX_SAFE_INTEGER)
    )
  }
  return right.id.localeCompare(left.id, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}
function modelKey(model: Pick<PrimeModel, "id" | "provider">) {
  return `${model.provider}:${model.id}`
}
function readPinnedModelKeys(): ReadonlySet<string> {
  return readStoredModelKeys(pinnedModelsStorageKey)
}
function readHiddenModelKeys(): ReadonlySet<string> {
  return readStoredModelKeys(hiddenModelsStorageKey)
}
function readStoredModelKeys(storageKey: string): ReadonlySet<string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")
    return new Set(
      Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === "string")
        : [],
    )
  } catch {
    return new Set()
  }
}
function writeStoredModelKeys(storageKey: string, modelKeys: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...modelKeys]))
  } catch {
    return
  }
}
function getModelProfile(model: PrimeModel) {
  return modelProfiles.get(`${model.provider}:${model.id}`)
}
function isPrimeEffort(value: string | undefined): value is PrimeEffort {
  return effortLevels.some((effort) => effort === value)
}
function companyMark(provider: string) {
  const words = provider.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return words.length > 1
    ? words
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
    : provider.slice(0, 2)
}
function ChevronIcon({ xstyle }: { xstyle?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 14 14"
      {...stylex.props(sharedStyles.controlIcon, xstyle)}
    >
      <path
        d="m4 5.5 3 3 3-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
function SearchIcon({ xstyle }: { xstyle?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      {...stylex.props(sharedStyles.controlIcon, xstyle)}
    >
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10 10 3 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}
function CheckIcon({ xstyle }: { xstyle?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      {...stylex.props(sharedStyles.controlIcon, xstyle)}
    >
      <path
        d="m3.5 8 3 3 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  )
}
function PinIcon({
  xstyle,
  filled,
}: Readonly<{
  xstyle?: stylex.StyleXStyles
  filled: boolean
}>) {
  return (
    <svg
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      viewBox="0 0 16 16"
      {...stylex.props(sharedStyles.controlIcon, xstyle)}
    >
      <path
        d="M5.5 2.75h5l-.65 3.1 1.65 1.65v1h-3v4.75l-.5.75-.5-.75V8.5h-3v-1l1.65-1.65-.65-3.1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
function VisibilityIcon({
  xstyle,
  hidden,
}: Readonly<{
  xstyle?: stylex.StyleXStyles
  hidden: boolean
}>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      {...stylex.props(sharedStyles.controlIcon, xstyle)}
    >
      <path
        d="M2 8s2-3.25 6-3.25S14 8 14 8s-2 3.25-6 3.25S2 8 2 8Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      {hidden ? (
        <path d="m3 3 10 10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      ) : null}
    </svg>
  )
}
