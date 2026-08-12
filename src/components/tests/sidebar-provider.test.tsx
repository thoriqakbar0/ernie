import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render } from '@testing-library/react';

import { SidebarProvider } from '@/components/ui/sidebar';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test('restores the persisted compact sidebar width', () => {
  window.localStorage.setItem('ernie:sidebar-width:v1', '336');
  const { container } = render(<SidebarProvider />);
  const wrapper = container.querySelector<HTMLElement>(
    '[data-slot="sidebar-wrapper"]',
  );

  assert.equal(wrapper?.style.getPropertyValue('--sidebar-width'), '336px');
});

test('rejects a persisted sidebar width outside the safe range', () => {
  window.localStorage.setItem('ernie:sidebar-width:v1', '900');
  const { container } = render(<SidebarProvider />);
  const wrapper = container.querySelector<HTMLElement>(
    '[data-slot="sidebar-wrapper"]',
  );

  assert.equal(wrapper?.style.getPropertyValue('--sidebar-width'), '280px');
});
