import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import {registerPwa} from "./pwa";
const mode=(import.meta as unknown as {env:{MODE:string}}).env.MODE;
if(mode!=="portfolio"&&mode!=="development")void registerPwa()?.catch(()=>{});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
