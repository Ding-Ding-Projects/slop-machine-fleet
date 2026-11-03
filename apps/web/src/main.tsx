import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {UIProvider} from './preferences';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><UIProvider><App/></UIProvider></React.StrictMode>);
