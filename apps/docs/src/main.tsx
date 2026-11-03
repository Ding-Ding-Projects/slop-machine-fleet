import React from "react";
import { createRoot } from "react-dom/client";
import { UIProvider } from "./preferences";
import { App } from "./App";
import "./styles.css";
const css = document.createElement("link");
css.rel = "stylesheet";
css.href = import.meta.env.BASE_URL + "generated/tokens.css";
document.head.append(css);
createRoot(document.getElementById("root")!).render(
  <UIProvider>
    <App />
  </UIProvider>,
);
