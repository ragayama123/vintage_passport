import "server-only";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  decodeEventLog,
  getAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VINTAGE_PASSPORT_ABI } from "./abi";

const RPC_URL = process.env.HASHKEY_TESTNET_RPC_URL || "https://testnet.hsk.xyz";

// HashKey Chain testnet（公式値。chainId=133 は実接続確認済み）
export const hashkeyTestnet = defineChain({
  id: 133,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HashKey EcoPoints", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://testnet-explorer.hsk.xyz",
    },
  },
  testnet: true,
});

// read 用（誰でも呼べる）
export const publicClient = createPublicClient({
  chain: hashkeyTestnet,
  transport: http(RPC_URL),
});

function getContractAddress(): `0x${string}` {
  const addr = process.env.CONTRACT_ADDRESS;
  if (!addr) {
    throw new Error(
      "CONTRACT_ADDRESS が未設定です。コントラクトをデプロイして web/.env.local に設定してください。"
    );
  }
  return getAddress(addr);
}

function getCustodialAccount() {
  const pk = process.env.CUSTODIAL_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "CUSTODIAL_PRIVATE_KEY が未設定です。web/.env.local を確認してください。"
    );
  }
  return privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
}

/** カストディアルウォレットのアドレス（受取先のデフォルト等に使う）。 */
export function custodialAddress(): `0x${string}` {
  return getCustodialAccount().address;
}

// write 用（カストディアル秘密鍵。このモジュールはサーバー専用）
function getWalletClient() {
  return createWalletClient({
    account: getCustodialAccount(),
    chain: hashkeyTestnet,
    transport: http(RPC_URL),
  });
}

export interface OnChainAppraisal {
  appraisalHash: string;
  criteriaHash: string;
  estimatedEra: string;
  confidence: number;
  appraisedAt: bigint;
}

export interface MintParams {
  to: `0x${string}`;
  tokenURI: string; // ipfs://<CID>
  appraisalHash: Hex; // 0x + 64 hex
  criteriaHash: Hex;
  estimatedEra: string;
  confidence: number; // 0-100
  appraisedAt: number; // unix sec
}

/**
 * 鑑定書付きでミント。receipt から AppraisalMinted を decode して tokenId を得る
 * （戻り値からは取れないため）。
 */
export async function mintWithAppraisal(
  params: MintParams
): Promise<{ tokenId: bigint; txHash: Hex }> {
  const wallet = getWalletClient();
  const address = getContractAddress();

  const txHash = await wallet.writeContract({
    address,
    abi: VINTAGE_PASSPORT_ABI,
    functionName: "mintWithAppraisal",
    args: [
      params.to,
      params.tokenURI,
      {
        appraisalHash: params.appraisalHash,
        criteriaHash: params.criteriaHash,
        estimatedEra: params.estimatedEra,
        confidence: params.confidence,
        appraisedAt: BigInt(params.appraisedAt),
      },
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
  });

  // AppraisalMinted イベントを探して tokenId を取り出す
  let tokenId: bigint | undefined;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: VINTAGE_PASSPORT_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "AppraisalMinted") {
        tokenId = (decoded.args as { tokenId: bigint }).tokenId;
        break;
      }
    } catch {
      // 対象外のログはスキップ
    }
  }
  if (tokenId === undefined) {
    throw new Error(
      "ミントは成功しましたが AppraisalMinted イベントから tokenId を取得できませんでした。"
    );
  }
  return { tokenId, txHash };
}

/**
 * オンチェーンの appraisals(tokenId) と tokenURI を読む。
 */
export async function readAppraisal(tokenId: bigint): Promise<{
  appraisal: OnChainAppraisal;
  tokenURI: string;
}> {
  const address = getContractAddress();

  const [result, tokenURI] = await Promise.all([
    publicClient.readContract({
      address,
      abi: VINTAGE_PASSPORT_ABI,
      functionName: "appraisals",
      args: [tokenId],
    }),
    publicClient.readContract({
      address,
      abi: VINTAGE_PASSPORT_ABI,
      functionName: "tokenURI",
      args: [tokenId],
    }),
  ]);

  // appraisals は tuple を配列で返す
  const [appraisalHash, criteriaHash, estimatedEra, confidence, appraisedAt] =
    result as [string, string, string, number, bigint];

  return {
    appraisal: {
      appraisalHash,
      criteriaHash,
      estimatedEra,
      confidence: Number(confidence),
      appraisedAt,
    },
    tokenURI: tokenURI as string,
  };
}

export interface TransferRecord {
  from: string;
  to: string;
  txHash: string;
  blockNumber: bigint;
  timestamp: number | null;
}

/**
 * getLogs の走査開始ブロック。
 * 公開RPCは広いブロック範囲の eth_getLogs を拒否することがあるため、
 * デプロイ時のブロック番号(DEPLOY_BLOCK)を設定して範囲を絞る。
 * 未設定なら 0 から（開発初期のフォールバック）。
 */
function historyFromBlock(): bigint {
  const v = process.env.DEPLOY_BLOCK;
  return v && /^\d+$/.test(v) ? BigInt(v) : 0n;
}

/**
 * Transfer イベントから所有履歴を構築する。
 */
export async function getTransferHistory(
  tokenId: bigint
): Promise<TransferRecord[]> {
  const address = getContractAddress();

  const logs = await publicClient.getContractEvents({
    address,
    abi: VINTAGE_PASSPORT_ABI,
    eventName: "Transfer",
    args: { tokenId },
    fromBlock: historyFromBlock(),
    toBlock: "latest",
  });

  const records: TransferRecord[] = [];
  for (const log of logs) {
    const args = log.args as { from?: string; to?: string };
    // ブロックのタイムスタンプ取得（失敗しても履歴自体は返す）
    let timestamp: number | null = null;
    try {
      const block = await publicClient.getBlock({
        blockNumber: log.blockNumber,
      });
      timestamp = Number(block.timestamp);
    } catch {
      timestamp = null;
    }
    records.push({
      from: args.from ?? "0x0",
      to: args.to ?? "0x0",
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp,
    });
  }
  return records;
}
