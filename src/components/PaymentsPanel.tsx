import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, CreditCard, ArrowDownRight, Smartphone, Globe, Shield } from 'lucide-react'
import type { TransferKind, BusinessPurpose } from '../lib/bridge'
import { createBridgeTransfer } from '../lib/bridge'

export const PaymentsPanel: React.FC = () => {
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState<'payin' | 'payout'>('payin')
    const [payinRoutes, setPayinRoutes] = useState<any[]>([])
    const [bridgeTransfers, setBridgeTransfers] = useState<any[]>([])
    const [showTransferForm, setShowTransferForm] = useState(false)
    const [showPayinForm, setShowPayinForm] = useState(false)
    const [loading, setLoading] = useState(true)

    // Form states
    const [transferKind, setTransferKind] = useState<TransferKind>('wallet_to_external_bank')
    const [businessPurpose, setBusinessPurpose] = useState<BusinessPurpose>('supplier_payment')
    const [payinType, setPayinType] = useState('ACH_to_crypto')
    const [amount, setAmount] = useState('')
    const [currency, setCurrency] = useState('USDC')
    const [destinationId, setDestinationId] = useState('')
    const [clientCryptoAddress, setClientCryptoAddress] = useState('')
    const [clientStablecoin, setClientStablecoin] = useState('USDC')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchPaymentsData()
    }, [user])

    const fetchPaymentsData = async () => {
        if (!user) return
        setLoading(true)

        const [routes, transfers] = await Promise.all([
            supabase.from('payin_routes').select('*').eq('user_id', user.id),
            supabase.from('bridge_transfers').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
        ])

        if (routes.data) setPayinRoutes(routes.data)
        if (transfers.data) setBridgeTransfers(transfers.data)
        setLoading(false)
    }

    const handleCreateTransfer = async () => {
        if (!user || !amount) return
        setLoading(true)
        setError(null)

        try {
            const idempotencyKey = `transfer_${user.id}_${Date.now()}`
            const { error: transferErr } = await createBridgeTransfer({
                userId: user.id,
                amount: Number(amount),
                currency,
                kind: transferKind,
                purpose: businessPurpose,
                idempotencyKey,
                destinationId,
                destinationType: transferKind === 'wallet_to_external_bank' ? 'external_account' : 'external_crypto_address'
            })

            if (transferErr) throw transferErr

            setShowTransferForm(false)
            fetchPaymentsData()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleRequestPayin = async () => {
        if (!user) return
        setLoading(true)
        setError(null)
        try {
            const { error } = await supabase
                .from('payin_routes')
                .insert([{
                    user_id: user.id,
                    type: payinType,
                    status: 'submitted',
                    metadata: payinType === 'ACH_to_crypto' ? {
                        destination_address: clientCryptoAddress,
                        stablecoin: clientStablecoin
                    } : {}
                }])

            if (error) throw error

            setShowPayinForm(false)
            fetchPaymentsData()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const translateStatus = (status: string) => {
        const statuses: any = {
            'submitted': 'Enviado',
            'active': 'Activo',
            'paid': 'Pagado',
            'pending': 'Pendiente',
            'rejected': 'Rechazado'
        }
        return statuses[status] || status
    }

    const translateType = (type: string) => {
        const types: any = {
            'ACH_to_crypto': 'ACH a Crypto',
            'crypto_to_crypto': 'Crypto a Crypto',
            'crypto_to_ACH': 'Crypto a ACH'
        }
        return types[type] || type.replace(/_/g, ' ')
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Pagos</h1>
                <div style={{ background: '#E2E8F0', padding: '4px', borderRadius: '12px', display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setActiveTab('payin')}
                        style={{
                            padding: '0.5rem 1.25rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            background: activeTab === 'payin' ? '#fff' : 'transparent',
                            boxShadow: activeTab === 'payin' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                            color: activeTab === 'payin' ? 'var(--secondary)' : 'var(--text-muted)'
                        }}
                    >
                        Rutas de Depósito
                    </button>
                    <button
                        onClick={() => setActiveTab('payout')}
                        style={{
                            padding: '0.5rem 1.25rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            background: activeTab === 'payout' ? '#fff' : 'transparent',
                            boxShadow: activeTab === 'payout' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                            color: activeTab === 'payout' ? 'var(--secondary)' : 'var(--text-muted)'
                        }}
                    >
                        Retiros
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'payin' ? (
                    <motion.div key="payin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Gestiona tus métodos de depósito e instrucciones activas.</p>
                            <button className="btn-primary" style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem' }} onClick={() => setShowPayinForm(true)}>
                                <Plus size={18} /> Nueva Ruta
                            </button>
                        </div>

                        {showPayinForm && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="premium-card" style={{ marginBottom: '2rem', background: '#F8FAFC' }}>
                                <h4 style={{ marginBottom: '1.5rem' }}>Selecciona el Tipo de Ruta</h4>
                                {error && (
                                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                        {error}
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="input-group">
                                        <label>Tipo de Depósito</label>
                                        <select value={payinType} onChange={e => setPayinType(e.target.value)} style={{ width: '100%' }}>
                                            <option value="ACH_to_crypto">ACH a Crypto (Virtual Account)</option>
                                            <option value="crypto_to_crypto">Crypto a Crypto (Custodial)</option>
                                            <option value="incoming_transfer">Otros Activos / Tron USDT (Incoming Transfer)</option>
                                        </select>
                                    </div>

                                    {payinType === 'ACH_to_crypto' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1rem', borderRadius: '12px', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                                <Shield size={20} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                <p style={{ fontSize: '0.75rem', color: '#B45309', margin: 0, lineHeight: 1.4 }}>
                                                    <strong>AVISO CRÍTICO:</strong> Revisa cuidadosamente tu dirección cripto. Cualquier error en la dirección puede provocar la <strong>pérdida total e irreversible</strong> del dinero enviado. Guira no puede recuperar fondos enviados a direcciones incorrectas.
                                                </p>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="input-group">
                                                    <label>Stablecoin Destino</label>
                                                    <select value={clientStablecoin} onChange={e => setClientStablecoin(e.target.value)}>
                                                        <option value="USDC">USDC (USD Coin)</option>
                                                        <option value="USDT">USDT (Tether)</option>
                                                        <option value="EURC">EURC (Euro Coin)</option>
                                                        <option value="PYUSD">PYUSD (PayPal USD)</option>
                                                    </select>
                                                </div>
                                                <div className="input-group">
                                                    <label>Dirección de Billetera (Recibirás tus fondos aquí)</label>
                                                    <input
                                                        placeholder="0x... o Dirección SOL"
                                                        value={clientCryptoAddress}
                                                        onChange={e => setClientCryptoAddress(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button onClick={handleRequestPayin} disabled={loading || (payinType === 'ACH_to_crypto' && !clientCryptoAddress)} className="btn-primary" style={{ flex: 1 }}>
                                            {loading ? 'Procesando...' : 'Habilitar Ruta'}
                                        </button>
                                        <button onClick={() => setShowPayinForm(false)} className="btn-secondary" style={{ flex: 0.3 }}>Cancelar</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                            {payinRoutes.length === 0 ? (
                                <div className="premium-card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                                    <CreditCard size={48} style={{ marginBottom: '1rem' }} />
                                    <p>No hay rutas activas. Envía una solicitud para comenzar.</p>
                                </div>
                            ) : payinRoutes.map(route => (
                                <div key={route.id} className="premium-card" style={{ overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(0, 82, 255, 0.05)', color: 'var(--secondary)' }}>
                                            <ArrowDownRight size={24} />
                                        </div>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            background: route.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                            color: route.status === 'active' ? 'var(--success)' : 'var(--warning)'
                                        }}>
                                            {translateStatus(route.status)}
                                        </span>
                                    </div>
                                    <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{translateType(route.type)}</h4>

                                    {route.status === 'active' && route.instructions ? (
                                        <div style={{ marginTop: '1.5rem', background: '#F1F5F9', padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>Instrucciones de Depósito:</p>

                                            {route.instructions.banco && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Banco:</span>
                                                    <span style={{ fontWeight: 600 }}>{route.instructions.banco}</span>
                                                </div>
                                            )}
                                            {route.instructions.cuenta && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Cuenta:</span>
                                                    <span style={{ fontWeight: 600 }}>{route.instructions.cuenta}</span>
                                                </div>
                                            )}
                                            {route.instructions.routing && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Routing:</span>
                                                    <span style={{ fontWeight: 600 }}>{route.instructions.routing}</span>
                                                </div>
                                            )}
                                            {route.instructions.network && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Red:</span>
                                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{route.instructions.network}</span>
                                                </div>
                                            )}
                                            {route.instructions.address && (
                                                <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                                                    <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Dirección:</span>
                                                    <code style={{ background: '#fff', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.75rem', wordBreak: 'break-all', display: 'block' }}>
                                                        {route.instructions.address}
                                                    </code>
                                                </div>
                                            )}
                                            {route.instructions.notes && (
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                                    * {route.instructions.notes}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                                            {route.status === 'active' ? 'Sin instrucciones configuradas.' : 'Esperando configuración del staff...'}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div key="payout" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Gestión de Transferencias</h3>
                                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Orquestación centralizada vía Bridge.xyz</p>
                            </div>
                            <button className="btn-primary" style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem' }} onClick={() => setShowTransferForm(true)}>
                                <Plus size={18} /> Nueva Transferencia
                            </button>
                        </div>

                        {showTransferForm && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="premium-card" style={{ marginBottom: '2rem', background: '#F8FAFC', border: '1px solid var(--primary-light)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--primary)' }}>
                                    <Shield size={20} />
                                    <h4 style={{ margin: 0 }}>Crear Objeto Transferencia</h4>
                                </div>

                                {error && (
                                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                        {error}
                                    </div>
                                ) || (
                                        <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.8rem' }}>
                                            <Smartphone size={14} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                                            Esta operación es idempotente y requiere balance confirmado.
                                        </div>
                                    )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                                    <div className="input-group">
                                        <label>Tipo de Transferencia (Técnico)</label>
                                        <select value={transferKind} onChange={e => setTransferKind(e.target.value as TransferKind)}>
                                            <option value="wallet_to_external_bank">Liquidación Bancaria (Fiat)</option>
                                            <option value="wallet_to_external_crypto">Envío Cripto (External)</option>
                                            <option value="wallet_to_wallet">Wallet a Wallet (Interno)</option>
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Propósito de Negocio</label>
                                        <select value={businessPurpose} onChange={e => setBusinessPurpose(e.target.value as BusinessPurpose)}>
                                            <option value="supplier_payment">Pago a Proveedor</option>
                                            <option value="client_withdrawal">Retiro de Cliente</option>
                                            <option value="funding">Fondeo de Cuenta</option>
                                            <option value="liquidation">Liquidación de Activos</option>
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Token (Bridge Supported Only)</label>
                                        <select value={currency} onChange={e => setCurrency(e.target.value)}>
                                            <option value="USDC">USDC (Solana/Base/Eth)</option>
                                            <option value="USDB">USDB (Blast)</option>
                                            <option value="EURC">EURC (Euro Stable)</option>
                                            <option value="PYUSD">PYUSD (PayPal)</option>
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Monto</label>
                                        <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                                    </div>
                                </div>
                                <div className="input-group" style={{ marginTop: '1.25rem' }}>
                                    <label>ID Destino (External ID o Address)</label>
                                    <input placeholder="e.g. ext_123... o 0x..." value={destinationId} onChange={e => setDestinationId(e.target.value)} />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                    <button onClick={handleCreateTransfer} disabled={loading} className="btn-primary" style={{ flex: 1 }}>
                                        {loading ? 'Validando...' : 'Ejecutar Orquestación Bridge'}
                                    </button>
                                    <button onClick={() => setShowTransferForm(false)} className="btn-secondary">Cancelar</button>
                                </div>
                            </motion.div>
                        )}

                        <div className="premium-card" style={{ padding: '0' }}>
                            {bridgeTransfers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                                    <Globe size={48} style={{ marginBottom: '1rem' }} />
                                    <p>No se encontraron transferencias orquestadas.</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                                <th style={{ padding: '1.5rem' }}>Kind / Purpose</th>
                                                <th style={{ padding: '1.5rem' }}>Estado (Webhook)</th>
                                                <th style={{ padding: '1.5rem', textAlign: 'right' }}>Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bridgeTransfers.map(trans => (
                                                <tr key={trans.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '1.5rem' }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{trans.transfer_kind.replace(/_/g, ' ')}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase' }}>{trans.business_purpose.replace(/_/g, ' ')}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(trans.created_at).toLocaleDateString()}</div>
                                                    </td>
                                                    <td style={{ padding: '1.5rem' }}>
                                                        <div style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.4rem',
                                                            padding: '4px 12px',
                                                            borderRadius: '20px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            background: trans.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                            color: trans.status === 'completed' ? 'var(--success)' : 'var(--warning)',
                                                            textTransform: 'uppercase'
                                                        }}>
                                                            {trans.status}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1.5rem', textAlign: 'right', fontWeight: 700 }}>
                                                        {trans.amount.toLocaleString()} {trans.currency}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
