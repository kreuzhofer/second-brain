# Modal Rendering Guidelines

## Problem

Modals using `fixed inset-0` can be affected by parent stacking contexts, causing the overlay to not cover the full viewport.

## Solution

Use `createPortal` from React DOM to render modals directly into `document.body`:

```tsx
import { createPortal } from 'react-dom';

// Inside component render:
{isOpen && createPortal(
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg shadow-xl ...">
      {/* Modal content */}
    </div>
  </div>,
  document.body
)}
```

## When to Use

- ✅ Always use `createPortal` for modals in nested components
- ✅ Modals rendered inside tab content, cards, or other containers
- ⚠️ Optional for modals rendered at page component root level (after `<Footer />`)

## Standard Modal Structure

```tsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
  <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
    {/* Sticky header */}
    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
      <h2 className="text-xl font-semibold">Title</h2>
      <button onClick={onClose} aria-label="Close">×</button>
    </div>
    
    {/* Scrollable body */}
    <div className="px-6 py-4 overflow-y-auto flex-1">
      {/* Content */}
    </div>
    
    {/* Sticky footer (optional) */}
    <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
      {/* Actions */}
    </div>
  </div>
</div>
```
