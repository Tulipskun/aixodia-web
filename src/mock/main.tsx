import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EnginesMock } from './EnginesMock'
import './mock.css'

const root = document.getElementById('mock-root')
if (!root) throw new Error('mock root missing')

createRoot(root).render(
  <StrictMode>
    <EnginesMock />
  </StrictMode>,
)
