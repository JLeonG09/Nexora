import { resolve } from "node:path";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createFileProposalStore } from "./store.js";

const config = loadConfig();
const store = createFileProposalStore(resolve(import.meta.dirname, "../data/proposals.json"));
const app = createApp(config, { store });

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Firmante escuchando en http://127.0.0.1:${config.port}`);
});
