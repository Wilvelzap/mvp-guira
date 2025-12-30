import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { motion } from 'framer-motion'
import { Clock, CheckCircle, Info, AlertTriangle } from 'lucide-react'

export const ActivityLog: React.FC = () => {
    const { user } = useAuth()
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (user) fetchLogs()
    }, [user])

    const fetchLogs = async () => {
        const { data } = await supabase
            .from('activity_logs')
            .select('*')
            .eq('user_id', user?.id)
            .order('created_at', { ascending: false })
            .limit(50)

        if (data) setLogs(data)
        setLoading(false)
    }

    if (loading) return <div className="loading-spinner">Cargando historial...</div>

    const translateAction = (action: string) => {
        const actions: any = {
            'save_draft': 'Borrador Guardado',
            'guardar_borrador': 'Borrador Guardado',
            'submit_onboarding': 'Onboarding Enviado',
            'enviar_onboarding': 'Onboarding Enviado',
            'request_payin': 'Ruta de Depósito Solicitada',
            'request_payout': 'Retiro Solicitado',
            'login': 'Inicio de Sesión',
            'signup': 'Registro de Cuenta'
        }
        return actions[action] || action.replace(/_/g, ' ')
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Flujo de Actividad</h1>
            </div>

            <div className="premium-card">
                {logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                        <Clock size={48} style={{ marginBottom: '1rem' }} />
                        <p>No se ha registrado actividad aún.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)' }}>
                        {logs.map((log, idx) => (
                            <motion.div
                                key={log.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                style={{
                                    background: '#fff',
                                    padding: '1.5rem',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '1rem'
                                }}
                            >
                                <div style={{
                                    padding: '0.6rem',
                                    borderRadius: '10px',
                                    background: 'rgba(0, 82, 255, 0.05)',
                                    color: 'var(--secondary)'
                                }}>
                                    {log.action.includes('submit') || log.action.includes('enviar') ? <CheckCircle size={18} /> : <Info size={18} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                        <h4 style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                                            {translateAction(log.action)}
                                        </h4>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {new Date(log.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
                                        {JSON.stringify(log.details)}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
