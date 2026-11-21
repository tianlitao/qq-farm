import { ccc } from "@ckb-ccc/connector-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { type NetworkId, NETWORKS, createClient } from "./chain/network";

const NETWORK: NetworkId = (import.meta.env.VITE_NETWORK as NetworkId) || "devnet";

import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ccc.Provider
      name="垄上"
      locale="zh-Hans"
      defaultClient={createClient(NETWORK)}
      clientOptions={
        NETWORK === "devnet"
          ? [{ client: createClient(NETWORK), name: NETWORKS.devnet.name }]
          : undefined
      }
    >
      <App />
    </ccc.Provider>
  </StrictMode>,
);
