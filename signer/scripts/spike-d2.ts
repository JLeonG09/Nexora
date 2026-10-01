/**
 * Spike D2: smart account + regla Ed25519/spending-limit + transfer firmado por el agente.
 * No es el POST /sign-and-submit (D4). Solo go/no-go en testnet.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Address,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Client as SmartAccountClient } from "smart-account-kit-bindings";
import {
  LEDGERS_PER_DAY,
  MemoryStorage,
  SmartAccountKit,
  createCallContractContext,
  createDelegatedSigner,
  createEd25519Signer,
  createSpendingLimitParams,
} from "smart-account-kit";
import { decodeMasterSecret } from "../src/config.js";
import { deriveAgentKey } from "../src/deriveKey.js";

const ENV_PATH = resolve(import.meta.dirname, "../.env");
const SPENDING_LIMIT_POLICY = "CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G";
const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

type KitWithConnect = SmartAccountKit & {
  setConnectedState(contractId: string, credentialId: string): void;
};

function readEnvFile(): string {
  return readFileSync(ENV_PATH, "utf8");
}

function envValue(env: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|\\n)${key}=([^\\n]+)`).exec(env);
  return match?.[1]?.trim();
}

function upsertEnv(env: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  if (env.includes(`${key}=`)) {
    return env.replace(new RegExp(`${key}=.*`), line);
  }
  return `${env.trimEnd()}\n${line}\n`;
}

function requireSecret(env: string, key: string): string {
  const value = envValue(env, key);
  if (!value || value.includes("<") || !value.startsWith("S")) {
    throw new Error(`Falta ${key} real en signer/.env`);
  }
  return value;
}

async function waitForTx(server: rpc.Server, hash: string): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  for (let i = 0; i < 30; i += 1) {
    const got = await server.getTransaction(hash);
    if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return got;
    }
    if (got.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transacción fallida: ${hash}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timeout esperando ${hash}`);
}

async function sacTransfer(
  server: rpc.Server,
  source: Keypair,
  from: string,
  to: string,
  amountUnits: bigint,
  usdcContract: string,
  passphrase: string,
): Promise<string> {
  const account = await server.getAccount(source.publicKey());
  const token = new Contract(usdcContract);
  const built = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: passphrase,
  })
    .addOperation(
      token.call(
        "transfer",
        new Address(from).toScVal(),
        new Address(to).toScVal(),
        nativeToScVal(amountUnits, { type: "i128" }),
      ),
    )
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulación transfer SAC: ${sim.error}`);
  }
  const prepared = rpc.assembleTransaction(built, sim).build();
  prepared.sign(source);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error(`Envío SAC: ${sent.errorResult?.toXDR("base64") ?? sent.status}`);
  }
  await waitForTx(server, sent.hash);
  return sent.hash;
}

async function main(): Promise<void> {
  let file = readEnvFile();
  const rpcUrl = envValue(file, "STELLAR_RPC_URL") ?? "https://soroban-testnet.stellar.org";
  const passphrase = envValue(file, "STELLAR_NETWORK_PASSPHRASE") ?? Networks.TESTNET;
  const usdc = envValue(file, "USDC_CONTRACT_ID");
  const wasmHash = envValue(file, "ACCOUNT_WASM_HASH");
  const webauthn = envValue(file, "WEBAUTHN_VERIFIER_ADDRESS");
  const ed25519Verifier = envValue(file, "ED25519_VERIFIER_ADDRESS");
  const masterRaw = envValue(file, "AGENT_MASTER_SECRET");
  if (!usdc || !wasmHash || !webauthn || !ed25519Verifier || !masterRaw) {
    throw new Error("Faltan variables de testnet o AGENT_MASTER_SECRET en .env");
  }

  const feePayer = Keypair.fromSecret(requireSecret(file, "FEE_PAYER_SECRET"));
  const usdcHolder = Keypair.fromSecret(requireSecret(file, "SPIKE_USDC_SECRET"));
  const server = new rpc.Server(rpcUrl, { allowHttp: false });
  const nodeSigner = basicNodeSigner(feePayer, passphrase);

  console.log("1) Cuentas");
  console.log(`   fee payer (dueño/admin): ${feePayer.publicKey()}`);
  console.log(`   USDC holder:             ${usdcHolder.publicKey()}`);

  const kit = new SmartAccountKit({
    rpcUrl,
    networkPassphrase: passphrase,
    accountWasmHash: wasmHash,
    webauthnVerifierAddress: webauthn,
    ed25519VerifierAddress: ed25519Verifier,
    deployerSecret: feePayer.secret(),
    storage: new MemoryStorage(),
    timeoutInSeconds: 90,
  });

  let smartAccount = envValue(file, "SPIKE_SMART_ACCOUNT");
  if (smartAccount?.startsWith("C")) {
    console.log(`2) Reuso smart account ${smartAccount}`);
  } else {
    console.log("2) Desplegando smart account (dueño = fee payer, Delegated)...");
    const owner = createDelegatedSigner(feePayer.publicKey());
    const deployTx = await SmartAccountClient.deploy(
      { signers: [owner], policies: new Map() },
      {
        networkPassphrase: passphrase,
        rpcUrl,
        wasmHash,
        publicKey: feePayer.publicKey(),
        timeoutInSeconds: 90,
      },
    );
    const sent = await deployTx.signAndSend({ signTransaction: nodeSigner.signTransaction });
    const hash = sent.sendTransactionResponse?.hash;
    if (hash) {
      console.log(`   deploy tx: ${EXPLORER}/${hash}`);
    }
    const client = sent.result as { options?: { contractId?: string } } | string | undefined;
    if (typeof sent.result === "string" && sent.result.startsWith("C")) {
      smartAccount = sent.result;
    } else if (client && typeof client === "object" && client.options?.contractId) {
      smartAccount = client.options.contractId;
    } else if (deployTx.options && "contractId" in deployTx && typeof (deployTx as { contractId?: string }).contractId === "string") {
      smartAccount = (deployTx as { contractId: string }).contractId;
    }
    if (!smartAccount?.startsWith("C")) {
      throw new Error(
        `No pude leer la C... del deploy. Revisá el resultado a mano. keys=${Object.keys(sent).join(",")}`,
      );
    }
    file = upsertEnv(file, "SPIKE_SMART_ACCOUNT", smartAccount);
    writeFileSync(ENV_PATH, file);
    console.log(`   smart account: ${smartAccount}`);

    const fund = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(smartAccount)}`);
    console.log(`   friendbot C...: ${fund.ok ? "ok" : fund.status}`);
  }

  (kit as KitWithConnect).setConnectedState(smartAccount, "spike-d2");
  kit.wallet = new SmartAccountClient({
    contractId: smartAccount,
    networkPassphrase: passphrase,
    rpcUrl,
    publicKey: feePayer.publicKey(),
  });
  kit.externalSigners.addFromSecret(feePayer.secret());

  const agent = deriveAgentKey(decodeMasterSecret(masterRaw), smartAccount, 1);
  kit.externalSigners.addEd25519FromSecret(agent.keypair.secret(), ed25519Verifier);
  console.log("3) Llave del agente (D1, cuenta real)");
  console.log(`   publicKeyHex: ${agent.publicKeyHex}`);
  console.log(`   address:      ${agent.address}`);

  if (envValue(file, "SPIKE_SA_FUNDED") === "1") {
    console.log("4) USDC ya estaba en la smart account (salto el pase)");
  } else {
    console.log("4) Pasando 10 USDC del holder a la smart account...");
    const fundHash = await sacTransfer(
      server,
      usdcHolder,
      usdcHolder.publicKey(),
      smartAccount,
      100_000_000n,
      usdc,
      passphrase,
    );
    file = upsertEnv(file, "SPIKE_SA_FUNDED", "1");
    writeFileSync(ENV_PATH, file);
    console.log(`   ${EXPLORER}/${fundHash}`);
  }

  const latest = await server.getLatestLedger();
  const validUntil = latest.sequence + LEDGERS_PER_DAY * 7;
  const agentSigner = createEd25519Signer(ed25519Verifier, Buffer.from(agent.publicKeyHex, "hex"));
  const spending = createSpendingLimitParams(50n * 10_000_000n, LEDGERS_PER_DAY);
  const policies = new Map<string, unknown>([
    [SPENDING_LIMIT_POLICY, kit.convertPolicyParams("spending_limit", spending)],
  ]);

  let contextRuleId = 1;
  const alreadyRuled = await kit.rules.get(1).then((r) => Boolean(r.result)).catch(() => false);
  if (alreadyRuled) {
    console.log("5) Regla id=1 ya existe (salto el add)");
  } else {
    console.log("5) Agregando regla CallContract(USDC) + agente + spending-limit...");
    const addTx = await kit.rules.add(
      createCallContractContext(usdc),
      "agente-riendas",
      [agentSigner],
      policies,
      validUntil,
    );
    const available = await kit.multiSigners.getAvailableSigners();
    const selectedAdmin = kit.multiSigners.buildSelectedSigners(available, kit.credentialId);
    const addResult = await kit.multiSigners.adminOperation(addTx, selectedAdmin, {
      forceMethod: "rpc",
      onLog: (m, t) => console.log(`   [${t ?? "info"}] ${m}`),
    });
    if (!addResult.success) {
      console.error("NO-GO: no se pudo instalar la regla");
      console.error(`   ${addResult.error.code}: ${addResult.error.message}`);
      process.exit(1);
    }
    console.log(`   regla ok: ${EXPLORER}/${addResult.hash}`);
    const count = await kit.rules.count();
    contextRuleId = count - 1;
    console.log(`   contextRuleId tentativo: ${contextRuleId} (count=${count})`);
  }

  const agentRule = (await kit.rules.get(contextRuleId)).result;
  if (!agentRule?.signers?.length) {
    throw new Error(`No encontré signers en la regla ${contextRuleId}`);
  }

  console.log("6) Transfer 1 USDC firmado por el AGENTE (solo Ed25519)...");
  const selectedAgent = kit.multiSigners.buildSelectedSigners(agentRule.signers, kit.credentialId);
  console.log(`   selected: ${selectedAgent.map((s) => s.type).join(",") || "(ninguno)"}`);
  const pay = await kit.multiSigners.transfer(usdc, usdcHolder.publicKey(), 1, selectedAgent, {
    forceMethod: "rpc",
    resolveContextRuleIds: () => [contextRuleId],
    onLog: (m, t) => console.log(`   [${t ?? "info"}] ${m}`),
  });
  if (!pay.success) {
    console.error("NO-GO: el agente no pudo pagar");
    console.error(`   ${pay.error.code}: ${pay.error.message}`);
    process.exit(1);
  }
  console.log("GO: el agente firmó y la red aceptó el pago.");
  console.log(`   ${EXPLORER}/${pay.hash}`);
}

main().catch((error: unknown) => {
  console.error("NO-GO:", error instanceof Error ? error.message : error);
  process.exit(1);
});
