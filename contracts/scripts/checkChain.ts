import { ethers, network } from "hardhat";

// RPC 疎通 & chainId 確認（ハードコード前の実接続テスト）。
async function main() {
  const provider = ethers.provider;
  const net = await provider.getNetwork();
  console.log("network config name:", network.name);
  console.log("chainId:", net.chainId.toString());
  const block = await provider.getBlockNumber();
  console.log("latest block:", block);

  if (net.chainId !== 133n) {
    throw new Error(
      `期待した chainId 133 と異なります: ${net.chainId}。RPC URL を確認してください。`
    );
  }
  console.log("✓ HashKey Chain testnet (chainId 133) に接続できました。");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
