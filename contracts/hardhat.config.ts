import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// web/.env.local を優先的に読む（秘密鍵をリポジトリで一元管理するため）。
// 無ければ contracts/.env を読む。
dotenv.config({ path: "../web/.env.local" });
dotenv.config();

const CUSTODIAL_PRIVATE_KEY = process.env.CUSTODIAL_PRIVATE_KEY;
const RPC_URL =
  process.env.HASHKEY_TESTNET_RPC_URL || "https://testnet.hsk.xyz";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // HashKey Chain は OP Stack L2 (Ecotone/Dencun 適用済み) で cancun 対応。
      // OpenZeppelin v5.6 が mcopy(cancun) を使うため明示する。
      evmVersion: "cancun",
    },
  },
  networks: {
    hashkeyTestnet: {
      url: RPC_URL,
      chainId: 133,
      accounts: CUSTODIAL_PRIVATE_KEY ? [CUSTODIAL_PRIVATE_KEY] : [],
    },
  },
};

export default config;
