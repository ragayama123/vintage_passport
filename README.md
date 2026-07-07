# VINTAGE PASSPORT

**AIが鑑定し、ブロックチェーンが記憶する。**

ヴィンテージ品（Levi's 501等）の鑑定書をNFT化し、転売のたびに履歴が引き継がれる仕組み。
鑑定書の実データはIPFSに保存し、チェーンにはそのハッシュと要約属性のみを刻む。
これにより「鑑定書が改ざんされていないこと」を誰でも検証できる。

> HashKey Chain On-Chain Horizon Hackathon · Japan (DoraHacks) 提出物

---

## デモの流れ（3分）

1. 実物の501を撮影（全体・タグ・刻印など）
2. **AI鑑定** → 証拠リスト付きの鑑定書を生成
3. **NFTミント** → 画像と鑑定書をIPFSに保存し、ハッシュをチェーンに記録
4. 完了画面のQRを検証ページで開く
5. **ハッシュ照合「✓改ざんなし」** が表示される
6. （山場）IPFS上の鑑定書を1文字でも変えると「✗ハッシュ不一致」になる

---

## アーキテクチャ

```
[出品者ブラウザ(スマホ)]
   │ 画像アップロード(タグ/刻印/全体)
   ▼
[Next.js API /api/appraise]
   │ Claude API (Vision, claude-sonnet-5) で鑑定 → 構造化JSON
   ▼
[Next.js API /api/mint]
   ├─ 画像+鑑定書JSONを IPFS (Pinata) にアップロード
   ├─ 鑑定書JSONのSHA-256を計算
   └─ HashKey Chain testnet の ERC-721 にミント
        (サーバー管理のカストディアルウォレットで署名。ユーザーにウォレット操作させない)
   ▼
[検証ページ /passport/[tokenId]]
   ├─ チェーンから tokenURI / appraisalHash / 転送履歴を取得
   ├─ IPFSから鑑定書JSONを取得し、その場でSHA-256を再計算
   └─ 一致すれば「✓ 改ざんなし」を表示
```

**設計原則**: 実データ（画像・鑑定書JSON）はIPFS、チェーンにはハッシュと要約属性のみ。

### ハッシュ照合が確実に一致する仕組み（本プロジェクトの核）

鑑定書JSONを「決定的にシリアライズ」して**バイト列を1つだけ**作り、その同一バイト列を
**(a) SHA-256** と **(b) IPFS pin** の両方に使う。検証側はIPFSゲートウェイから取得した
バイト列を**そのまま再ハッシュ**する。これにより照合が構造的に事故らない。
実装は [`web/lib/canonicalize.ts`](web/lib/canonicalize.ts) と [`web/app/api/mint/route.ts`](web/app/api/mint/route.ts) を参照。

---

## 技術スタック

| レイヤ | 技術 |
|---|---|
| フロント/API | Next.js 14 (App Router) + TypeScript |
| AI鑑定 | Anthropic Claude API（`claude-sonnet-5`, Vision, 構造化JSON） |
| ストレージ | Pinata (IPFS) |
| チェーン | HashKey Chain **testnet**（EVM, chainId 133） |
| コントラクト | Solidity 0.8.24 + OpenZeppelin ERC-721 v5, Hardhat |
| チェーン接続 | viem（サーバーサイド署名） |
| QR / UI | qrcode / Tailwind CSS |

### HashKey Chain testnet（実接続確認済み）

| 項目 | 値 |
|---|---|
| RPC URL | `https://testnet.hsk.xyz` |
| Chain ID | `133` |
| Explorer | `https://testnet-explorer.hsk.xyz` (Blockscout) |
| Faucet | `https://faucet.hsk.xyz/faucet` |
| 通貨 | HSK (decimals 18) |

---

## リポジトリ構成

```
vintage-passport/
├── contracts/                          # Hardhatプロジェクト
│   ├── contracts/VintagePassport.sol   # ERC721 + Ownable, mintWithAppraisal
│   ├── scripts/deploy.ts               # testnetデプロイ
│   ├── scripts/checkChain.ts           # RPC疎通 & chainId=133 確認
│   └── test/VintagePassport.test.ts    # mint→取得→transfer→再取得
├── web/                                # Next.js
│   ├── app/
│   │   ├── page.tsx                    # 出品フロー(撮影→鑑定→ミント)
│   │   ├── passport/[tokenId]/page.tsx # 検証ページ(✓/✗バッジ)
│   │   └── api/{appraise,mint,verify}/route.ts
│   ├── lib/
│   │   ├── canonicalize.ts             # 決定的JSON + SHA-256(土台)
│   │   ├── claude.ts                   # 鑑定エンジン
│   │   ├── ipfs.ts                     # Pinata (pinFileToIPFS)
│   │   ├── chain.ts                    # viem client / mint / 履歴(サーバー専用)
│   │   ├── abi.ts                      # コントラクトABI
│   │   ├── appraisal.ts                # 鑑定書スキーマ(zod)
│   │   └── criteria/levis501.ts        # 判定基準表 + criteriaHash
│   ├── test/canonicalize.test.ts       # ハッシュ土台の単体テスト
│   └── .env.local.example
└── README.md
```

---

## セットアップ手順

### 0. 前提

- Node.js 20+
- 3つのクレデンシャルを取得する（下記）

### 1. クレデンシャル取得

| 変数 | 取得先 |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com でキー発行 |
| `PINATA_JWT` | https://app.pinata.cloud（無料）→ API Key（pinning権限）→ JWT |
| `CUSTODIAL_PRIVATE_KEY` | 新規 testnet 用ウォレットの秘密鍵。**mainnet資産の入ったウォレットは絶対に使わない** |

秘密鍵のアドレスに、faucet でガス代 HSK を取得:
`https://faucet.hsk.xyz/faucet`

### 2. コントラクトのデプロイ

```bash
cd contracts
npm install
cp ../web/.env.local.example ../web/.env.local   # 秘密鍵などを埋める
npm run chainid        # chainId=133 の実接続確認
npm test               # ローカルでコントラクトテスト
npm run deploy:testnet # testnet へデプロイ → アドレスが表示される
```

デプロイ完了時に表示される `CONTRACT_ADDRESS` と `DEPLOY_BLOCK` を `web/.env.local` に設定する
（`DEPLOY_BLOCK` は所有履歴取得の走査開始ブロック。公開RPCの getLogs 範囲制限対策）。

### 3. Web アプリの起動

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

### 4. 動作確認

- `http://localhost:3000` で画像をアップロード → 鑑定 → ミント
- 完了画面のQR / リンクから検証ページを開き「✓改ざんなし」を確認
- Explorer リンクで mint tx を確認

---

## テスト

```bash
# ハッシュ照合の土台（決定的シリアライズ）
cd web && npm test

# スマートコントラクト（mint→取得→transfer→再取得, onlyOwner）
cd contracts && npm test
```

---

## スマートコントラクト仕様

`VintagePassport.sol` — OpenZeppelin `ERC721URIStorage` + `Ownable`。

- `mintWithAppraisal(to, tokenURI_, Appraisal)` — ミント権限はデプロイヤー（カストディアルウォレット）のみ
- 鑑定データ `struct Appraisal { appraisalHash, criteriaHash, estimatedEra, confidence, appraisedAt }` は
  **ミント後に書き換え不可**（setter を作っていない＝改ざん不可を担保）
- 転送は標準ERC-721のまま。所有履歴 = Transfer イベント

---

## 既知の設計上の論点（今後のロードマップ）

- **Physical binding問題**: NFTと実物の紐付けは現状、画像ハッシュによる弱い紐付け。
  将来はNFCチップ縫い込みで実物とトークンを強く結びつける。
- **鑑定の中央集権性**: 現状は単一AI鑑定だが、`criteriaHash` を公開することで鑑定基準は検証可能。
  将来は複数鑑定者のステーキング型オラクルへ。

### 技術的な注記

- Next.js は 14.2.x（パッチ済み）に固定。残存する advisory は image-optimization / i18n / RSC cache に
  関するもので、本デモ（testnet・画像最適化やi18n不使用・非公開デモ）の脅威モデルに影響しない。
  Next.js 16 への移行は破壊的変更のため本ハッカソンでは見送り。
- HashKey Chain は OP Stack L2（Ecotone/Dencun 適用済み）のため、Solidity の `evmVersion: cancun`
  でビルドしている（OpenZeppelin v5.6 が `mcopy` を使うため）。

---

## スコープ外（未実装）

- ユーザー認証・アカウント管理（カストディアルで代替）
- 決済・売買機能（転送のみ）
- mainnetデプロイ
- 501以外のアイテムの判定基準表（`item_type`は受けるが基準表はv1.0のみ）
- NFCタグ連携（将来構想）
