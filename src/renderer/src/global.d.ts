import type { ErnieApi } from "../../shared/contract";

declare global {
  interface Window { readonly ernie: ErnieApi; }
}
export {};
