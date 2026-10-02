import { resolve } from "node:path";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createFileProposalStore } from "./store.js";

const config = loadConfig();
const store = createFileProposalStore(resolve(import.meta.dirname, "../data/proposals.json"));
const app = createApp(config, { store });

// En Docker va HOST=0.0.0.0 para que el backend lo alcance por la red interna; el puerto no se publica.
const host = process.env.HOST?.trim() || "127.0.0.1";

app.listen(config.port, host, () => {
  console.log(`Firmante escuchando en http://${host}:${config.port}`);
});
