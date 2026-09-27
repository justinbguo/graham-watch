import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { Boundary } from './Boundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boundary what="The operator console">
      <App />
    </Boundary>
  </StrictMode>
);
