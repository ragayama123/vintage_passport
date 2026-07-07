# 引き継ぎメモ — VINTAGE PASSPORT

最終更新: 2026-07-07（このドキュメントを更新したら日付も更新すること）

このファイルは開発の状態を次のセッション/担当者に引き継ぐためのもの。
プロダクト仕様は [vintage-passport-design.md](vintage-passport-design.md)、
セットアップ手順は [README.md](README.md) を参照。ここには**今この瞬間の状態**と
**次に何をすべきか**だけを書く。

---

## 締切

**2026-07-11 15:00 JST**（HashKey Chain On-Chain Horizon Hackathon · DoraHacks 提出）

---

## 現在の状態（ひとことで）

**P0のコードは全て実装・レビュー修正・検証済み。GitHubにプッシュ済み。
未実施なのは「実クレデンシャルでの testnet デプロイと実機動作確認」のみ。**

- リポジトリ: https://github.com/ragayama123/vintage_passport （`main` ブランチ、1コミット `d166789`）
- ローカルパス: `/Users/koji/Documents/開発/VINTAGE PASSPORT`

### 動作確認済み（クレデンシャル不要な範囲）

| 項目 | 結果 |
|---|---|
| `web` typecheck (`tsc --noEmit`) | ✅ 通過 |
| `web` 単体テスト（`npm test` in `web/`） | ✅ 8/8 pass（canonicalize.ts のハッシュ照合ロジック） |
| `web` 本番ビルド（`npm run build`） | ✅ 全5ルート成功 |
| `contracts` typecheck | ✅ 通過 |
| `contracts` Hardhatテスト（`npx hardhat test`） | ✅ 3/3 pass（mint→取得→transfer→再取得、onlyOwner） |
| HashKey Chain testnet 実接続 | ✅ `eth_chainId` = 133、ブロック生成中、explorer 200 |

### 未実施（クレデンシャルが必要）

- [ ] コントラクトの testnet デプロイ
- [ ] `/api/appraise` の実際のClaude API呼び出し確認（手元の501画像で）
- [ ] `/api/mint` の実IPFS pin + オンチェーンミント確認
- [ ] 検証ページで「✓改ざんなし」表示確認
- [ ] IPFS上のJSONを1文字改変して「✗ハッシュ不一致」になることの確認（デモの山場）
- [ ] スマホ実機での出品フロー一周（写真撮影→鑑定→ミント）

---

## 次にやること（優先順）

1. **クレデンシャルを3つ取得**して `web/.env.local` を作る（`web/.env.local.example` をコピー）
   - `ANTHROPIC_API_KEY` — console.anthropic.com
   - `PINATA_JWT` — app.pinata.cloud（無料、pinning権限付きAPI Key）
   - `CUSTODIAL_PRIVATE_KEY` — testnet専用の新規ウォレット。**mainnet資産の入ったウォレットは絶対に使わない**。
     アドレスに https://faucet.hsk.xyz/faucet で HSK（ガス代）を取得

2. **コントラクトをデプロイ**
   ```bash
   cd contracts
   npm install
   npm run chainid          # chainId=133 の実接続を再確認（既に確認済みだが念のため）
   npm test                 # ローカルでコントラクトテスト（既にPASS確認済み）
   npm run deploy:testnet   # デプロイ実行
   ```
   デプロイ完了時に `CONTRACT_ADDRESS` と `DEPLOY_BLOCK` が表示される。両方を `web/.env.local` に設定する
   （`DEPLOY_BLOCK` は所有履歴取得の走査開始ブロック。設定しないと block 0 から走査して公開RPCに拒否されうる）。

3. **Webアプリを起動して end-to-end 確認**
   ```bash
   cd web
   npm install
   npm run dev   # http://localhost:3000
   ```
   - 画像アップロード → 鑑定 → ミント → 完了画面のQR/リンクから検証ページへ
   - 「✓改ざんなし」が出ることを確認
   - **デモの山場**: IPFS上の鑑定書JSON（Pinataダッシュボードまたは検証ページの「IPFSで鑑定書JSONを見る」リンクから確認できるCID）を別途1文字改変して再pinし、その版で検証すると「✗ハッシュ不一致」になることを確認しておく（本番デモで使う）

4. **P0が全部緑になったら P1へ**（設計書の鉄則: P0が動くまでP1に着手しない）
   - 出品フローUIのスマホ最適化の微調整（既に基本のスマホレイアウトは実装済み）
   - README の最終磨き込み（既に大枠は完成）
   - デモ用のtokenを前日にミントしておく（testnet不安定リスクの保険）

---

## 設計からの確定変更点（設計書 vs 実装）

作業中にユーザーと合意して設計書から変えた点。実装はこちらが正。

| 項目 | 設計書 | 実装（確定） |
|---|---|---|
| 鑑定モデル | `claude-sonnet-4-6` | **`claude-sonnet-5`**（[web/lib/claude.ts](web/lib/claude.ts) の `APPRAISAL_MODEL`） |
| 環境変数名 | `ANTHROPIC_API_KEY` | 変更なし（そのまま） |
| RPC URL | 未確定（要確認と記載） | **`https://testnet.hsk.xyz`** （公式値。`alt.technology` 系の古い記載は不採用） |
| Chain ID | 133（要確認と記載） | **133 を実接続で確認済み** |
| Solidity evmVersion | 未指定 | **`cancun`** を明示（OpenZeppelin v5.6 が `mcopy` オペコードを要求するため。HashKey ChainはOP StackでCancun/Dencun対応済み） |

---

## アーキテクチャ上の重要な設計判断

### ハッシュ照合が確実に一致する仕組み（本プロジェクトの核・最重要）

[web/lib/canonicalize.ts](web/lib/canonicalize.ts) が全ての土台。

**方針**: 鑑定書JSONを決定的にシリアライズして**バイト列を1つだけ**作り、その同一バイト列を
**(a) SHA-256** と **(b) IPFS pin** の両方に使う。検証側（[web/lib/verify.ts](web/lib/verify.ts)）は
IPFSゲートウェイから取得したバイト列を**そのまま再ハッシュ**する。

これを守るための実装上のルール（変更する際は要注意）:
- Pinata は `pinFileToIPFS` のみ使用（[web/lib/ipfs.ts](web/lib/ipfs.ts)）。`pinJSONToIPFS` は**絶対に使わない**（Pinata側で再整形されバイトがずれる）
- IPFS取得は `res.json()` ではなく `res.arrayBuffer()`（同ファイル）
- ハッシュ比較は小文字化・`0x`有無を吸収（`hashesEqual`, canonicalize.ts）
- `image_cids` の追記は必ずハッシュ計算より**前**に完了させる（[web/app/api/mint/route.ts](web/app/api/mint/route.ts)）

単体テスト（[web/test/canonicalize.test.ts](web/test/canonicalize.test.ts)）でこの経路の性質を8件検証済み。
**このロジックを触ったら必ず `cd web && npm test` を再実行すること。**

### 秘密鍵の隔離

[web/lib/chain.ts](web/lib/chain.ts) の先頭に `import "server-only"` があり、`CUSTODIAL_PRIVATE_KEY` は
このモジュール内でのみ読まれる。クライアントコンポーネントから import すると Next.js のビルドが失敗する
（意図的なガード）。本番ビルド成功＝クライアントバンドルへの秘密鍵混入がないことの確認材料。

### 所有履歴取得の堅牢化（レビュー修正で追加）

[web/lib/verify.ts](web/lib/verify.ts) は「オンチェーンのハッシュ照合」と「所有履歴取得」を独立した
try/catch に分離している。**履歴取得が失敗しても ✓/✗ バッジは必ず表示される**設計（履歴欄だけ
degrade してエラーメッセージを出す）。デモの主役（✓/✗バッジ）を履歴取得の失敗で巻き込まないため。

`DEPLOY_BLOCK` 環境変数未設定時は block 0 から `eth_getLogs` するため、公開RPCの範囲制限に
引っかかる可能性がある。デプロイ後は必ず `DEPLOY_BLOCK` を設定すること。

---

## 直近のレビューで修正した項目（参考）

一度実装レビューを行い、以下を修正済み（コミット `d166789` に含まれる）:

1. **クライアント側画像リサイズ未実装** → [web/app/page.tsx](web/app/page.tsx) の `fileToJpegDataUrl()` で
   長辺1568px JPEGに変換してから送信。スマホ実写（4〜12MB）がClaude APIの5MB/枚制限に
   引っかかる問題とHEIC非対応問題を解消。
2. **所有履歴取得が block 0 から全走査** → `DEPLOY_BLOCK` 対応 + 履歴失敗と✓/✗判定の分離（上記）。
3. **IPFS取得にタイムアウトなし** → 30秒タイムアウト + 最大2回リトライ（pin直後の伝播待ち対策）。
4. **`/api/mint` の `to` 不正時に黙ってフォールバック** → 400エラーを返すよう修正。

これ以上の既知の指摘事項は無い。次にレビューする際は `/code-review` スキルの利用を推奨。

---

## ファイル構成の参照ポイント

実装を素早く把握するための地図。詳細は各ファイルのコメントを参照。

```
contracts/contracts/VintagePassport.sol   # ERC721+Ownable, setter無し(改ざん不可の根拠)
contracts/scripts/deploy.ts               # デプロイ + CONTRACT_ADDRESS/DEPLOY_BLOCK出力
web/lib/canonicalize.ts                   # ★最重要: ハッシュ照合の土台
web/lib/verify.ts                         # 検証ロジック共通実装(API/ページ両方で使用)
web/lib/chain.ts                          # viem, カストディアル署名, server-only
web/lib/ipfs.ts                           # Pinata pin(pinFileToIPFS限定), タイムアウト+リトライ
web/lib/claude.ts                         # Vision鑑定, claude-sonnet-5, JSON fence除去
web/lib/criteria/levis501.ts              # 判定基準表v1.0 + criteriaHash
web/app/api/{appraise,mint,verify}/       # 3つのAPI Route
web/app/page.tsx                          # 出品フロー(画像リサイズ含む)
web/app/passport/[tokenId]/page.tsx       # 検証ページ(✓/✗バッジ)
```

---

## 参考: 過去の計画ファイル

初回実装時に立てた計画（HashKey Chain調査結果、日割り、リスク対処を含む）:
`/Users/koji/.claude/plans/crispy-kindling-raccoon.md`

このHANDOFF.mdと内容が重複する部分もあるが、より詳細な調査結果（RPC調査の出典等）が
必要な場合はそちらを参照。
