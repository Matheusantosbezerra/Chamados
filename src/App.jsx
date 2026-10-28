
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <main className="min-w-0 flex-1">
          <Header />
          <Dashboard />
        </main>
      </div>
    </div>
  )
}
