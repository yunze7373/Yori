/**
 * Modal Accessibility Helper (WCAG 2.1 AA Compliance)
 * Governed by Architecture Rev3 Section 6 and BACKLOG-20261031-UIA11Y.
 *
 * Provides accessible modal dialog management:
 * 1. Move focus inside dialog on open (title or first focusable control; activeElement !== BODY).
 * 2. Trap Tab and Shift+Tab cycling strictly within the dialog.
 * 3. Escape key closes the dialog.
 * 4. Backdrop click closes the dialog.
 * 5. On close, restore focus to the invoking control.
 */

export interface ModalA11yOptions {
  backdrop: HTMLElement;
  dialog: HTMLElement;
  onClose: () => void;
  initialFocusTarget?: HTMLElement | null;
}

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([aria-disabled="true"]):not(.is-stale), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getModalFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    el => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
  );
}

export function attachModalAccessibility(options: ModalA11yOptions): () => void {
  const { backdrop, dialog, onClose, initialFocusTarget } = options;

  // Ensure title has tabindex="-1" so it can receive programmatic focus
  const titleEl = dialog.querySelector<HTMLElement>('[id$="-title"], .modal-title, h2');
  if (titleEl && !titleEl.hasAttribute('tabindex')) {
    titleEl.setAttribute('tabindex', '-1');
  }

  // Move focus inside dialog on open (dialog title or first focusable element)
  const targetToFocus = initialFocusTarget || titleEl || getModalFocusableElements(dialog)[0] || dialog;
  if (targetToFocus && typeof targetToFocus.focus === 'function') {
    targetToFocus.focus();
  }

  // Keydown listener: Escape to close, Tab to trap
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = getModalFocusableElements(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }

      if (e.shiftKey) {
        // Shift + Tab: if on first element, on title, or outside, wrap to last
        if (
          document.activeElement === first ||
          document.activeElement === titleEl ||
          !dialog.contains(document.activeElement)
        ) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown, true);

  // Backdrop click listener: click outside the modal dialog card triggers onClose
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === backdrop) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  backdrop.addEventListener('click', handleBackdropClick);

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown, true);
    backdrop.removeEventListener('click', handleBackdropClick);
  };
}

export function restoreInvokingFocus(
  invokingElementId?: string | null,
  invokingSelector?: string | null,
  fallbackEl?: HTMLElement | null
) {
  requestAnimationFrame(() => {
    const target =
      (invokingElementId ? document.getElementById(invokingElementId) : null) ||
      (invokingSelector ? document.querySelector<HTMLElement>(invokingSelector) : null) ||
      fallbackEl;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  });
}
