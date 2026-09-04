import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"

import { CHAINS, type ChainKey, resolveChainKey } from "./chains.js"

export const activeChainKey: ChainKey = resolveChainKey(import.meta.env.VITE_CHAIN as string | undefined)
export const activeChain = CHAINS[activeChainKey]

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(),
  },
})

function envAddress(value: string | undefined): `0x${string}` | undefined {
  return value && value.startsWith("0x") ? (value as `0x${string}`) : undefined
}

export const deployment = {
  safeAddress: envAddress(import.meta.env.VITE_SAFE_ADDRESS as string | undefined),
  guardAddress: envAddress(import.meta.env.VITE_GUARD_ADDRESS as string | undefined),
  riskRegistryAddress: envAddress(import.meta.env.VITE_RISK_REGISTRY_ADDRESS as string | undefined),
}
