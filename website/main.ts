import { drawablyButton, drawablyCard, drawablyDivider } from 'drawably'
import 'drawably/style.css'

const cardSelector = [
  '.hero-copy',
  '.release-card',
  '.product-frame',
  '.capability-grid article',
  '.release-copy',
  '.docs-preview-copy',
  '.terminal-card',
  '.principle',
  '.docs-menu',
  '.docs-status > *',
  '.docs-content pre',
  '.callout',
  '.definition-grid article',
  '.architecture-flow li',
  '.table-wrap',
  '.troubleshooting-list article',
].join(', ')

const buttonSelector = [
  '.site-header nav a',
  '.button',
  '.release-card > a',
  '.text-link',
  '.principle > a',
  '.docs-menu a',
  '.docs-footer a',
  '.site-footer a',
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
    boil: card.matches('.hero-copy, .principle') ? 0.18 : 0.12,
    roughness: card.matches('.hero-copy, .principle') ? 1.05 : 0.75,
    width: card.matches('.hero-copy, .principle') ? 1.8 : 1.5,
  })
}

for (const button of document.querySelectorAll<HTMLElement>(buttonSelector)) {
  drawablyButton(button, {
    boil: 0.16,
    roughness: 0.85,
    variant: button.matches('.button-primary, .button-light')
      ? 'solid'
      : button.matches(
            '.text-link, .principle > a, .release-card > a, .site-footer a',
          )
        ? 'scribble'
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
