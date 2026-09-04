import { type Chain, sepolia } from "viem/chains"

// XDC Apothem isn't in viem/chains, and isn't in Safe's supported chain
// list either (verified against safe-config.safe.global - see #38) - which
// is exactly why this dashboard talks to the Guard directly via RPC reads
// rather than through any Safe-hosted API.
export const apothem: Chain = {
  id: 51,
  name: "XDC Apothem",
  nativeCurrency: { name: "Test XDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.apothem.network"] },
  },
  blockExplorers: {
    default: { name: "XDCScan", url: "https://testnet.xdcscan.com" },
  },
  testnet: true,
}

export type ChainKey = "apothem" | "sepolia"

export const CHAINS: Record<ChainKey, Chain> = { apothem, sepolia }

export function resolveChainKey(value: string | undefined): ChainKey {
  return value === "sepolia" ? "sepolia" : "apothem"
}
