import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { queryClientDefaults } from './queryClient'
import { captureInstallEvents } from './pwa/install'
import { registerServiceWorker } from './pwa/register'

const queryClient = new QueryClient(queryClientDefaults)
registerServiceWorker()
captureInstallEvents()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
