import { createRoot } from 'react-dom/client'
import '@fontsource/nanum-myeongjo/400.css'
import '@fontsource/nanum-myeongjo/700.css'
import '@fontsource/nanum-myeongjo/800.css'
import './styles.css'

const root = createRoot(document.getElementById('root'))

const label = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label

if (label === 'popup') {
  document.documentElement.classList.add('popup-root')
  import('./components/Popup.jsx').then(({ Popup }) => root.render(<Popup />))
} else if (label === 'bar') {
  document.documentElement.classList.add('popup-root', 'bar-root')
  import('./components/TaskbarBar.jsx').then(({ TaskbarBar }) => root.render(<TaskbarBar />))
} else {
  Promise.all([import('./App.jsx'), import('./lib/store.js')]).then(([{ default: App }, { loadData }]) => loadData().then(() => root.render(<App />)))
}
