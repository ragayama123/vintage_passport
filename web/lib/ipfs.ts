import "server-only";

const PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

function getJwt(): string {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "PINATA_JWT が未設定です。web/.env.local を確認してください。"
    );
  }
  return jwt;
}

function gatewayBase(): string {
  return (
    process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
    "https://gateway.pinata.cloud/ipfs/"
  );
}

/**
 * 任意のバイト列をファイルとして Pinata に pin する。
 * 【重要】pinJSONToIPFS は使わない（Pinata側で再整形されバイトがずれるため）。
 * ここで渡した bytes がそのまま IPFS に保存される。
 * @returns CID
 */
export async function pinBytes(
  bytes: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const form = new FormData();
  // Buffer をそのまま Blob に入れると strict 型で弾かれるため Uint8Array に包む
  // （バイト内容は変わらない。pin されるバイト列は同一）
  const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
  form.append("file", blob, filename);
  form.append("pinataMetadata", JSON.stringify({ name: filename }));

  const res = await fetch(PINATA_PIN_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${getJwt()}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Pinata pin に失敗しました (${res.status}): ${text.slice(0, 300)}`
    );
  }
  const json = (await res.json()) as { IpfsHash?: string };
  if (!json.IpfsHash) {
    throw new Error("Pinata 応答に IpfsHash がありません。");
  }
  return json.IpfsHash;
}

/**
 * 画像(base64)を pin する。
 */
export async function pinImageBase64(
  base64: string,
  label: string,
  mediaType: string
): Promise<string> {
  const clean = base64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").replace(/\s/g, "");
  const bytes = Buffer.from(clean, "base64");
  const ext = mediaType.split("/")[1] || "jpg";
  return pinBytes(bytes, `${label}.${ext}`, mediaType);
}

/**
 * IPFS ゲートウェイから CID のバイト列を取得する。
 * 【重要】.json() は使わず arrayBuffer() でバイト列をそのまま得る（再ハッシュ用）。
 *
 * 公開ゲートウェイは混雑時にハングすることがあるため 30秒タイムアウト。
 * pin 直後は伝播待ちで 404/504 になることがあるためリトライする。
 */
export async function fetchBytesFromIpfs(
  cid: string,
  opts?: { retries?: number; timeoutMs?: number }
): Promise<Buffer> {
  const url = `${gatewayBase()}${cid}`;
  const retries = opts?.retries ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 30_000;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
      }
      lastError = new Error(`IPFS 取得に失敗しました (${res.status}): ${url}`);
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries) {
      // 伝播待ちを考慮して少し待ってから再試行（2s, 4s, ...）
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`IPFS 取得に失敗しました: ${url}`);
}

/**
 * ipfs://<cid> または生の cid から CID を取り出す。
 */
export function cidFromTokenURI(tokenURI: string): string {
  return tokenURI.startsWith("ipfs://")
    ? tokenURI.slice("ipfs://".length)
    : tokenURI;
}
