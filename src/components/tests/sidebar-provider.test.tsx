import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, fireEvent, render, within } from '@testing-library/react';

import {
  Sidebar,
  SidebarProvider,
  SidebarRail,
} from '@/components/ui/sidebar';

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

test('resizes the sidebar with the keyboard', () => {
  const { container } = render(
    <SidebarProvider>
      <Sidebar>
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>,
  );
  const rail = within(document.body).getByRole('separator', {
    name: 'Resize sidebar; press Enter to toggle',
  });

  fireEvent.keyDown(rail, { key: 'ArrowRight' });

  const wrapper = container.querySelector<HTMLElement>(
    '[data-slot="sidebar-wrapper"]',
  );
  assert.equal(wrapper?.style.getPropertyValue('--sidebar-width'), '296px');
  assert.equal(rail.getAttribute('aria-valuenow'), '296');
});
