import { Component } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/nanum-myeongjo/400.css'
import '@fontsource/nanum-myeongjo/700.css'
import '@fontsource/nanum-myeongjo/800.css'
import './styles.css'

const root = createRoot(document.getElementById('root'))

// Crashed — shows the render error with a reload button instead of a blank window
class Crashed extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crashed">
        <h3>Something went wrong</h3>
        <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}

const label = window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label

if (label === 'popup') {
  document.documentElement.classList.add('popup-root')
  import('./components/Popup.jsx').then(({ Popup }) => root.render(<Popup />))
} else if (label === 'bar') {
  document.documentElement.classList.add('popup-root', 'bar-root')
  import('./components/TaskbarBar.jsx').then(({ TaskbarBar }) => root.render(<TaskbarBar />))
} else {
  Promise.all([import('./App.jsx'), import('./lib/store.js')]).then(([{ default: App }, { loadData }]) => loadData().then(() => root.render(<Crashed><App /></Crashed>)))
}
