import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
    Wallet,
    ArrowUpRight,
    ArrowDownLeft,
    History,
    RefreshCw,
    AlertCircle
} from 'lucide-react'

export const WalletDashboard: React.FC<{ onNavigate?: (tab: any, intent?: any) => void }> = ({ onNavigate }) => {
    const { user } = useAuth()
    const [balance, setBalance] = useState(0)
    const [transactions, setTransactions] = useState<any[]>([])
    const [pendingTransfers, setPendingTransfers] = useState<any[]>([])
    const [filter, setFilter] = useState<'all' | 'deposit' | 'payout'>('all')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchBalance()
    }, [user])

    const fetchBalance = async () => {
        if (!user) return
        setLoading(true)

        const { data: wallet } = await supabase
            .from('wallets')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (wallet) {
            const [entriesRes, pendingRes] = await Promise.all([
                supabase.from('ledger_entries').select('*').eq('wallet_id', wallet.id).order('created_at', { ascending: false }),
                supabase.from('bridge_transfers').select('*').eq('user_id', user.id).neq('status', 'completed').neq('status', 'failed').order('created_at', { ascending: false })
            ])

            if (entriesRes.data) {
                setTransactions(entriesRes.data)
                const total = entriesRes.data.reduce((acc, curr) => {
                    if (curr.type === 'deposit') return acc + Number(curr.amount)
                    if (curr.type === 'payout') return acc - Number(curr.amount)
                    return acc
                }, 0)
                setBalance(total)
            }
            if (pendingRes.data) {
                setPendingTransfers(pendingRes.data)
            }
        }
        setLoading(false)
    }

    if (loading) return <div className="loading-spinner"><RefreshCw className="animate-spin" /></div>

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Mi Billetera</h1>
                <button onClick={fetchBalance} className="btn-secondary" style={{ padding: '0.6rem' }}>
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* Balance Card */}
            <div className="premium-card" style={{
                background: 'var(--primary)',
                color: '#fff',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Decorative background circle */}
                <div style={{
                    position: 'absolute',
                    top: '-50px',
                    right: '-50px',
                    width: '200px',
                    height: '200px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)'
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', opacity: 0.8 }}>
                        <Wallet size={20} />
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tu saldo disponible</span>
                    </div>
                    <div style={{ fontSize: 'clamp(2rem, 8vw, 3.5rem)', fontWeight: 800, marginBottom: '0.5rem' }}>
                        ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexDirection: 'row', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => onNavigate?.('payments', 'bank_to_crypto')}
                            className="btn-primary"
                            style={{ background: '#fff', color: 'var(--primary)', flex: '1 1 140px', padding: '0.875rem' }}
                        >
                            Cargar Fondos
                        </button>
                        <button
                            onClick={() => onNavigate?.('payments', 'crypto_to_bank')}
                            className="btn-primary"
                            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', flex: '1 1 140px', padding: '0.875rem', boxShadow: 'none' }}
                        >
                            Retirar
                        </button>
                    </div>
                    {balance === 0 && (
                        <div style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <AlertCircle size={16} color="#fff" />
                            <p style={{ margin: 0, opacity: 0.9 }}>Para comenzar, crea una ruta de depósito y envía fondos desde tu banco o wallet.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Stats or Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                <div className="premium-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        <ArrowDownLeft size={20} color="var(--success)" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Total Depósitos</h4>
                    </div>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                        ${transactions.filter(t => t.type === 'deposit').reduce((a, b) => a + Number(b.amount), 0).toLocaleString()}
                    </p>
                </div>
                <div className="premium-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                        <ArrowUpRight size={20} color="var(--error)" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Total Retiros</h4>
                    </div>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                        ${transactions.filter(t => t.type === 'payout').reduce((a, b) => a + Number(b.amount), 0).toLocaleString()}
                    </p>
                </div>
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

                {transactions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.5 }}>
                        <AlertCircle size={40} style={{ marginBottom: '1rem' }} />
                        <p>Aún no tienes movimientos. Crea una ruta de depósito para comenzar.</p>
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
                                {/* Pending Transfers (Optimistic) */}
                                {pendingTransfers.map((p) => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(59, 130, 246, 0.02)' }}>
                                        <td style={{ padding: '1.25rem 0' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{p.business_purpose ? String(p.business_purpose).replace(/_/g, ' ') : "Procesando"} (Procesando)</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.transfer_kind ? String(p.transfer_kind).replace(/_/g, ' ') : "Transferencia"}</div>
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
                                            {p.transfer_kind.includes('deposit') ? '+' : '-'}${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                                {/* Confirmed Ledger Entries */}
                                {transactions
                                    .filter(t => filter === 'all' || t.type === filter)
                                    .map((t) => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '1.25rem 0' }}>
                                                <div style={{ fontWeight: 600 }}>{t.description}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {t.id.slice(0, 8)}</div>
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
            <style>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    )
}
