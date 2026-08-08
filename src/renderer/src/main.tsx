import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

if (import.meta.env.DEV) {
  void import("react-grab").catch((error: unknown) => {
    console.error("React Grab could not start", error);
  });
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Ernie renderer root is missing");
createRoot(rootElement).render(<StrictMode><App /></StrictMode>);
