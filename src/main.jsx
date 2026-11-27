import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

/* …/?verificar=FOLIO abre la página pública de verificación de constancias
   (sin iniciar sesión). Cualquier otra dirección abre el portal normal. */
const folio = new URLSearchParams(window.location.search).get("verificar");
const Verificar = React.lazy(() => import("./Verificar.jsx"));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {folio
      ? <React.Suspense fallback={null}><Verificar folio={folio} /></React.Suspense>
      : <App />}
  </React.StrictMode>
);
