import { jsx as _jsx } from "react/jsx-runtime";
import * as React from "react";
import { cn } from "../../lib/utils";
const Label = React.forwardRef(({ className, ...props }, ref) => (_jsx("label", { ref: ref, className: cn("text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", "text-slate-700 mb-1 block", // Stiluri specifice pentru design-ul tău
    className), ...props })));
Label.displayName = "Label";
export { Label };
