import * as stylex from "@stylexjs/stylex"
import { styles } from "./model-picker.stylex"
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
    <div {...stylex.props(styles.relative)} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Model: ${selected?.label ?? "Select model"}`}
        {...stylex.props(styles.flex, styles.h7, styles.maxW48, styles.itemsCenter, styles.gap15, styles.roundedMd, styles.px25, styles.textXs, styles.textZinc500, styles.transition, styles.hoverBgZinc100, styles.hoverTextZinc900, styles.focusVisibleOutline2, styles.focusVisibleOutlineOffset1, styles.focusVisibleOutlineZinc500, styles.disabledCursorNotAllowed, styles.disabledOpacity50, styles.darkHoverBgZinc800, styles.darkHoverTextZinc100)}
        disabled={disabled}
        onClick={() => {
          setQuery("")
          setOpen((current) => !current)
        }}
        ref={triggerRef}
        type="button"
      >
        <span {...stylex.props(styles.grid, styles.size4, styles.shrink0, styles.placeItemsCenter, styles.rounded, styles.bgZinc200, styles.text9px, styles.fontSemibold, styles.uppercase, styles.textZinc600, styles.darkBgZinc800, styles.darkTextZinc300)}>
          {selected?.provider.slice(0, 1) ?? "M"}
        </span>
        <span {...stylex.props(styles.minW0, styles.flex1, styles.truncate)}>{selected?.label ?? "Select model"}</span>
        <ChevronIcon />
      </button>

      {open && position ? createPortal(
        <div
          aria-label="Model picker"
          {...stylex.props(styles.fixed, styles.z100, styles.flex, styles.flexCol, styles.overflowHidden, styles.roundedXl, styles.border, styles.borderZinc200, styles.bgWhite95, styles.textZinc900, styles.shadow2xl, styles.backdropBlurXl, styles.darkBorderWhite10, styles.darkBgZinc90095, styles.darkTextZinc100)}
          data-model-picker-popup
          role="dialog"
          style={position}
        >
          <div {...stylex.props(styles.borderB, styles.borderZinc200, styles.p2, styles.darkBorderZinc800)}>
            <div {...stylex.props(styles.flex, styles.itemsCenter, styles.gap2, styles.roundedMd, styles.px2, styles.focusWithinRingZinc400)}>
              <SearchIcon />
              <input
                aria-label="Search models"
                autoFocus
                {...stylex.props(styles.h9, styles.minW0, styles.flex1, styles.bgTransparent, styles.textSm, styles.outlineNone, styles.placeholderTextZinc400)}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models..."
                value={query}
              />
            </div>
          </div>
          <div {...stylex.props(styles.h52px, styles.shrink0, styles.borderB, styles.borderZinc200, styles.darkBorderZinc800)}>
            <div aria-label="Model companies" {...stylex.props(styles.hFull, styles.overflowXAuto, styles.overflowYHidden, styles.px2)}>
              <div {...stylex.props(styles.flex, styles.hFull, styles.minWMax, styles.itemsCenter, styles.gap1)}>
                {providers.map((provider) => {
                  const enabled = activeProviders.has(provider)
                  return (
                    <button
                      aria-label={provider}
                      aria-pressed={enabled}
                      {...stylex.props(
                        styles.relative,
                        styles.inlineFlex,
                        styles.size9,
                        styles.shrink0,
                        styles.itemsCenter,
                        styles.justifyCenter,
                        styles.roundedLg,
                        styles.text11px,
                        styles.fontSemibold,
                        styles.uppercase,
                        styles.leadingNone,
                        enabled ? styles.bgZinc900 : styles.bgZinc100,
                        enabled ? styles.textWhite : styles.textZinc500,
                        enabled && styles.ringZinc900,
                        enabled ? styles.darkBgZinc100 : styles.darkBgZinc800,
                        enabled && styles.darkTextZinc900,
                        enabled && styles.darkRingZinc100,
                        !enabled && styles.hoverBgZinc200,
                        !enabled && styles.darkHoverBgZinc700,
                      )}
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
          <div aria-label="Models" {...stylex.props(styles.minH0, styles.overflowYAuto, styles.p15)} role="listbox">
            {groupedModels.length > 0 ? groupedModels.map(({ provider, models: providerModels }) => (
              <section aria-label={provider} key={provider}>
                <p {...stylex.props(styles.px25, styles.pb1, styles.pt2, styles.text11px, styles.fontMedium, styles.uppercase, styles.trackingWide, styles.textZinc400)}>{provider}</p>
                {providerModels.map((model) => {
                  const isSelected = model.id === selectedModelId
                  return (
                    <button
                      aria-selected={isSelected}
                      {...stylex.props(styles.flex, styles.wFull, styles.itemsCenter, styles.gap3, styles.roundedLg, styles.px25, styles.py2, styles.textLeft, styles.hoverBgZinc100, styles.focusVisibleBgZinc100, styles.focusVisibleOutlineNone, styles.darkHoverBgZinc800, styles.darkFocusVisibleBgZinc800)}
                      key={`${model.provider}:${model.id}`}
                      onClick={() => {
                        onSelect(model)
                        setOpen(false)
                      }}
                      role="option"
                      type="button"
                    >
                      <span {...stylex.props(styles.grid, styles.size7, styles.shrink0, styles.placeItemsCenter, styles.roundedMd, styles.bgZinc100, styles.text10px, styles.fontSemibold, styles.uppercase, styles.textZinc500, styles.darkBgZinc800, styles.darkTextZinc300)}>
                        {model.provider.slice(0, 1)}
                      </span>
                      <span {...stylex.props(styles.minW0, styles.flex1)}>
                        <span {...stylex.props(styles.block, styles.truncate, styles.textSm, styles.fontMedium)}>{model.label}</span>
                        <span {...stylex.props(styles.block, styles.truncate, styles.textXs, styles.capitalize, styles.textZinc400)}>{model.provider}</span>
                      </span>
                      {isSelected ? <CheckIcon /> : null}
                    </button>
                  )
                })}
              </section>
            )) : (
              <p {...stylex.props(styles.px3, styles.py8, styles.textCenter, styles.textSm, styles.textZinc400)}>No models found</p>
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
    <svg aria-hidden="true" {...stylex.props(styles.size35, styles.shrink0, styles.textZinc400)} fill="none" viewBox="0 0 14 14">
      <path d="m4 5.5 3 3 3-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" {...stylex.props(styles.size4, styles.shrink0, styles.textZinc400)} fill="none" viewBox="0 0 16 16">
      <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10 10 3 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" {...stylex.props(styles.size4, styles.shrink0)} fill="none" viewBox="0 0 16 16">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}
