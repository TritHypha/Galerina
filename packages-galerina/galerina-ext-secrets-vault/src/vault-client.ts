/**
 * galerina-ext-secrets-vault — VaultClient
 *
 * Minimal HashiCorp Vault KV v2 HTTP client using Node.js built-ins only
 * (no external dependencies).  Supports:
 *   - HTTPS for production instances
 *   - HTTP for dev-mode (VAULT_DEV_ROOT_TOKEN_ID present → 127.0.0.1:8200)
 */
import * as https from "node:https";
import * as http from "node:http";
import type { IncomingMessage } from "node:http";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeRequest(
  url: string,
  token: string,
  method: "GET" | "LIST"
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const transport: typeof https = isHttps
      ? (https as typeof https)
      : (http as unknown as typeof https);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method === "LIST" ? "LIST" : "GET",
      headers: {
        "X-Vault-Token": token,
        "Content-Type": "application/json",
      },
    };

    const req = transport.request(options, (res: IncomingMessage) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(
            new Error(
              `Vault HTTP ${status} for ${method} ${url}: ${body.toString("utf8")}`
            )
          );
          return;
        }
        resolve(body);
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// KV v2 response shapes (internal — not exported)
// ---------------------------------------------------------------------------

interface KvV2Response {
  data?: {
    data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
}

interface KvListResponse {
  data?: { keys?: string[] };
}

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------

export class VaultClient {
  private readonly address: string;
  private readonly token: string;

  constructor(address: string, token: string) {
    this.address = address.replace(/\/$/, ""); // strip trailing slash
    this.token = token;
  }

  /**
   * Read a KV v2 secret at `path` under `mountPoint`.
   *
   * The KV v2 API lives at `<mountPoint>/data/<path>`.
   * Returns the full `data.data` object serialised as a UTF-8 JSON Buffer.
   * Callers decide which field(s) to extract.
   */
  async readSecret(path: string, mountPoint = "secret"): Promise<Buffer> {
    // KV v2: strip any leading slash and any "data/" prefix the caller may include
    const cleanPath = path.replace(/^\//, "").replace(/^data\//, "");
    const url = `${this.address}/v1/${mountPoint}/data/${cleanPath}`;
    const raw = await makeRequest(url, this.token, "GET");
    const parsed: KvV2Response = JSON.parse(raw.toString("utf8")) as KvV2Response;

    if (!parsed.data?.data) {
      throw new Error(
        `Vault KV v2: no data.data in response for path "${path}" (mount: ${mountPoint})`
      );
    }

    return Buffer.from(JSON.stringify(parsed.data.data), "utf8");
  }

  /**
   * List secrets under a mountPoint path.
   * Returns an array of key names relative to the path.
   */
  async listSecrets(mountPoint = "secret"): Promise<string[]> {
    const url = `${this.address}/v1/${mountPoint}/metadata/`;
    const raw = await makeRequest(url, this.token, "LIST");
    const parsed: KvListResponse = JSON.parse(raw.toString("utf8")) as KvListResponse;
    return parsed.data?.keys ?? [];
  }

  /**
   * Factory: build a VaultClient from environment variables.
   * If VAULT_DEV_ROOT_TOKEN_ID is set, uses http://127.0.0.1:8200 (dev mode).
   * Otherwise uses VAULT_ADDR + VAULT_TOKEN.
   */
  static fromEnv(): VaultClient {
    const devToken = process.env["VAULT_DEV_ROOT_TOKEN_ID"];
    if (devToken) {
      const addr =
        process.env["VAULT_ADDR"] ?? "http://127.0.0.1:8200";
      return new VaultClient(addr, devToken);
    }
    const addr = process.env["VAULT_ADDR"];
    const token = process.env["VAULT_TOKEN"];
    if (!addr || !token) {
      throw new Error(
        "VaultClient.fromEnv: VAULT_ADDR and VAULT_TOKEN must be set " +
          "(or VAULT_DEV_ROOT_TOKEN_ID for dev mode)"
      );
    }
    return new VaultClient(addr, token);
  }
}
