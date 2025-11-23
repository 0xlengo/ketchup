import type { Metadata } from 'next'

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
      <body>{children}</body>
    </html>
  )
}

