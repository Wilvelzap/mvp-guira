import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { motion } from 'framer-motion'
import { LogIn, UserPlus, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export const AuthPage: React.FC = () => {
    const { session, isRecovering } = useAuth()
    const [authMode, setAuthMode] = useState<'login' | 'signup' | 'recovery' | 'update'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    React.useEffect(() => {
        if (isRecovering) {
            setAuthMode('update')
        }
    }, [isRecovering])

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setMessage(null)

        try {
            if (authMode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) throw error
            } else if (authMode === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin
                    }
                })
                if (error) throw error
                setMessage('¡Revisa tu correo para el enlace de confirmación!')
            } else if (authMode === 'recovery') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/`, // Tokens follow naturally
                })
                if (error) throw error
                setMessage('Se ha enviado un enlace de recuperación a tu correo.')
            } else if (authMode === 'update') {
                if (!session) {
                    throw new Error('La sesión de recuperación no se ha establecido aún. Espera un momento.')
                }
                const { error } = await supabase.auth.updateUser({ password })
                if (error) throw error
                setMessage('¡Contraseña actualizada con éxito! Redirigiendo...')
                setTimeout(() => {
                    window.location.hash = ''
                    window.location.reload()
                }, 2000)
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const getTitle = () => {
        if (authMode === 'login') return 'Bienvenido'
        if (authMode === 'signup') return 'Comienza ahora'
        if (authMode === 'recovery') return 'Recuperar Contraseña'
        return 'Nueva Contraseña'
    }

    const getSubtitle = () => {
        if (authMode === 'login') return 'Accede a tu cuenta de Guira'
        if (authMode === 'signup') return 'Crea tu cuenta de negocios hoy'
        if (authMode === 'recovery') return 'Enviaremos un enlace a tu correo'
        if (!session) return 'Validando sesión de recuperación...'
        return 'Ingresa tu nueva contraseña para continuar'
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F8FAFC',
            padding: '2rem'
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="premium-card"
                style={{ width: '100%', maxWidth: '440px', padding: '3.5rem' }}
            >
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <img
                        src="/logo.png"
                        alt="Guira"
                        style={{ height: '70px', marginBottom: '1.5rem', objectFit: 'contain' }}
                    />
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                        {getTitle()}
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>
                        {getSubtitle()}
                    </p>
                </div>

                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {authMode !== 'update' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Correo Electrónico</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="nombre@empresa.com"
                            />
                        </div>
                    )}

                    {authMode !== 'recovery' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Contraseña</label>
                                {authMode === 'login' && (
                                    <button
                                        type="button"
                                        onClick={() => setAuthMode('recovery')}
                                        style={{ background: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600 }}
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                )}
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{ color: 'var(--error)', fontSize: '0.875rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '12px' }}>
                            {error}
                        </div>
                    )}

                    {message && (
                        <div style={{ color: 'var(--success)', fontSize: '0.875rem', textAlign: 'center', background: 'rgba(16, 185, 129, 0.05)', padding: '0.75rem', borderRadius: '12px' }}>
                            {message}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading || (authMode === 'update' && !session)}
                        style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', width: '100%' }}
                    >
                        {loading ? 'Procesando...' :
                            (authMode === 'update' && !session) ? <><RefreshCw size={20} className="animate-spin" /> Verificando...</> :
                                authMode === 'login' ? <><LogIn size={20} /> Iniciar Sesión</> :
                                    authMode === 'signup' ? <><UserPlus size={20} /> Crear Cuenta</> :
                                        authMode === 'recovery' ? 'Enviar Enlace' : 'Actualizar Contraseña'}
                    </button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <button
                        onClick={() => {
                            if (authMode === 'recovery' || authMode === 'update') setAuthMode('login')
                            else setAuthMode(authMode === 'login' ? 'signup' : 'login')
                            setError(null)
                            setMessage(null)
                        }}
                        style={{ background: 'none', color: 'var(--secondary)', fontSize: '0.9rem', fontWeight: 600 }}
                    >
                        {authMode === 'recovery' || authMode === 'update' ? "Volver al inicio de sesión" :
                            authMode === 'login' ? "¿No tienes una cuenta? Regístrate" : "¿Ya tienes una cuenta? Inicia sesión"}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
