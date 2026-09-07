import { useCallback } from "react"
import { useUiAnnotation } from "./ui-annotation-context"

/** Reserves no space until a local editor or review is portaled into this declared host. */
export const UiAnnotationHost = ({
  id,
  page,
  fallback = 0,
}: {
  id: string
  page: string
  fallback?: number
}) => {
  const register = useUiAnnotation()?.register
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      register?.(id, element ? { element, fallback, page } : null)
    },
    [fallback, id, page, register],
  )
  return <div ref={ref} data-ui-annotator data-react-grab-ignore-events />
}
