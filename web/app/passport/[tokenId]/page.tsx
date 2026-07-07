import { verifyToken, type VerificationResult } from "@/lib/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPLORER =
  process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ||
  "https://testnet-explorer.hsk.xyz";
const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

async function verify(
  tokenIdStr: string
): Promise<VerificationResult | { error: string }> {
  if (!/^\d+$/.test(tokenIdStr)) {
    return { error: "tokenId が不正です。" };
  }
  try {
    return await verifyToken(BigInt(tokenIdStr));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "検証に失敗しました。" };
  }
}

function shortAddr(a: string): string {
  if (!a || a === "0x0") return "0x0（新規発行）";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function fmtTime(t: number | null): string {
  if (!t) return "-";
  return new Date(t * 1000).toLocaleString("ja-JP");
}

export default async function PassportPage({
  params,
}: {
  params: { tokenId: string };
}) {
  const result = await verify(params.tokenId);

  if ("error" in result) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-lg font-bold">VINTAGE PASSPORT</h1>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-semibold">検証できませんでした</p>
          <p className="mt-1 text-sm">{result.error}</p>
        </div>
      </main>
    );
  }

  const r = result;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">VINTAGE PASSPORT</h1>
        <span className="text-xs text-neutral-500">
          Token #{params.tokenId}
        </span>
      </header>

      {/* ✓/✗ バッジ（このページの主役） */}
      <section
        className={`mt-6 rounded-2xl p-6 text-center ${
          r.verified ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}
      >
        <div className="text-5xl font-black leading-none">
          {r.verified ? "✓" : "✗"}
        </div>
        <p className="mt-3 text-xl font-bold">
          {r.verified ? "改ざんなし" : "ハッシュ不一致"}
        </p>
        <p className="mt-1 text-sm opacity-90">
          {r.verified
            ? "オンチェーンのハッシュと鑑定書が一致しました"
            : "鑑定書が改ざんされている可能性があります"}
        </p>
      </section>

      {/* 鑑定書カード */}
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-500">鑑定書</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">アイテム</dt>
            <dd className="font-medium">{r.appraisal?.item_type ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">推定年代</dt>
            <dd className="font-medium">{r.onchain.estimatedEra}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">確信度</dt>
            <dd className="font-medium">{r.onchain.confidence}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">鑑定日時</dt>
            <dd className="font-medium">{fmtTime(r.onchain.appraisedAt)}</dd>
          </div>
        </dl>

        {r.appraisal?.evidence && r.appraisal.evidence.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-neutral-500">証拠</h3>
            <ul className="mt-2 space-y-2">
              {r.appraisal.evidence.map((ev, i) => (
                <li key={i} className="rounded-lg bg-neutral-50 p-3 text-sm">
                  <span className="font-medium">{ev.feature}</span>：
                  {ev.observed}
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    → {ev.implication}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {r.appraisal?.red_flags && r.appraisal.red_flags.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-amber-600">
              レッドフラグ
            </h3>
            <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
              {r.appraisal.red_flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 所有履歴タイムライン（取得失敗しても ✓/✗ は上で表示済み） */}
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-500">所有履歴</h2>
        {r.historyError ? (
          <p className="mt-3 text-sm text-neutral-500">{r.historyError}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {r.history.map((h, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-neutral-400" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {shortAddr(h.from)} → {shortAddr(h.to)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {fmtTime(h.timestamp)} ·{" "}
                    <a
                      href={`${EXPLORER}/tx/${h.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline"
                    >
                      tx
                    </a>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ハッシュ詳細 & explorer */}
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 text-xs shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-500">検証データ</h2>
        <div className="mt-3 space-y-2 break-all font-mono">
          <p>
            <span className="text-neutral-400">on-chain: </span>
            {r.onchain.appraisalHash}
          </p>
          <p>
            <span className="text-neutral-400">recomputed: </span>
            {r.recomputedHash}
          </p>
          <p>
            <span className="text-neutral-400">IPFS CID: </span>
            {r.docCid}
          </p>
        </div>
        <p className="mt-3">
          <a
            href={`${IPFS_GATEWAY}${r.docCid}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            IPFSで鑑定書JSONを見る →
          </a>
        </p>
      </section>
    </main>
  );
}
