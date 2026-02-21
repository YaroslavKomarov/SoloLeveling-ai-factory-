/**
 * Knowledge Base layout — overrides the app layout's 65% max-width constraint.
 * The three-panel UI needs full viewport width to render properly.
 */
export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: 0,
        // Override any inherited padding from the app layout wrapper
        padding: 0,
      }}
    >
      {children}
    </div>
  )
}
