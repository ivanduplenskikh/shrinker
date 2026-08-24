import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import { App } from "./App";
import { readEmbeddedPayload } from "./lib/stats";
import "./index.css";

const container = document.querySelector("#root");
if (!container) throw new Error("Missing #root container");

createRoot(container).render(
  <StrictMode>
    <HeroUIProvider>
      <App payload={readEmbeddedPayload()} />
    </HeroUIProvider>
  </StrictMode>,
);
