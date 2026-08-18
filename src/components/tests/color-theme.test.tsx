import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  applyAccentColor,
  applyColorTheme,
  parseAccentColor,
  parseColorThemePreference,
  readInitialAccentColor,
  readInitialColorThemePreference,
  resolveColorTheme,
  storeAccentColor,
  storeColorTheme,
} from '@/color-theme';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-custom-accent');
  document.documentElement.style.removeProperty('--custom-accent');
});

test('persists explicit and system appearance preferences', () => {
  assert.equal(readInitialColorThemePreference(), 'system');
  assert.equal(parseColorThemePreference('sepia'), null);

  storeColorTheme('dark');
  assert.equal(readInitialColorThemePreference(), 'dark');
  storeColorTheme('system');
  assert.equal(readInitialColorThemePreference(), 'system');

  applyColorTheme('dark');
  assert.equal(document.documentElement.classList.contains('dark'), true);
  applyColorTheme('light');
  assert.equal(document.documentElement.classList.contains('dark'), false);
});

test('resolves system appearance from the active media query', () => {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  });

  try {
    assert.equal(resolveColorTheme('system'), 'dark');
    assert.equal(resolveColorTheme('light'), 'light');
  } finally {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  }
});

test('validates, applies, persists, and resets a custom accent', () => {
  assert.equal(parseAccentColor('#A1b2C3'), '#a1b2c3');
  assert.equal(parseAccentColor('red'), null);

  storeAccentColor('#a1b2c3');
  assert.equal(readInitialAccentColor(), '#a1b2c3');
  applyAccentColor('#a1b2c3');
  assert.equal(
    document.documentElement.style.getPropertyValue('--custom-accent'),
    '#a1b2c3',
  );
  assert.notEqual(
    document.documentElement.style.getPropertyValue('--custom-primary-light'),
    '',
  );
  assert.notEqual(
    document.documentElement.style.getPropertyValue('--custom-primary-dark'),
    '',
  );
  assert.equal(document.documentElement.hasAttribute('data-custom-accent'), true);

  storeAccentColor(null);
  applyAccentColor(null);
  assert.equal(readInitialAccentColor(), null);
  assert.equal(document.documentElement.hasAttribute('data-custom-accent'), false);
  assert.equal(
    document.documentElement.style.getPropertyValue('--custom-accent'),
    '',
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--custom-primary-light'),
    '',
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--custom-primary-dark'),
    '',
  );
});

test('derives readable primary colors from extreme custom accents', () => {
  applyAccentColor('#ffffff');
  assert.notEqual(
    document.documentElement.style.getPropertyValue('--custom-primary-light'),
    '#ffffff',
  );
  assert.equal(
    document.documentElement.style.getPropertyValue('--custom-primary-dark'),
    '#ffffff',
  );

  applyAccentColor('#000000');
  assert.equal(
    document.documentElement.style.getPropertyValue('--custom-primary-light'),
    '#000000',
  );
  assert.notEqual(
    document.documentElement.style.getPropertyValue('--custom-primary-dark'),
    '#000000',
  );
});
