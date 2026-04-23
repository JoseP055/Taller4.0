import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

const STORAGE_KEY = 'ductos_inventory_auth_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const username = localStorage.getItem(STORAGE_KEY)
    return username ? { username } : null
  })

  const login = useCallback((username, password) => {
    if (username === 'admin' && password === 'admin') {
      localStorage.setItem(STORAGE_KEY, username)
      setUser({ username })
      return { ok: true }
    }

    return { ok: false, message: 'Credenciales inválidas' }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
