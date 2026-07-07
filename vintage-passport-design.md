# VINTAGE PASSPORT 実装設計書

Claude Code への実装指示書。この設計書に従って実装すること。
不明点があれば実装前に質問すること。勝手にスコープを広げないこと。

---

## 0. プロジェクト概要

- **プロダクト名**: VINTAGE PASSPORT
- **一言**: AIが鑑定し、ブロックチェーンが記憶する。ヴィンテージ品(Levi's 501等)の鑑定書をNFT化し、転売のたびに履歴が引き継がれる仕組み
- **提出先**: HashKey Chain On-Chain Horizon Hackathon · Japan (DoraHacks)
- **締切**: 2026-07-11 15:00 JST。**残り期間が短いため、優先度順に実装し、動くものを最優先とする**
- **デモシナリオ(3分)**: 実物の501を撮影 → AI鑑定書生成(証拠リスト付き) → NFTミント → 検証ページでQRスキャン → ハッシュ照合「✓改ざんなし」表示

## 1. アーキテクチャ全体像

```
[出品者ブラウザ(スマホ)]
   │ 画像アップロード(タグ/刻印/全体)
   ▼
[Next.js API Route /api/appraise]
   │ Claude API (Vision) で鑑定 → 構造化JSON
   ▼
[Next.js API Route /api/mint]
   ├─ 画像+鑑定書JSONを IPFS (Pinata) にアップロード
   ├─ 鑑定書JSONのSHA-256を計算
   └─ HashKey Chain testnet の ERC-721 コントラクトにミント
        (サーバー管理のカストディアルウォレットで署名。ユーザーにウォレット操作をさせない)
   ▼
[検証ページ /passport/[tokenId]]
   ├─ チェーンから tokenURI / appraisalHash / 転送履歴を取得
   ├─ IPFSから鑑定書JSONを取得し、その場でSHA-256を再計算
   └─ 一致すれば「✓ 改ざんなし」を表示
```

設計原則: **実データ(画像・鑑定書JSON)はIPFS、チェーンにはハッシュと要約属性のみ**。

## 2. 技術スタック

| レイヤ | 技術 | 備考 |
|---|---|---|
| フロント/API | Next.js 14+ (App Router) + TypeScript | 1リポジトリのモノレポ構成 |
| AI鑑定 | Anthropic API (claude-sonnet-4-6, Vision) | 構造化JSON出力 |
| ストレージ | Pinata (IPFS) | 無料枠。REST APIで pin |
| チェーン | HashKey Chain **testnet** (EVM, chainId 133) | RPC URL・faucet・explorer URLは公式ドキュメント (docs.hsk.xyz 等) を実装時に必ず確認すること。ハードコードする前に接続テストを行う |
| コントラクト | Solidity 0.8.x + OpenZeppelin ERC-721 | Hardhat でデプロイ |
| チェーン接続 | viem | サーバーサイド署名(カストディアル) |
| QRコード | qrcode (npm) | 検証ページURLをQR化 |
| UI | Tailwind CSS | 凝らない。デモが映える最低限 |

## 3. リポジトリ構成

```
vintage-passport/
├── contracts/               # Hardhatプロジェクト
│   ├── contracts/VintagePassport.sol
│   ├── scripts/deploy.ts
│   └── hardhat.config.ts
├── web/                     # Next.js
│   ├── app/
│   │   ├── page.tsx                    # 出品(撮影→鑑定→ミント)フロー
│   │   ├── passport/[tokenId]/page.tsx # 検証ページ
│   │   └── api/
│   │       ├── appraise/route.ts
│   │       ├── mint/route.ts
│   │       └── verify/route.ts
│   ├── lib/
│   │   ├── claude.ts        # 鑑定エンジン
│   │   ├── ipfs.ts          # Pinata
│   │   ├── chain.ts         # viem client / contract
│   │   └── criteria/levis501.ts  # 判定基準表(バージョン管理対象)
│   └── .env.local.example
└── README.md                # 審査員向け。セットアップ手順+デモ手順+アーキ図
```

## 4. スマートコントラクト仕様

`VintagePassport.sol` — OpenZeppelin `ERC721` + `Ownable` を継承。**シンプルに保つこと**。

```solidity
struct Appraisal {
    bytes32 appraisalHash;   // 鑑定書JSONのSHA-256
    bytes32 criteriaHash;    // 判定基準表のSHA-256
    string  estimatedEra;    // 例 "1974-1976"
    uint8   confidence;      // 0-100
    uint64  appraisedAt;     // unix time
}

mapping(uint256 => Appraisal) public appraisals;

function mintWithAppraisal(
    address to,
    string calldata tokenURI_,   // ipfs://<鑑定書JSONのCID>
    Appraisal calldata a
) external onlyOwner returns (uint256 tokenId);

event AppraisalMinted(uint256 indexed tokenId, bytes32 appraisalHash, string estimatedEra);
```

- ミント権限はデプロイヤー(=サーバーのカストディアルウォレット)のみ
- 鑑定データはミント後**書き換え不可**(setter を作らない)
- 転送は標準ERC-721のまま(履歴 = Transfer イベント)
- Hardhatで最低限のテスト: ミント→appraisals取得→transfer→再取得

## 5. AI鑑定エンジン仕様(プロダクトの核)

### 5.1 入力
- 画像 3〜5枚(base64): ①全体 ②パッチ/ケアタグ ③ボタン裏刻印 ④赤タブ ⑤裾・セルビッジ
- 画像種別はユーザーがアップロード時にラベル選択(全体/タグ/刻印/その他)

### 5.2 出力スキーマ(この形に固定)

```json
{
  "item_type": "Levi's 501",
  "estimated_era": "1974-1976",
  "confidence": 0.82,
  "evidence": [
    {"feature": "ボタン裏刻印", "observed": "6", "implication": "1970年代の特定工場を示唆"},
    {"feature": "赤タブ", "observed": "small e 片面", "implication": "1971年以降"},
    {"feature": "セルビッジ", "observed": "赤耳あり", "implication": "1983年以前の旧織機"}
  ],
  "red_flags": ["ステッチ色とパッチ年代の不整合"],
  "notes": "判定に使えなかった画像・不鮮明箇所の指摘",
  "model_version": "claude-sonnet-4-6",
  "criteria_version": "v1.0"
}
```

実装注意:
- system promptで「JSONのみを返す。前置き・コードフェンス禁止」と明示し、パース前にフェンス除去のフォールバックを入れる
- `evidence` は必ず1件以上。判定不能なら `estimated_era: "判定不能"` + `notes` に理由
- `confidence` は evidence の整合性から算出させる(矛盾があれば下げる)

### 5.3 判定基準表 `criteria/levis501.ts`

以下の内容でTypeScriptの定数として実装し、JSON化した文字列のSHA-256を `criteriaHash` としてミント時に渡す。プロンプトにはこの表を埋め込む。

| 特徴 | 観察値 | 年代含意 |
|---|---|---|
| 赤タブ | 両面ビッグE | 〜1971年頃 |
| 赤タブ | 片面スモールe | 1971年頃〜 |
| ケアタグ | 無し | 〜1971年頃(または欠損) |
| ケアタグ | 有り(表記形式で細分) | 1971年頃〜 |
| セルビッジ(赤耳) | 有り | 〜1983年頃(旧式織機) |
| セルビッジ | 無し(脇割り) | 1983年頃〜 |
| ボタン裏刻印 | 数字1桁(2,5,6,8等) | 60〜80年代の工場番号 |
| ボタン裏刻印 | 3桁数字(501,524,555等) | 80年代以降。555=バレンシア工場(復刻含む) |
| パッチ | 紙パッチ | 1950年代後半〜 |
| バックポケット | 隠しリベット | 〜1966年頃 |
| ステッチ | 裾チェーンステッチ | オリジナル裾の可能性。シングルは裾上げ済みを示唆 |
| 内側 | ケアタグの洗濯表示形式・MADE IN表記 | 米国製/外国製、90年代以降の判別 |

※この表は初版(v1.0)。ハッカソン後に精緻化する前提でバージョン番号を持たせる。

### 5.4 プロンプト構成

```
system:
  あなたはヴィンテージLevi'sの鑑定士。以下の判定基準表に基づき、
  画像から観察できる事実のみを根拠に年代を推定する。
  推測で断定しない。観察できない特徴は evidence に含めない。
  出力は指定JSONスキーマのみ。
  <判定基準表をここに埋め込み>
  <出力スキーマをここに埋め込み>

user: [images] + 各画像のラベル
```

## 6. API仕様

### POST /api/appraise
- in: `{ images: [{ label: string, data: base64 }] }`
- 処理: Claude API呼び出し → JSONパース・バリデーション(zod)
- out: 鑑定書JSON(5.2の形)
- エラー時: 400/500 と日本語エラーメッセージ

### POST /api/mint
- in: `{ appraisal: <鑑定書JSON>, images: [...] }`
- 処理:
  1. 画像をPinataにpin → CID配列
  2. 鑑定書JSONに `image_cids` を追記 → Pinataにpin → 鑑定書CID
  3. 鑑定書JSON(追記後)のSHA-256を計算
  4. viemで `mintWithAppraisal` 実行(サーバー秘密鍵で署名)
- out: `{ tokenId, txHash, tokenURI, verifyUrl }`

### GET /api/verify?tokenId=N
- 処理:
  1. コントラクトから `appraisals(tokenId)` と `tokenURI` を読む
  2. IPFSゲートウェイから鑑定書JSONを取得
  3. SHA-256を再計算しオンチェーン値と比較
  4. Transferイベントを取得し所有履歴を構築
- out: `{ verified: boolean, appraisal, history: [{from,to,txHash,timestamp}] }`

## 7. 画面仕様(2画面のみ)

### 出品フロー `/`
1. 画像アップロード(ラベル付き、複数)
2. 「AI鑑定する」ボタン → ローディング → 鑑定書カード表示(年代・confidence・evidenceリスト・red_flags)
3. 「鑑定書をチェーンに記録する」ボタン → ミント → 完了画面(tokenId、explorerリンク、検証ページQRコード)

### 検証ページ `/passport/[tokenId]`
- 鑑定書カード(evidence含む)
- **「✓ 改ざんなし」/「✗ ハッシュ不一致」バッジ**(このページの主役)
- 所有履歴タイムライン
- オンチェーンデータへのexplorerリンク
- スマホ表示最優先(審査員がQRから開く想定)

## 8. 環境変数 `.env.local.example`

```
ANTHROPIC_API_KEY=
PINATA_JWT=
HASHKEY_TESTNET_RPC_URL=      # 公式docsで確認
CHAIN_ID=133
CUSTODIAL_PRIVATE_KEY=        # testnet専用。絶対にmainnet資産を入れない
CONTRACT_ADDRESS=             # デプロイ後に設定
NEXT_PUBLIC_EXPLORER_BASE_URL=
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

秘密鍵・APIキーは絶対にコミットしない。`.gitignore` に `.env*` を含める。

## 9. 実装優先順位(この順で進める)

| P | タスク | 完了条件 |
|---|---|---|
| P0 | 鑑定エンジン(/api/appraise + criteria + プロンプト) | 手元画像で妥当なJSONが返る |
| P0 | コントラクト作成 + HashKey testnetデプロイ | explorerでmint txが見える |
| P0 | /api/mint(IPFS+ミント) | tokenIdとtxHashが返る |
| P0 | 検証ページ(ハッシュ照合+履歴) | 「✓改ざんなし」が表示される |
| P1 | 出品フローUI(スマホ対応) | スマホで撮影→ミントまで通る |
| P1 | QRコード生成 | QR→検証ページが開く |
| P1 | README(審査員向け: 概要/アーキ図/セットアップ/デモ手順) | 第三者が再現できる |
| P2 | 転送(転売)デモ用の簡易transfer機能 | 履歴が2件以上になる |
| P2 | UI磨き込み | — |

**P0がすべて動くまでP1に着手しないこと。**

## 10. スコープ外(実装しない)

- ユーザー認証・アカウント管理(カストディアルで代替)
- 決済・売買機能(転送デモのみ)
- mainnetデプロイ
- 501以外のアイテムの判定基準表(item_typeは受けるが基準表はv1.0のみ)
- NFCタグ連携(ピッチで将来構想として言及するのみ)

## 11. 既知の設計上の論点(READMEに明記する)

- **Physical binding問題**: NFTと実物の紐付けは画像ハッシュによる弱い紐付け。将来はNFCチップ縫い込みで対応する旨をREADMEのroadmapに記載
- **鑑定の中央集権性**: 現状は単一AI鑑定だが、criteriaHashの公開により鑑定基準は検証可能。将来は複数鑑定者のステーキング型オラクルへ、とroadmapに記載

## 12. 動作確認チェックリスト(締切前に必ず実施)

- [ ] クリーンな環境で README 通りにセットアップして動く
- [ ] スマホ実機で出品フロー一周(デモは実物501+スマホで行う)
- [ ] 検証ページで「✓改ざんなし」表示
- [ ] IPFSの鑑定書JSONを1文字変えたら「✗不一致」になることを確認(デモの山場に使える)
- [ ] explorerリンクが正しいtxを指す
- [ ] .envがリポジトリに含まれていない
