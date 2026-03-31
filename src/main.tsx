import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) {
  document.body.innerHTML = '<div style="padding:40px;font-family:system-ui;color:#c00"><h2>Failed to start</h2><p>Root element not found.</p></div>';
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
