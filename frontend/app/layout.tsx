import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DeFi Risk Oracle',
  description: 'DeFi Risk Oracle MVP using Chainlink CRE',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}

