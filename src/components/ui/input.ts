import React, { forwardRef } from "react";
import type { InputHTMLAttributes, ButtonHTMLAttributes } from "react";

const baseInputClass =
  "rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-ink-900 placeholder:text-slate-400 outline-none transition focus:border-saffron-500 focus:bg-white";

export const input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    const { className, ...rest } = props as InputHTMLAttributes<HTMLInputElement>;
    return React.createElement("input", {
      ref,
      className: `${baseInputClass} ${className ?? ""}`,
      ...rest,
    });
  }
);
input.displayName = "Input";

const baseButtonClass =
  "rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-saffron-500 focus-visible:outline-2 focus-visible:outline-saffron-400 disabled:cursor-not-allowed disabled:opacity-60";

export const button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button(props, ref) {
    const { className, ...rest } = props as ButtonHTMLAttributes<HTMLButtonElement>;
    return React.createElement("button", {
      ref,
      className: `${baseButtonClass} ${className ?? ""}`,
      ...rest,
    });
  }
);
button.displayName = "Button";
