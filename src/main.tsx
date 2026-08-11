import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthProvider'
import { GlobalToastProvider } from './contexts/GlobalToastProvider'
import { router } from './router'
import './index.css'

// Story 18.1 — data-router. AuthProvider stays ABOVE the router so useAuth() is
// available in every route element (auth is a client context, not a route loader).
// v7_startTransition is a render-level future flag (was on <BrowserRouter>).
//
// Story 24.2 — GlobalToastProvider sits above the router for the same structural reason, but
// serving a different need: a bulk action abandoned by navigating away must still be able to
// report what it actually wrote. Below the router it would unmount with the page and the recap
// would vanish with it — which is precisely the bug being fixed.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <GlobalToastProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </GlobalToastProvider>
    </AuthProvider>
  </StrictMode>,
)
