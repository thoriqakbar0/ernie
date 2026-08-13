/** Source metadata for one inspectable ReactLynx component boundary. */
export type ComponentAnnotation = Readonly<{
  component: string
  id: string
  label: string
  source: string
}>

/** Format a selected component as context that an implementation agent can use. */
export function formatAnnotationContext(annotation: ComponentAnnotation): string {
  return [
    `lynx component: ${annotation.component}`,
    `source: ${annotation.source}`,
    `region: ${annotation.label}`,
    'runtime: ReactLynx',
  ].join('\n')
}
