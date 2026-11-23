import { ccc } from "@ckb-ccc/connector-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { type NetworkId, NETWORKS, createClient } from "./chain/network";

const NETWORK: NetworkId = (import.meta.env.VITE_NETWORK as NetworkId) || "devnet";
const CLIENT = createClient(NETWORK);

import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ccc.Provider
      name="垄上"
      locale="zh-Hans"
      defaultClient={CLIENT}
      clientOptions={[{ client: CLIENT, name: NETWORKS[NETWORK].name }]}
    >
      <App />
    </ccc.Provider>
  </StrictMode>,
);
