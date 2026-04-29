import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const AuthContext = createContext(null)

const STORAGE_SESSION = 'ductos_inventory_supabase_session'
const STORAGE_ACCESS_TOKEN = 'ductos_inventory_supabase_access_token'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [appUser, setAppUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const allowedEmailDomainsRaw = import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS
  const apiBase =
    import.meta.env.VITE_API_URL || `http://${globalThis.location?.hostname || 'localhost'}:8000`

  const allowedEmailDomains = useMemo(() => {
    const raw = (allowedEmailDomainsRaw || 'climatisa.com').trim()
    const parts = raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
    return parts.length ? parts : ['climatisa.com']
  }, [allowedEmailDomainsRaw])

  function parseSupabaseAuthError(text) {
    try {
      const data = JSON.parse(text || '{}')
      const msg = data?.msg || data?.message || ''
      const errorCode = data?.error_code || data?.code || ''
      return { msg: String(msg || ''), errorCode: String(errorCode || '') }
    } catch {
      return { msg: String(text || ''), errorCode: '' }
    }
  }

  function isAllowedCorporateEmail(email) {
    const e = String(email || '').trim().toLowerCase()
    if (!e.includes('@')) return false
    const domain = e.split('@', 2)[1]
    return allowedEmailDomains.includes(domain)
  }

  function validatePasswordStrict(password) {
    const p = String(password || '')
    const errors = []
    if (p.length < 10) errors.push('La contraseña debe tener mínimo 10 caracteres.')
    if (!/[a-zA-Z]/.test(p)) errors.push('La contraseña debe incluir letras.')
    if (!/[0-9]/.test(p)) errors.push('La contraseña debe incluir números.')
    return errors
  }

  async function readBackendError(res) {
    const text = await res.text().catch(() => '')
    if (!text) return `HTTP ${res.status}`
    try {
      const outer = JSON.parse(text)
      const detail = outer?.detail ?? outer?.message ?? outer
      if (typeof detail === 'string') {
        try {
          const inner = JSON.parse(detail)
          return inner?.message || inner?.error || detail
        } catch {
          return detail
        }
      }
      if (detail && typeof detail === 'object') {
        return detail?.message || JSON.stringify(detail)
      }
      return String(detail)
    } catch {
      return text
    }
  }

  async function supabaseTokenPassword(email, password) {
    if (!supabaseUrl || !supabaseAnonKey)
      throw new Error('Supabase no configurado en el frontend (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const parsed = parseSupabaseAuthError(text)
      throw new Error(parsed.msg || text || `HTTP ${res.status}`)
    }
    return res.json()
  }

  async function supabaseSignUp(email, password) {
    if (!supabaseUrl || !supabaseAnonKey)
      throw new Error('Supabase no configurado en el frontend (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const parsed = parseSupabaseAuthError(text)
      if (parsed.errorCode === 'over_email_send_rate_limit' || parsed.errorCode === '429')
        throw new Error('Límite de correos excedido. Intenta más tarde.')
      throw new Error(parsed.msg || text || `HTTP ${res.status}`)
    }
    return res.json()
  }

  async function supabaseRefreshToken(refresh_token) {
    if (!supabaseUrl || !supabaseAnonKey)
      throw new Error('Supabase no configurado en el frontend (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ refresh_token }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const parsed = parseSupabaseAuthError(text)
      throw new Error(parsed.msg || text || `HTTP ${res.status}`)
    }
    return res.json()
  }

  function storeSession(session) {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify(session))
    localStorage.setItem(STORAGE_ACCESS_TOKEN, session?.access_token ? String(session.access_token) : '')
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_SESSION)
    localStorage.removeItem(STORAGE_ACCESS_TOKEN)
  }

  async function fetchApi(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : null),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      throw new Error(await readBackendError(res))
    }
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) return res.json()
    return null
  }

  const login = useCallback(
    async (email, password) => {
      try {
        setAuthError('')
        if (!isAllowedCorporateEmail(email)) {
          return { ok: false, message: 'Solo se permiten correos corporativos.' }
        }
        const data = await supabaseTokenPassword(email, password)
        const expiresAt = Date.now() + Number(data.expires_in || 0) * 1000
        const session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_type: data.token_type,
          expires_at: expiresAt,
          user: data.user || null,
        }
        storeSession(session)
        setUser(session.user)

        await fetchApi('/auth/register', { method: 'POST', token: session.access_token }).catch((e) => {
          setAuthError(e?.message || 'No se pudo registrar en la app')
          return null
        })
        const me = await fetchApi('/auth/me', { token: session.access_token }).catch((e) => {
          setAuthError(e?.message || 'No se pudo validar acceso')
          return null
        })
        setAppUser(me?.app_user || null)
        return { ok: true, appUser: me?.app_user || null }
      } catch (e) {
        clearSession()
        setUser(null)
        setAppUser(null)
        setAuthError(e?.message || '')
        return { ok: false, message: e?.message || 'Credenciales inválidas' }
      }
    },
    [supabaseUrl, supabaseAnonKey, apiBase],
  )

  const register = useCallback(
    async (email, password) => {
      try {
        setAuthError('')
        if (!isAllowedCorporateEmail(email)) {
          return { ok: false, message: 'Solo se permiten correos corporativos.' }
        }
        const passErrors = validatePasswordStrict(password)
        if (passErrors.length) return { ok: false, message: passErrors[0] }
        const data = await supabaseSignUp(email, password)
        const maybeToken = data?.access_token
        const maybeRefresh = data?.refresh_token
        if (maybeToken && maybeRefresh) {
          const expiresAt = Date.now() + Number(data.expires_in || 0) * 1000
          const session = {
            access_token: maybeToken,
            refresh_token: maybeRefresh,
            token_type: data.token_type,
            expires_at: expiresAt,
            user: data.user || null,
          }
          storeSession(session)
          setUser(session.user)
          await fetchApi('/auth/register', { method: 'POST', token: session.access_token }).catch(() => null)
          const me = await fetchApi('/auth/me', { token: session.access_token }).catch(() => null)
          setAppUser(me?.app_user || null)
        }
        return { ok: true }
      } catch (e) {
        setAuthError(e?.message || '')
        return { ok: false, message: e?.message || 'No se pudo registrar' }
      }
    },
    [supabaseUrl, supabaseAnonKey, apiBase],
  )

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    setAppUser(null)
  }, [])

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_ACCESS_TOKEN) || ''
    if (!token) return { ok: false }
    try {
      setAuthError('')
      const me = await fetchApi('/auth/me', { token })
      setAppUser(me?.app_user || null)
      return { ok: true, appUser: me?.app_user || null }
    } catch (e) {
      setAuthError(e?.message || 'No se pudo validar acceso')
      setAppUser(null)
      return { ok: false }
    }
  }, [apiBase])

  useEffect(() => {
    async function init() {
      setIsLoading(true)
      try {
        const raw = localStorage.getItem(STORAGE_SESSION)
        if (!raw) {
          setUser(null)
          setAppUser(null)
          return
        }
        const session = JSON.parse(raw)
        const token = session?.access_token
        const refresh = session?.refresh_token
        const expiresAt = Number(session?.expires_at || 0)
        const isExpired = !expiresAt || Date.now() >= expiresAt - 60_000

        if (isExpired && refresh) {
          const data = await supabaseRefreshToken(refresh)
          const nextExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000
          const nextSession = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_type: data.token_type,
            expires_at: nextExpiresAt,
            user: data.user || session.user || null,
          }
          storeSession(nextSession)
          setUser(nextSession.user)
          const me = await fetchApi('/auth/me', { token: nextSession.access_token }).catch((e) => {
            setAuthError(e?.message || 'No se pudo validar acceso')
            return null
          })
          setAppUser(me?.app_user || null)
          return
        }

        if (token && session.user) {
          setUser(session.user)
          const me = await fetchApi('/auth/me', { token }).catch((e) => {
            setAuthError(e?.message || 'No se pudo validar acceso')
            return null
          })
          setAppUser(me?.app_user || null)
          return
        }

        clearSession()
        setUser(null)
        setAppUser(null)
      } catch {
        clearSession()
        setUser(null)
        setAppUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    init()
  }, [supabaseUrl, supabaseAnonKey, apiBase])

  const value = useMemo(
    () => ({
      user,
      appUser,
      isLoading,
      isApproved: Boolean(appUser?.active),
      role: appUser?.role || 'user',
      authError,
      login,
      register,
      logout,
      refreshMe,
      getAccessToken: () => localStorage.getItem(STORAGE_ACCESS_TOKEN) || '',
      allowedEmailDomains,
    }),
    [user, appUser, isLoading, login, register, logout, refreshMe, allowedEmailDomains, authError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
