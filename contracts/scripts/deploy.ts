import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "デプロイ用アカウントがありません。CUSTODIAL_PRIVATE_KEY を設定してください。"
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("deployer:", deployer.address);
  console.log("balance :", ethers.formatEther(balance), "HSK");
  if (balance === 0n) {
    throw new Error(
      "残高が 0 HSK です。faucet(https://faucet.hsk.xyz/faucet) でガス代を取得してください。"
    );
  }

  console.log("deploying VintagePassport ...");
  const factory = await ethers.getContractFactory("VintagePassport");
  const contract = await factory.deploy();
  const deployReceipt = await contract.deploymentTransaction()?.wait();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployBlock = deployReceipt?.blockNumber ?? null;

  console.log("✓ deployed at:", address);
  console.log("  block     :", deployBlock);
  console.log(
    "explorer:",
    `https://testnet-explorer.hsk.xyz/address/${address}`
  );

  // デプロイ結果をファイルに残す(手動で .env の CONTRACT_ADDRESS 等に転記)
  const out = {
    network: network.name,
    chainId: 133,
    address,
    deployBlock,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, "..", "deployment.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("\n次の手順: web/.env.local に以下を設定してください。");
  console.log(`  CONTRACT_ADDRESS=${address}`);
  if (deployBlock !== null) {
    console.log(
      `  DEPLOY_BLOCK=${deployBlock}   # 所有履歴(eth_getLogs)の走査開始ブロック`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
