import { Signer } from "ethers"
import { EIP1193Provider } from "@gnosis-guild/zodiac-core"

export default function createAdapter({
  provider,
  signer,
}: {
  provider: EIP1193Provider
  signer: Signer
}): EIP1193Provider {
  return {
    request: async ({ method, params }) => {
      if (method == "eth_sendTransaction") {
        const { hash } = await signer.sendTransaction((params as any[])[0])
        return hash
      }

      return provider.request({ method, params })
    },
  }
}
