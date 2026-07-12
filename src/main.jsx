import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ConvexProvider, ConvexReactClient } from "convex/react";

// The VITE_CONVEX_URL will be provided by `npx convex dev`
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || "https://affable-porpoise-194.convex.cloud"); 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>,
)
