# Web Rules (Angular + PrimeNG)

## Components

All components must be **standalone** (no NgModules):

```typescript
@Component({
	selector: "app-my-feature",
	standalone: true,
	imports: [CommonModule, Button, Card],
	template: `...`,
})
export class MyFeatureComponent {}
```

Use **signal-based** inputs and outputs:

```typescript
readonly title = input<string>('');
readonly items = input.required<Item[]>();
readonly itemSelected = output<Item>();
```

## PrimeNG Components

Always use PrimeNG instead of native HTML elements. Import from specific modules:

```typescript
import { Button } from "primeng/button";
import { Select } from "primeng/select";
import { DatePicker } from "primeng/datepicker";
```

### Deprecated Name Mapping

| Deprecated   | Current      |
| ------------ | ------------ |
| Dropdown     | Select       |
| Calendar     | DatePicker   |
| InputSwitch  | ToggleSwitch |
| Chips        | InputChips   |
| OverlayPanel | Popover      |
| Sidebar      | Drawer       |
| TabView      | Tabs         |

## Design Tokens

All colors must use `--p-` prefixed tokens. No hardcoded colors.

```scss
// Correct
color: var(--p-text-color);
background: var(--p-surface-ground);
border-color: var(--p-surface-border);
```

### Key Tokens

```scss
// Surface
var(--p-surface-ground)    // Page background
var(--p-surface-card)      // Card background
var(--p-surface-border)    // Borders

// Text
var(--p-text-color)           // Primary text
var(--p-text-color-secondary) // Secondary text
var(--p-text-muted-color)     // Muted text

// Status
var(--p-green-500)  // Success
var(--p-red-500)    // Error
var(--p-orange-500) // Warning
var(--p-blue-500)   // Info
```

## Spacing

Use rem units, not px: `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`.

## Styling

- Avoid `::ng-deep`. Prefer PrimeNG's Pass Through API or CSS custom properties.
- If unavoidable, wrap with `:host ::ng-deep`.

## Message Severity Values

```typescript
"success" | "info" | "warn" | "error" | "secondary" | "contrast";
// NOT 'danger', NOT 'primary'
```

## Icons

Always use PrimeIcons (`pi pi-*`). No FontAwesome or Material Icons.

## Accessibility

- Icon-only buttons: `aria-label` required
- Images: `alt` text required
- Form inputs: associate with `<label>` via `for`/`id`

```html
<p-button icon="pi pi-trash" aria-label="Delete item" /> <img [src]="url" alt="Product image" />
```

## Pre-Commit Checklist

- [ ] `npm run lint` passes
- [ ] All PrimeNG imports are module-specific
- [ ] All colors use design tokens (`--p-*`)
- [ ] All buttons/inputs use PrimeNG components
- [ ] Icon-only buttons have `aria-label`
- [ ] No duplicate DTOs — types imported from `@api/*`
