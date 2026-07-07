import { bytesAndHash } from "../canonicalize";

/**
 * Levi's 501 判定基準表 (v1.0)。
 * この表は初版。ハッカソン後に精緻化する前提でバージョン番号を持つ。
 * JSON化した文字列の SHA-256 を criteriaHash としてミント時に渡す。
 * プロンプトにはこの表を埋め込む（鑑定の根拠を公開・検証可能にするため）。
 */

export const CRITERIA_VERSION = "v1.0";

export interface CriterionRow {
  feature: string; // 特徴
  observed: string; // 観察値
  implication: string; // 年代含意
}

export const LEVIS_501_CRITERIA: {
  item_type: string;
  version: string;
  rows: CriterionRow[];
} = {
  item_type: "Levi's 501",
  version: CRITERIA_VERSION,
  rows: [
    { feature: "赤タブ", observed: "両面ビッグE", implication: "〜1971年頃" },
    { feature: "赤タブ", observed: "片面スモールe", implication: "1971年頃〜" },
    {
      feature: "ケアタグ",
      observed: "無し",
      implication: "〜1971年頃(または欠損)",
    },
    {
      feature: "ケアタグ",
      observed: "有り(表記形式で細分)",
      implication: "1971年頃〜",
    },
    {
      feature: "セルビッジ(赤耳)",
      observed: "有り",
      implication: "〜1983年頃(旧式織機)",
    },
    {
      feature: "セルビッジ",
      observed: "無し(脇割り)",
      implication: "1983年頃〜",
    },
    {
      feature: "ボタン裏刻印",
      observed: "数字1桁(2,5,6,8等)",
      implication: "60〜80年代の工場番号",
    },
    {
      feature: "ボタン裏刻印",
      observed: "3桁数字(501,524,555等)",
      implication: "80年代以降。555=バレンシア工場(復刻含む)",
    },
    { feature: "パッチ", observed: "紙パッチ", implication: "1950年代後半〜" },
    {
      feature: "バックポケット",
      observed: "隠しリベット",
      implication: "〜1966年頃",
    },
    {
      feature: "ステッチ",
      observed: "裾チェーンステッチ",
      implication: "オリジナル裾の可能性。シングルは裾上げ済みを示唆",
    },
    {
      feature: "内側",
      observed: "ケアタグの洗濯表示形式・MADE IN表記",
      implication: "米国製/外国製、90年代以降の判別",
    },
  ],
};

/**
 * 判定基準表の SHA-256（0x付き小文字hex）。
 * canonicalize 経由なので決定的。ミント時に criteriaHash として渡す。
 */
export const CRITERIA_HASH = bytesAndHash(LEVIS_501_CRITERIA).hashHex;

/**
 * プロンプトに埋め込む用の、人間可読な判定基準表テキスト。
 */
export function criteriaTableText(): string {
  const header = "| 特徴 | 観察値 | 年代含意 |\n|---|---|---|";
  const body = LEVIS_501_CRITERIA.rows
    .map((r) => `| ${r.feature} | ${r.observed} | ${r.implication} |`)
    .join("\n");
  return `${header}\n${body}`;
}
