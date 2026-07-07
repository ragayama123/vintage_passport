// VintagePassport の最小 ABI（web から使う関数・イベントのみ）。
// contracts/contracts/VintagePassport.sol と一致させること。
export const VINTAGE_PASSPORT_ABI = [
  {
    type: "function",
    name: "mintWithAppraisal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenURI_", type: "string" },
      {
        name: "a",
        type: "tuple",
        components: [
          { name: "appraisalHash", type: "bytes32" },
          { name: "criteriaHash", type: "bytes32" },
          { name: "estimatedEra", type: "string" },
          { name: "confidence", type: "uint8" },
          { name: "appraisedAt", type: "uint64" },
        ],
      },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "appraisals",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "appraisalHash", type: "bytes32" },
      { name: "criteriaHash", type: "bytes32" },
      { name: "estimatedEra", type: "string" },
      { name: "confidence", type: "uint8" },
      { name: "appraisedAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "AppraisalMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "appraisalHash", type: "bytes32", indexed: false },
      { name: "estimatedEra", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;
