/**
 * Pond UI primitives.
 *
 * All components in this folder are thin, opinionated wrappers around
 * `@base-ui-components/react`. The Base UI primitives are unstyled —
 * we add Pond's design tokens (`--pond-*` from `styles.css`) and a
 * couple of variants (`size`, `variant`) so the rest of the app can
 * stay terse:
 *
 *   <Button variant="danger" onClick={purge}>Delete forever</Button>
 *
 * If a primitive isn't here yet, prefer adding the wrapper before
 * reaching directly into Base UI from a page — it keeps the styling
 * surface in one place.
 */

export {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
export { Avatar } from "./avatar";
export { Button, type ButtonProps } from "./button";
export {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "./collapsible";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "./field";
export { Input, type InputProps } from "./input";
export { NumberField } from "./number-field";
export {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverGroupLabel,
  PopoverItem,
  PopoverSeparator,
  PopoverTrigger,
} from "./popover";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
export { Separator } from "./separator";
export { Switch } from "./switch";
export { Toast, ToastProvider, useToast } from "./toast";
export {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "./toolbar";
export { Tooltip, TooltipProvider } from "./tooltip";
