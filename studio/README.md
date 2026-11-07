# Studio

This folder is the Higgsfield generation app. It is not the operator console. The contract is [AGENTS.md](AGENTS.md). The operator console is `operator/`.

UI primitives in `components/ui` still come from shadcn.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```
