import { describe, expect, test } from "bun:test";
import { ingestRemoteImage, IntegrationAssetError } from "../src/features/integrations/assets";

const PUBLIC_A = { address: "93.184.216.34", family: 4 };
const PUBLIC_B = { address: "1.1.1.1", family: 4 };
const PRIVATE_REBIND = { address: "10.0.0.10", family: 4 };

describe("integration asset SSRF protections", () => {
  test("rejects non-HTTPS, credentials, and non-standard ports before fetch", async () => {
    for (const url of [
      "http://assets.example/card.png",
      "https://user:pass@assets.example/card.png",
      "https://assets.example:8443/card.png",
    ]) {
      const { fetchCalls, ingest } = createAssetIngest(url);

      await expectAssetError(ingest);

      expect(fetchCalls).toEqual([]);
    }
  });

  test("rejects loopback, private, localhost, and metadata link-local targets before fetch", async () => {
    for (const url of [
      "https://127.0.0.1/card.png",
      "https://[::1]/card.png",
      "https://[::ffff:192.168.1.10]/card.png",
      "https://192.168.1.10/card.png",
      "https://localhost/card.png",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      const { fetchCalls, ingest } = createAssetIngest(url);

      await expectAssetError(ingest);

      expect(fetchCalls).toEqual([]);
    }
  });

  test("rejects redirects to private addresses before following them", async () => {
    const fetchCalls: string[] = [];

    await expectAssetError(() =>
      ingestRemoteImage({
        ...baseInput("https://assets.example/card.png"),
        lookupHost: async () => [PUBLIC_A],
        fetcher: async (asset, init) => {
          fetchCalls.push(asset.href);
          expect(init?.redirect).toBe("manual");
          return new Response(null, {
            status: 302,
            headers: { Location: "https://10.0.0.5/private.png" },
          });
        },
      }),
    );

    expect(fetchCalls).toEqual(["https://assets.example/card.png"]);
  });

  test("pins the validated address into the initial transport request", async () => {
    const lookupCalls: string[] = [];
    const fetchAddresses: string[] = [];

    await expectAssetError(() =>
      ingestRemoteImage({
        ...baseInput("https://assets.example/card.png"),
        lookupHost: async (hostname) => {
          lookupCalls.push(hostname);
          return lookupCalls.length === 1 ? [PUBLIC_A] : [PRIVATE_REBIND];
        },
        fetcher: async (asset) => {
          fetchAddresses.push(asset.resolvedAddress.address);
          expect(asset.resolvedAddress).toEqual(PUBLIC_A);
          return new Response(new Uint8Array([1]), { status: 200 });
        },
      }),
    );

    expect(lookupCalls).toEqual(["assets.example"]);
    expect(fetchAddresses).toEqual([PUBLIC_A.address]);
  });

  test("pins each redirect target to that target's validated address", async () => {
    const lookupCalls: string[] = [];
    const fetchCalls: { href: string; address: string }[] = [];

    await expectAssetError(() =>
      ingestRemoteImage({
        ...baseInput("https://assets.example/card.png"),
        lookupHost: async (hostname) => {
          lookupCalls.push(hostname);
          if (hostname === "assets.example") return [PUBLIC_A];
          if (hostname === "cdn.example") return lookupCalls.filter((item) => item === "cdn.example").length === 1 ? [PUBLIC_B] : [PRIVATE_REBIND];
          throw new Error(`unexpected lookup for ${hostname}`);
        },
        fetcher: async (asset) => {
          fetchCalls.push({ href: asset.href, address: asset.resolvedAddress.address });
          if (asset.href === "https://assets.example/card.png") {
            return new Response(null, {
              status: 302,
              headers: { Location: "https://cdn.example/final-card.png" },
            });
          }

          return new Response(new Uint8Array([1]), { status: 200 });
        },
      }),
    );

    expect(lookupCalls).toEqual(["assets.example", "cdn.example"]);
    expect(fetchCalls).toEqual([
      { href: "https://assets.example/card.png", address: PUBLIC_A.address },
      { href: "https://cdn.example/final-card.png", address: PUBLIC_B.address },
    ]);
  });
});

function createAssetIngest(url: string) {
  const fetchCalls: string[] = [];
  return {
    fetchCalls,
    ingest: () =>
      ingestRemoteImage({
        ...baseInput(url),
        lookupHost: async () => [PUBLIC_A],
        fetcher: async (asset) => {
          fetchCalls.push(asset.href);
          throw new Error("unsafe URL should not be fetched");
        },
      }),
  };
}

function baseInput(url: string) {
  return {
    url,
    kind: "card" as const,
    ownerId: "owner",
    assetId: "asset",
  };
}

async function expectAssetError(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(IntegrationAssetError);
    return;
  }

  throw new Error("expected integration asset ingestion to fail");
}
