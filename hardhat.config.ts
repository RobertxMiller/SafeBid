import "@fhevm/hardhat-plugin";
import * as dotenv from "dotenv";
dotenv.config();
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import "solidity-coverage";

import "./tasks/accounts";
import "./tasks/FHECounter";
import "./tasks/SafeBid";

// Run 'npx hardhat vars setup' to see the list of variables that need to be set

const MNEMONIC: string = vars.get("MNEMONIC", "test test test test test test test test test test test junk");
const INFURA_API_KEY: string = vars.get("INFURA_API_KEY", process.env.INFURA_API_KEY || "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
const SEPOLIA_RPC_URL: string = process.env.SEPOLIA_RPC_URL || vars.get("SEPOLIA_RPC_URL", "");
const PRIVATE_KEY: string = process.env.PRIVATE_KEY || vars.get("PRIVATE_KEY", "");

const accountsConfig = PRIVATE_KEY
  ? [PRIVATE_KEY]
  : {
      mnemonic: MNEMONIC,
      path: "m/44'/60'/0'/0/",
      count: 10,
    } as const;

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: {
      sepolia: vars.get("ETHERSCAN_API_KEY", ""),
    },
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 31337,
    },
    anvil: {
      accounts: typeof accountsConfig === 'object' && !Array.isArray(accountsConfig) ? accountsConfig : undefined,
      chainId: 31337,
      url: "http://localhost:8545",
    },
    sepolia: {
      accounts: accountsConfig as any,
      chainId: 11155111,
      url: SEPOLIA_RPC_URL || (INFURA_API_KEY && INFURA_API_KEY !== "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" 
        ? `https://sepolia.infura.io/v3/${INFURA_API_KEY}` 
        : "https://eth-sepolia.public.blastapi.io"),
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.24",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
