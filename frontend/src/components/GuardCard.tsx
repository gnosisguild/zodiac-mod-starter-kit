import { useReadContract } from "wagmi"

import { activeChain, deployment } from "../config.js"
import { GUARD_READ_ABI } from "../guardAbi.js"
import { NotConfigured } from "./NotConfigured.js"

function useGuardRead<T>(functionName: "owner" | "riskRegistry" | "frozen" | "perTxLimit" | "rollingLimit" | "windowSpent") {
  const { guardAddress } = deployment
  return useReadContract({
    address: guardAddress,
    abi: GUARD_READ_ABI,
    functionName,
    chainId: activeChain.id,
    query: { enabled: Boolean(guardAddress) },
  }) as { data: T | undefined; isLoading: boolean }
}

function formatLimit(value: bigint | undefined): string {
  if (value === undefined) return "—"
  return value === 0n ? "disabled" : value.toString()
}

export function GuardCard() {
  const { guardAddress } = deployment
  const owner = useGuardRead<`0x${string}`>("owner")
  const riskRegistry = useGuardRead<`0x${string}`>("riskRegistry")
  const frozen = useGuardRead<boolean>("frozen")
  const perTxLimit = useGuardRead<bigint>("perTxLimit")
  const rollingLimit = useGuardRead<bigint>("rollingLimit")
  const windowSpent = useGuardRead<bigint>("windowSpent")

  return (
    <section className="card">
      <h2>Guard configuration</h2>
      {!guardAddress ? (
        <NotConfigured label="The TripwireGuard" envVar="VITE_GUARD_ADDRESS" />
      ) : (
        <dl className="kv">
          <dt>Address</dt>
          <dd className="mono">{guardAddress}</dd>
          <dt>Status</dt>
          <dd>
            {frozen.isLoading ? (
              "Loading…"
            ) : (
              <span className={`pill ${frozen.data ? "pill-frozen" : "pill-active"}`}>
                {frozen.data ? "FROZEN" : "Active"}
              </span>
            )}
          </dd>
          <dt>Owner</dt>
          <dd className="mono">{owner.data ?? "—"}</dd>
          <dt>Risk registry</dt>
          <dd className="mono">{riskRegistry.data ?? "—"}</dd>
          <dt>Per-tx limit</dt>
          <dd>{formatLimit(perTxLimit.data)}</dd>
          <dt>Rolling 24h limit</dt>
          <dd>{formatLimit(rollingLimit.data)}</dd>
          <dt>Spent in current window</dt>
          <dd>{windowSpent.data !== undefined ? windowSpent.data.toString() : "—"}</dd>
        </dl>
      )}
    </section>
  )
}
