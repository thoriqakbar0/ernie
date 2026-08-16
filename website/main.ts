import { drawablyButton, drawablyCard, drawablyDivider } from 'drawably'
import 'drawably/style.css'

const cardSelector = [
  '.release-card',
  '.product-frame',
  '.capability-grid article',
  '.terminal-card',
  '.docs-status > *',
  '.docs-content pre',
  '.callout',
  '.definition-grid article',
  '.architecture-flow li',
  '.table-wrap',
  '.troubleshooting-list article',
].join(', ')

const buttonSelector = [
  '.nav-cta',
  '.button',
  '.text-link',
  '.principle > a',
  '.docs-footer a',
].join(', ')

const dividerTargetSelector = [
  '.landing-page .capabilities',
  '.landing-page .release',
  '.landing-page .docs-preview',
  '.landing-page .principle',
  '.docs-content > section',
].join(', ')

document.documentElement.classList.add('drawably-enhanced')

for (const card of document.querySelectorAll<HTMLElement>(cardSelector)) {
  drawablyCard(card, {
    boil: 0.12,
    roughness: 0.75,
    width: 1.5,
  })
}

for (const button of document.querySelectorAll<HTMLElement>(buttonSelector)) {
  drawablyButton(button, {
    boil: 0.16,
    roughness: 0.85,
    variant: button.matches('.button-primary, .button-light')
      ? 'solid'
      : 'outline',
    width: 1.4,
  })
}

for (const target of document.querySelectorAll<HTMLElement>(
  dividerTargetSelector,
)) {
  const divider = document.createElement('hr')
  divider.className = 'drawably-section-divider'
  divider.setAttribute('aria-hidden', 'true')
  target.before(divider)
  drawablyDivider(divider, {
    boil: 0.1,
    roughness: 0.65,
    width: 1.25,
  })
}
