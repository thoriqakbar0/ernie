import { createContext, useContext } from "react"

/** Declared content destinations; higher priority hosts own the visible page fallback. */
export type AnnotationHost = Readonly<{ element: HTMLElement; page: string; fallback: number }>
type AnnotationContext = Readonly<{
  active: boolean
  editing: boolean
  feedback: string
  count: number
  review: boolean
  handleActivate: () => void
  handleToggleReview: () => void
  register: (id: string, host: AnnotationHost | null) => void
}>
export const annotationContext = createContext<AnnotationContext | null>(null)
/** Optional outside the application shell, where local UI annotation is unavailable. */
export const useUiAnnotation = () => useContext(annotationContext)
