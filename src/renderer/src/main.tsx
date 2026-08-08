import { StrictMode, type ReactNode } from "react";
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
const root = createRoot(rootElement);

function renderApp(developmentTools?: ReactNode): void {
  root.render(<StrictMode><App />{developmentTools}</StrictMode>);
}

renderApp();
if (import.meta.env.DEV) {
  void import("./DevelopmentDialKitTools").then(({ DevelopmentDialKitTools }) => {
    // App remains the first child, so adding tools preserves its mounted state.
    renderApp(<DevelopmentDialKitTools />);
  }).catch((error: unknown) => {
    console.error("DialKit could not start", error);
  });
}
