import type { ReactNode } from 'react'

interface MinWidthGateProps {
  children: ReactNode
  minWidth?: number
}

export function MinWidthGate({ children, minWidth = 720 }: MinWidthGateProps) {
  return (
    <>
      <div className="min-width-gate-block flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-2xl font-semibold text-foreground">
          RoyalForms
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          This application is designed for desktop screens. Please use a device
          with a screen width of at least {minWidth}px.
        </p>
      </div>

      <div className="min-width-gate-content hidden">
        {children}
      </div>

      <style>{`
        @media (min-width: ${minWidth}px) {
          .min-width-gate-block { display: none !important; }
          .min-width-gate-content { display: contents !important; }
        }
      `}</style>
    </>
  )
}
