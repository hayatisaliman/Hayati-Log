import { createRoot } from 'react-dom/client'
import '@fontsource/nanum-myeongjo/400.css'
import '@fontsource/nanum-myeongjo/700.css'
import '@fontsource/nanum-myeongjo/800.css'
import './styles.css'
import App from './App.jsx'
import { loadData } from './lib/store.js'

loadData().then(() => {
  createRoot(document.getElementById('root')).render(<App />)
})
