
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Meta, Scripts } from '@tanstack/react-start'
import * as React from 'react'
import { useAuthStore } from '../store/authStore'
import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
  meta: () => [
    {
      charSet: 'utf-8',
    },
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1',
    },
    {
      title: 'Playhead',
    },
  ],
})

function RootComponent() {
  const initializeAuth = useAuthStore((state) => state.initialize)

  React.useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Meta />
      </head>
      <body>
        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
