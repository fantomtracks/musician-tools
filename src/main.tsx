import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthProvider'
import { router } from './router'
import './index.css'

// Story 18.1 — data-router. AuthProvider stays ABOVE the router so useAuth() is
// available in every route element (auth is a client context, not a route loader).
// v7_startTransition is a render-level future flag (was on <BrowserRouter>).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AuthProvider>
  </StrictMode>,
)
