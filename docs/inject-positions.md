# Injection Positions Reference

This document explains all available injection positions for experiment variants.

## Position Types

### INNER
**Replaces the inner content of the target element**

```javascript
// Implementation
element.innerHTML = content;
```

**Example:**
```json
{
  "selector": ".product-title",
  "html": "<h2>New Title</h2>",
  "position": "INNER"
}
```

**Result:**
```html
<!-- Before -->
<div class="product-title">
  <h2>Old Title</h2>
</div>

<!-- After -->
<div class="product-title">
  <h2>New Title</h2>
</div>
```

⚠️ **Warning:** Removes all existing content inside the element.

---

### OUTER
**Replaces the entire target element**

```javascript
// Implementation
element.outerHTML = content;
```

**Example:**
```json
{
  "selector": ".old-button",
  "html": "<button class=\"new-button\">Click Me</button>",
  "position": "OUTER"
}
```

**Result:**
```html
<!-- Before -->
<button class="old-button">Old Text</button>

<!-- After -->
<button class="new-button">Click Me</button>
```

⚠️ **Warning:** Removes the target element entirely, including its attributes and event listeners.

---

### BEFORE
**Inserts content before the target element (as a sibling)**

```javascript
// Implementation
element.insertAdjacentHTML('beforebegin', content);
```

**Example:**
```json
{
  "selector": ".main-content",
  "html": "<div class=\"banner\">Special Offer!</div>",
  "position": "BEFORE"
}
```

**Result:**
```html
<!-- Before -->
<div class="main-content">Content</div>

<!-- After -->
<div class="banner">Special Offer!</div>
<div class="main-content">Content</div>
```

✅ Safe - doesn't modify the target element.

---

### AFTER
**Inserts content after the target element (as a sibling)**

```javascript
// Implementation
element.insertAdjacentHTML('afterend', content);
```

**Example:**
```json
{
  "selector": ".product-description",
  "html": "<div class=\"reviews\">Customer Reviews</div>",
  "position": "AFTER"
}
```

**Result:**
```html
<!-- Before -->
<div class="product-description">Description</div>

<!-- After -->
<div class="product-description">Description</div>
<div class="reviews">Customer Reviews</div>
```

✅ Safe - doesn't modify the target element.

---

### APPEND ⭐ NEW
**Appends content as the last child of the target element**

```javascript
// Implementation
element.insertAdjacentHTML('beforeend', content);
// or
element.appendChild(newElement);
```

**Example:**
```json
{
  "selector": "head",
  "html": "<style>.new-class { color: red; }</style>",
  "position": "APPEND"
}
```

**Result:**
```html
<!-- Before -->
<head>
  <meta charset="utf-8">
  <title>Page</title>
</head>

<!-- After -->
<head>
  <meta charset="utf-8">
  <title>Page</title>
  <style>.new-class { color: red; }</style>
</head>
```

✅ **Perfect for CSS injection** - preserves existing head content.

---

### PREPEND ⭐ NEW
**Prepends content as the first child of the target element**

```javascript
// Implementation
element.insertAdjacentHTML('afterbegin', content);
// or
element.insertBefore(newElement, element.firstChild);
```

**Example:**
```json
{
  "selector": "body",
  "html": "<div class=\"top-banner\">Announcement</div>",
  "position": "PREPEND"
}
```

**Result:**
```html
<!-- Before -->
<body>
  <header>Header</header>
  <main>Content</main>
</body>

<!-- After -->
<body>
  <div class="top-banner">Announcement</div>
  <header>Header</header>
  <main>Content</main>
</body>
```

✅ Safe - preserves existing content, adds to the beginning.

---

## Common Use Cases

### Injecting CSS Styles
**✅ Recommended: APPEND to head**
```json
{
  "selector": "head",
  "html": "<style>/* your CSS */</style>",
  "position": "APPEND"
}
```

### Injecting JavaScript
**✅ Recommended: APPEND to head or BEFORE body**
```json
{
  "selector": "head",
  "html": "<script>(function() { /* your code */ })();</script>",
  "position": "APPEND"
}
```

### Adding a Banner Above Content
**✅ Use: PREPEND to body or AFTER to header**
```json
{
  "selector": "body",
  "html": "<div class=\"banner\">Special Offer!</div>",
  "position": "PREPEND"
}
```

### Replacing a Button
**✅ Use: OUTER**
```json
{
  "selector": ".old-button",
  "html": "<button class=\"new-button\">Buy Now</button>",
  "position": "OUTER"
}
```

### Modifying Button Text Only
**✅ Use: INNER**
```json
{
  "selector": ".cta-button",
  "html": "Get Started Free",
  "position": "INNER"
}
```

---

## Visual Guide

```
                  BEFORE
                    ↓
         ┌─────────────────────┐
         │  <div class="box">  │ ← OUTER replaces this
         ├─────────────────────┤
PREPEND→ │                     │
         │   existing content  │ ← INNER replaces this
         │                     │ ←APPEND
         └─────────────────────┘
                    ↑
                  AFTER
```

---

## Safety Considerations

| Position | Destructive? | Use Case |
|----------|-------------|----------|
| INNER | ⚠️ Yes | Replacing content inside an element |
| OUTER | ⚠️ Yes | Replacing entire element |
| BEFORE | ✅ No | Adding sibling before |
| AFTER | ✅ No | Adding sibling after |
| APPEND | ✅ No | Adding to end of children (best for `<head>`) |
| PREPEND | ✅ No | Adding to start of children |

**Best Practice:** Use non-destructive positions (BEFORE, AFTER, APPEND, PREPEND) whenever possible to avoid breaking existing functionality.

---

## API Examples

### Complete Request: CSS Injection

```json
{
  "name": "PLP Grid Optimization",
  "oec": "Improve product discoverability",
  "hypothesis": {
    "hypothesis": "4-column grid layout will increase engagement",
    "rationale": "More products visible above the fold",
    "primaryKpi": "click_through_rate"
  },
  "variants": [
    {
      "variantId": "A",
      "selector": "head",
      "html": "<style>@media (min-width:1000px) { .products { display: grid; grid-template-columns: repeat(4, 1fr); } }</style>",
      "position": "APPEND"
    }
  ]
}
```

### Complete Request: HTML Banner

```json
{
  "name": "Urgency Banner Test",
  "oec": "Increase conversion rate",
  "hypothesis": {
    "hypothesis": "Urgency messaging will drive faster purchase decisions",
    "rationale": "FOMO triggers action",
    "primaryKpi": "conversion_rate"
  },
  "variants": [
    {
      "variantId": "A",
      "selector": "body",
      "html": "<div style=\"background: #ff0000; color: white; padding: 10px; text-align: center;\">⏰ Sale ends in 24 hours!</div>",
      "position": "PREPEND"
    }
  ]
}
```

---

## Migration Notes

If you have existing experiments using:
- `selector: "head"` + `position: "INNER"` → **Change to APPEND** to avoid breaking the page
- `selector: "body"` + `position: "INNER"` → **Change to PREPEND** if adding content at the top
