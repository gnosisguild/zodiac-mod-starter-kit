import { useAccount, useConnect, useDisconnect } from "wagmi"

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="connect-wallet">
        <span className="pill pill-connected">{short(address)}</span>
        <button type="button" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="connect-wallet">
      {connectors.map((connector) => (
        <button type="button" key={connector.uid} disabled={isPending} onClick={() => connect({ connector })}>
          {isPending ? "Connecting…" : `Connect ${connector.name}`}
        </button>
      ))}
    </div>
  )
}
