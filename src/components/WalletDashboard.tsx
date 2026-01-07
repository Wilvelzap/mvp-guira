import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { motion } from 'framer-motion'
import {
    Wallet,
    ArrowUpRight,
    ArrowDownLeft,
    History,
    TrendingUp,
    AlertCircle,
    Clock
} from 'lucide-react'

interface WalletDashboardProps {
    onNavigate: (tab: any, intent?: any) => void
}

export const WalletDashboard = ({ onNavigate }: WalletDashboardProps) => {
    const { user } = useAuth()
    const [balance, setBalance] = useState(0)
    const [transactions, setTransactions] = useState<any[]>([])
    const [pendingTransfers, setPendingTransfers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'deposit' | 'payout'>('all')

    const fetchBalance = async () => {
        if (!user) return
        try {
            // Using .limit(1) to avoid 406 Not Acceptable errors if duplicate wallets exist
            const { data: userWallets, error: walletErr } = await supabase
                .from('wallets')
                .select('id')
                .eq('user_id', user.id)
                .limit(1)

            if (walletErr) throw walletErr
            const wallet = userWallets?.[0]

            if (!wallet) {
                setBalance(0)
                setTransactions([])
                return
            }

            const { data: entries } = await supabase
                .from('ledger_entries')
                .select('amount, type')
                .eq('wallet_id', wallet.id)

            const total = (entries || []).reduce((acc, curr) => {
                return curr.type === 'deposit' ? acc + Number(curr.amount) : acc - Number(curr.amount)
            }, 0)
            setBalance(total)

            const { data: transEntries } = await supabase
                .from('ledger_entries')
                .select('*')
                .eq('wallet_id', wallet.id)
                .order('created_at', { ascending: false })

            setTransactions(transEntries || [])

            const { data: pending } = await supabase
                .from('bridge_transfers')
                .select('*')
                .neq('status', 'completed')
                .neq('status', 'failed')
                .eq('user_id', user.id)

            setPendingTransfers(pending || [])
        } catch (err) {
            console.error('Error fetching dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchBalance()
    }, [user?.id])

    const filteredTransactions = transactions.filter(t => filter === 'all' || t.type === filter)

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div className="loading-spinner"></div>
        </div>
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Mi Billetera</h1>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={() => onNavigate('payments', 'bank_to_crypto')}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <ArrowUpRight size={18} /> Cargar Fondos
                    </button>
                </div>
            </div>

            {/* Balance Card */}
            <div className="premium-card" style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, #1e3a8a 100%)',
                color: '#fff',
                padding: '2.5rem',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '24px'
            }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', opacity: 0.8 }}>
                        <Wallet size={20} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tu saldo disponible</span>
                    </div>
                    <div style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 800, marginBottom: '0.5rem' }}>
                        ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <p style={{ opacity: 0.6, fontSize: '0.8rem', marginTop: '1rem', margin: 0 }}>Sujeto a confirmación de red</p>
                </div>
                <Wallet
                    size={240}
                    style={{
                        position: 'absolute',
                        right: '-60px',
                        bottom: '-60px',
                        opacity: 0.07,
                        transform: 'rotate(-15deg)'
                    }}
                />
            </div>

            {/* Transactions */}
            <div className="premium-card" style={{ padding: '2rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <History size={22} color="var(--primary)" />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Historial de Transacciones</h2>
                    </div>

                    <div style={{ background: '#F1F5F9', padding: '4px', borderRadius: '10px', display: 'flex', gap: '4px' }}>
                        {(['all', 'deposit', 'payout'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '0.4rem 1rem',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    background: filter === f ? '#fff' : 'transparent',
                                    color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: filter === f ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                                }}
                            >
                                {f === 'all' ? 'Todas' : (f === 'deposit' ? 'Depósitos' : 'Pagos')}
                            </button>
                        ))}
                    </div>
                </div>

                {transactions.length === 0 && pendingTransfers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.5 }}>
                        <AlertCircle size={40} style={{ marginBottom: '1rem' }} />
                        <p>Aún no tienes movimientos registrados.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <th style={{ padding: '1rem 0' }}>Descripción</th>
                                    <th style={{ padding: '1rem 0' }}>Fecha</th>
                                    <th style={{ padding: '1rem 0', textAlign: 'right' }}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Pending Transfers */}
                                {pendingTransfers.map((p) => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(59, 130, 246, 0.02)' }}>
                                        <td style={{ padding: '1.25rem 0' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                                {p?.business_purpose ? String(p.business_purpose).replace(/_/g, ' ') : "Procesando"} (Pendiente)
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {p?.transfer_kind ? String(p.transfer_kind).replace(/_/g, ' ') : "Transferencia"}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.25rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                            {new Date(p.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{
                                            padding: '1.25rem 0',
                                            textAlign: 'right',
                                            fontWeight: 700,
                                            color: 'var(--warning)'
                                        }}>
                                            {(p?.transfer_kind || '').includes('deposit') ? '+' : '-'}${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                                {/* Confirmed Transactions */}
                                {filteredTransactions.map((t) => (
                                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '1.25rem 0' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{t.description || 'Operación'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {t.id ? String(t.id).slice(0, 8) : '---'}</div>
                                        </td>
                                        <td style={{ padding: '1.25rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                            {new Date(t.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{
                                            padding: '1.25rem 0',
                                            textAlign: 'right',
                                            fontWeight: 700,
                                            color: t.type === 'deposit' ? 'var(--success)' : 'var(--text-main)'
                                        }}>
                                            {t.type === 'deposit' ? '+' : '-'}${Number(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
