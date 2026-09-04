import { formatUnits } from "viem"
import { useBalance } from "wagmi"

import { activeChain, deployment } from "../config.js"
import { NotConfigured } from "./NotConfigured.js"

export function SafeCard() {
  const { safeAddress } = deployment
  const { data: balance, isLoading } = useBalance({
    address: safeAddress,
    chainId: activeChain.id,
    query: { enabled: Boolean(safeAddress) },
  })

  return (
    <section className="card">
      <h2>Safe</h2>
      {!safeAddress ? (
        <NotConfigured label="The demo Safe" envVar="VITE_SAFE_ADDRESS" />
      ) : (
        <dl className="kv">
          <dt>Address</dt>
          <dd className="mono">{safeAddress}</dd>
          <dt>Network</dt>
          <dd>{activeChain.name}</dd>
          <dt>Balance</dt>
          <dd>
            {isLoading ? "Loading…" : balance ? `${formatUnits(balance.value, balance.decimals)} ${balance.symbol}` : "—"}
          </dd>
        </dl>
      )}
    </section>
  )
}
