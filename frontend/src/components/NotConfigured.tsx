export function NotConfigured({ label, envVar }: { label: string; envVar: string }) {
  return (
    <div className="not-configured">
      <p>{label} isn't deployed yet.</p>
      <p className="mono">
        Set <code>{envVar}</code> in <code>.env</code> once #21 has a real address.
      </p>
    </div>
  )
}
