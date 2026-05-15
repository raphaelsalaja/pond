import { Input as BaseInput } from "@base-ui/react/input";
import { cn } from "../lib/cn";
import controlStyles from "../lib/control.module.css";

export function Input({ className, ...props }: BaseInput.Props) {
  return (
    <BaseInput className={cn(controlStyles.control, className)} {...props} />
  );
}
