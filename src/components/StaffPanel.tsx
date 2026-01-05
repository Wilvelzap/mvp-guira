import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
    Users,
    Search,
    ArrowUpRight,
    ArrowDownLeft,
    Shield,
    Box,
    FileDown
} from 'lucide-react'
import { generatePaymentPDF } from '../lib/pdf'
import { motion, AnimatePresence } from 'framer-motion'

export const StaffPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'onboarding' | 'payins' | 'transfers' | 'orders' | 'config'>('onboarding')
    const [items, setItems] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Config states
    const [fees, setFees] = useState<any[]>([])

    // Order processing states
    const [staffExchangeRate, setStaffExchangeRate] = useState<string>('')
    const [staffConvertedAmount, setStaffConvertedAmount] = useState<string>('')
    const [staffFee, setStaffFee] = useState<string>('')
    const [staffReference, setStaffReference] = useState<string>('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [railFilter, setRailFilter] = useState<string>('all')

    useEffect(() => {
        fetchData()
    }, [activeTab])

    const fetchData = async () => {
        let query: any

        if (activeTab === 'onboarding') {
            query = supabase.from('onboarding').select('*, profiles(email)').order('updated_at', { ascending: false })
        } else if (activeTab === 'payins') {
            query = supabase.from('payin_routes').select('*, profiles(email)').order('created_at', { ascending: false })
        } else if (activeTab === 'transfers') {
            query = supabase.from('bridge_transfers').select('*, profiles(email)').order('created_at', { ascending: false })
        } else if (activeTab === 'orders') {
            query = supabase.from('payment_orders').select('*, profiles(email)').order('created_at', { ascending: false })
        } else if (activeTab === 'config') {
            const { data } = await supabase.from('fees_config').select('*')
            if (data) setFees(data)
            return
        }

        const { data } = await query
        if (data) setItems(data)
    }

    const handleUpdateStatus = async (id: string, table: string, status: string, additionalData: any = {}) => {
        const item = items.find(i => i.id === id)
        if (!item) return

        try {
            const { error } = await supabase
                .from(table)
                .update({ status, ...additionalData })
                .eq('id', id)

            if (error) throw error

            if (table === 'onboarding') {
                const profileStatus = status === 'verified' ? 'verified' : (status === 'rejected' ? 'rejected' : status)
                await supabase.from('profiles').update({ onboarding_status: profileStatus }).eq('id', item.user_id)

                if (status === 'verified') {
                    const { data: existingWallet } = await supabase.from('wallets').select('id').eq('user_id', item.user_id).maybeSingle()
                    if (!existingWallet) {
                        await supabase.from('wallets').insert([{ user_id: item.user_id, currency: 'USD' }])
                    }
                }
            }

            if (table === 'bridge_transfers' && status === 'completed') {
                const { data: wallet } = await supabase.from('wallets').select('id').eq('user_id', item.user_id).single()
                if (wallet) {
                    await supabase.from('ledger_entries').insert([{
                        wallet_id: wallet.id,
                        bridge_transfer_id: item.id,
                        type: item.transfer_kind.startsWith('wallet_to_') ? 'payout' : 'deposit',
                        amount: item.amount,
                        description: `Bridge Transfer: ${item.business_purpose.replace(/_/g, ' ')}`,
                        metadata: { bridge_transfer_id: item.bridge_transfer_id }
                    }])
                }
            }

            fetchData()
            setSelectedItem(null)
        } catch (err: any) {
            console.error('Error updating status:', err)
            alert('Error al actualizar: ' + err.message)
        }
    }

    const handleViewDoc = async (path: string) => {
        const { data } = await supabase.storage.from('onboarding_docs').createSignedUrl(path, 600)
        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    }

    const translateStatus = (status: string) => {
        const statuses: any = {
            'submitted': 'Enviado',
            'active': 'Activo',
            'paid': 'Pagado',
            'pending': 'Pendiente',
            'rejected': 'Rechazado',
            'verified': 'Verificado',
            'under_review': 'En Revisión',
            'inactive': 'Desactivada',
            'waiting_ubo_kyc': 'Esperando KYC Socios',
            'kyb_passed': 'Empresa Aprobada',
            'created': 'Creada',
            'waiting_deposit': 'Esperando Depósito',
            'deposit_received': 'Depósito Recibido',
            'processing': 'Procesando',
            'completed': 'Completado',
            'failed': 'Fallido'
        }
        return statuses[status] || status
    }

    const translateOrderType = (type: string) => {
        const types: any = {
            'BO_TO_WORLD': 'Pagar al Exterior',
            'WORLD_TO_BO': 'Recibir en Bolivia',
            'US_TO_WALLET': 'Recibir desde EE.UU.',
            'CRYPTO_TO_CRYPTO': 'Enviar Cripto'
        }
        return types[type] || type
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 800, margin: 0 }}>Gestión</h1>
                <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: '400px' }}>
                    <div className="search-bar" style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '0.6rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flex: 1
                    }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input
                            placeholder="Buscar email..."
                            style={{ border: 'none', padding: 0, fontSize: '0.875rem', width: '100%', background: 'transparent' }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ padding: '0.6rem', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.8rem' }}
                    >
                        <option value="all">Estado: Todos</option>
                        {['created', 'waiting_deposit', 'deposit_received', 'processing', 'sent', 'completed', 'failed'].map(s => (
                            <option key={s} value={s}>{translateStatus(s)}</option>
                        ))}
                    </select>
                    {activeTab === 'orders' && (
                        <select
                            value={railFilter}
                            onChange={(e) => setRailFilter(e.target.value)}
                            style={{ padding: '0.6rem', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.8rem' }}
                        >
                            <option value="all">Riel: Todos</option>
                            {['PSAV', 'SWIFT', 'ACH', 'DIGITAL_NETWORK'].map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
                <div className="tabs-container" style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '0.5rem',
                    width: '100%',
                    overflowX: 'auto',
                    paddingBottom: '0.5rem',
                    scrollbarWidth: 'none'
                }}>
                    <button onClick={() => setActiveTab('onboarding')} className={`nav-item ${activeTab === 'onboarding' ? 'active' : ''}`}>
                        <Users size={18} /> Onboarding
                    </button>
                    <button onClick={() => setActiveTab('payins')} className={`nav-item ${activeTab === 'payins' ? 'active' : ''}`}>
                        <ArrowDownLeft size={18} /> Rutas
                    </button>
                    <button onClick={() => setActiveTab('transfers')} className={`nav-item ${activeTab === 'transfers' ? 'active' : ''}`}>
                        <ArrowUpRight size={18} /> Transfers
                    </button>
                    <button onClick={() => setActiveTab('orders')} className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}>
                        <Box size={18} /> Órdenes
                    </button>
                    <button onClick={() => setActiveTab('config')} className={`nav-item ${activeTab === 'config' ? 'active' : ''}`}>
                        <Shield size={18} /> Configuración
                    </button>
                </div>

                <div style={{ flex: 1 }}>
                    {activeTab === 'config' ? (
                        <div className="premium-card">
                            <h3 style={{ marginBottom: '1.5rem' }}>Configuración Global de Fees</h3>
                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                {fees.map(f => (
                                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--primary)' }}>{f.type.replace(/_/g, ' ')}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tipo: {f.fee_type}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                defaultValue={f.value}
                                                onBlur={async (e) => {
                                                    await supabase.from('fees_config').update({ value: Number(e.target.value) }).eq('id', f.id)
                                                }}
                                                style={{ width: '80px', textAlign: 'right', padding: '0.5rem' }}
                                            />
                                            <span style={{ fontWeight: 600 }}>{f.fee_type === 'percentage' ? '%' : f.currency}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="premium-card" style={{ padding: 0 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '1.25rem' }}>Usuario / Detalles</th>
                                        <th style={{ padding: '1.25rem' }}>Estado</th>
                                        <th style={{ padding: '1.25rem' }}>Fecha</th>
                                        <th style={{ padding: '1.25rem', textAlign: 'right' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items
                                        .filter(item => {
                                            const matchesSearch = item.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase())
                                            const matchesStatus = statusFilter === 'all' || item.status === statusFilter
                                            const matchesRail = railFilter === 'all' || item.processing_rail === railFilter
                                            return matchesSearch && matchesStatus && matchesRail
                                        })
                                        .map(item => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '1.25rem' }}>
                                                    <div style={{ fontWeight: 600 }}>{item.profiles?.email}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {activeTab === 'orders'
                                                            ? `${translateOrderType(item.order_type)} [${item.processing_rail.split('_')[0].toUpperCase()}]`
                                                            : (item.transfer_kind ? `${item.transfer_kind} (${item.business_purpose})` : (item.type || 'General'))}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1.25rem' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        background: ['verified', 'paid', 'completed', 'active', 'deposit_received'].includes(item.status) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                        color: ['verified', 'paid', 'completed', 'active', 'deposit_received'].includes(item.status) ? 'var(--success)' : (['inactive', 'rejected', 'failed'].includes(item.status) ? 'var(--error)' : 'var(--warning)'),
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {translateStatus(item.status)}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                    {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                                                </td>
                                                <td style={{ padding: '1.25rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                        {activeTab === 'orders' && (
                                                            <div style={{ textAlign: 'right', marginRight: '1rem' }}>
                                                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.amount_origin} {item.origin_currency}</div>
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>→ {item.amount_converted || '?'} {item.destination_currency}</div>
                                                            </div>
                                                        )}
                                                        <button onClick={() => setSelectedItem(item)} className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
                                                            Revisar
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {selectedItem && (
                    <motion.div
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 100 }}
                        className="review-panel"
                        style={{
                            position: 'fixed',
                            top: 0,
                            right: 0,
                            width: 'min(100%, 450px)',
                            height: '100vh',
                            background: '#fff',
                            boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
                            zIndex: 1100,
                            padding: '2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            overflowY: 'auto'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Detalles de Revisión</h2>
                            <button onClick={() => setSelectedItem(null)} className="btn-secondary" style={{ padding: '0.5rem' }}>✕</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Usuario</h4>
                                <p style={{ fontWeight: 600 }}>{selectedItem.profiles?.email}</p>
                            </div>

                            {activeTab === 'onboarding' && (
                                <>
                                    <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', fontSize: '0.85rem' }}>
                                        {selectedItem.data && Object.entries(selectedItem.data).map(([key, val]) => {
                                            if (typeof val === 'string' && (val.includes('/') || val.length > 60)) return null;
                                            if (key === 'ubos') return null;
                                            return (
                                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{key.replace(/_/g, ' ')}:</span>
                                                    <span style={{ fontWeight: 500 }}>{String(val)}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        {['id_front', 'id_back', 'selfie', 'proof_of_address', 'company_cert'].map(doc => selectedItem.data?.[doc] && (
                                            <button key={doc} onClick={() => handleViewDoc(selectedItem.data[doc])} className="btn-secondary" style={{ fontSize: '0.7rem' }}>
                                                Ver {doc.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                        <button onClick={() => handleUpdateStatus(selectedItem.id, 'onboarding', 'verified')} className="btn-primary" style={{ flex: 1, background: 'var(--success)' }}>Aprobar</button>
                                        <button onClick={() => handleUpdateStatus(selectedItem.id, 'onboarding', 'rejected')} className="btn-secondary" style={{ flex: 1, color: 'var(--error)' }}>Rechazar</button>
                                    </div>
                                </>
                            )}

                            {activeTab === 'payins' && (
                                <>
                                    <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px' }}>
                                        <h4 style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Solicitud del Cliente</h4>

                                        {selectedItem.metadata && (
                                            <div style={{ background: '#F0F9FF', padding: '1rem', borderRadius: '12px', border: '1px solid #BAE6FD', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                                                <div style={{ marginBottom: '0.5rem' }}>
                                                    <span style={{ color: '#0369A1', fontWeight: 700 }}>Billetera de Destino:</span>
                                                    <code style={{ display: 'block', background: '#fff', padding: '4px', borderRadius: '4px', marginTop: '4px', wordBreak: 'break-all' }}>
                                                        {selectedItem.metadata.destination_address || 'No provista'}
                                                    </code>
                                                </div>
                                                <div style={{ display: 'flex', gap: '1rem' }}>
                                                    <div>
                                                        <span style={{ color: '#0369A1', fontWeight: 700 }}>Moneda:</span> {selectedItem.metadata.stablecoin}
                                                    </div>
                                                    <div>
                                                        <span style={{ color: '#0369A1', fontWeight: 700 }}>Red:</span> {selectedItem.metadata.network}
                                                    </div>
                                                </div>
                                                {selectedItem.metadata.intended_amount && (
                                                    <div style={{ marginTop: '0.5rem' }}>
                                                        <span style={{ color: '#0369A1', fontWeight: 700 }}>Monto Estimado:</span> {selectedItem.metadata.intended_amount} USD
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <h4 style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Configurar Instrucciones Bancarias</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {selectedItem.type === 'ACH_to_crypto' && (
                                                <>
                                                    <input placeholder="Banco" defaultValue={selectedItem.instructions?.banco} onChange={e => selectedItem.instructions = { ...selectedItem.instructions, banco: e.target.value }} />
                                                    <input placeholder="Cuenta" defaultValue={selectedItem.instructions?.cuenta} onChange={e => selectedItem.instructions = { ...selectedItem.instructions, cuenta: e.target.value }} />
                                                    <input placeholder="Routing" defaultValue={selectedItem.instructions?.routing} onChange={e => selectedItem.instructions = { ...selectedItem.instructions, routing: e.target.value }} />
                                                </>
                                            )}
                                            {(selectedItem.type === 'crypto_to_crypto' || selectedItem.type === 'incoming_transfer') && (
                                                <>
                                                    <input placeholder="Red" defaultValue={selectedItem.instructions?.network} onChange={e => selectedItem.instructions = { ...selectedItem.instructions, network: e.target.value }} />
                                                    <input placeholder="Address" defaultValue={selectedItem.instructions?.address} onChange={e => selectedItem.instructions = { ...selectedItem.instructions, address: e.target.value }} />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => handleUpdateStatus(selectedItem.id, 'payin_routes', 'active', { instructions: selectedItem.instructions || {} })} className="btn-primary">Activar Ruta</button>
                                </>
                            )}

                            {activeTab === 'transfers' && (
                                <>
                                    <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span>Monto:</span>
                                            <span style={{ fontWeight: 700 }}>{selectedItem.amount} {selectedItem.currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span>Fee:</span>
                                            <span style={{ color: 'var(--error)' }}>-{selectedItem.fee_amount}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Neto:</span>
                                            <span style={{ fontWeight: 800, color: 'var(--success)' }}>{selectedItem.net_amount}</span>
                                        </div>
                                        <div style={{ marginTop: '1rem', fontSize: '0.8rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                            <strong>Destino:</strong> {selectedItem.destination_id}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button onClick={() => handleUpdateStatus(selectedItem.id, 'bridge_transfers', 'completed')} className="btn-primary" style={{ flex: 1, background: 'var(--success)' }}>Completar</button>
                                        <button onClick={() => handleUpdateStatus(selectedItem.id, 'bridge_transfers', 'failed')} className="btn-secondary" style={{ flex: 1, color: 'var(--error)' }}>Fallar</button>
                                    </div>
                                </>
                            )}

                            {activeTab === 'orders' && (
                                <>
                                    <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tipo:</span>
                                            <span style={{ fontWeight: 700 }}>{translateOrderType(selectedItem.order_type)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monto:</span>
                                            <span style={{ fontWeight: 800 }}>{selectedItem.amount_origin} {selectedItem.origin_currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rail:</span>
                                            <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{selectedItem.processing_rail.replace(/_/g, ' ')}</span>
                                        </div>
                                        {selectedItem.metadata?.payment_reason && (
                                            <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Motivo:</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selectedItem.metadata.payment_reason}</span>
                                            </div>
                                        )}
                                    </div>

                                    {selectedItem.evidence_url && (
                                        <div style={{ background: '#FFFBEB', padding: '1rem', borderRadius: '12px', border: '1px solid #FEF3C7' }}>
                                            <p style={{ fontSize: '0.75rem', color: '#B45309', marginBottom: '0.5rem' }}>
                                                {selectedItem.order_type === 'BO_TO_WORLD' ? 'Factura / Proforma Adjunta:' : 'Comprobante de Depósito / QR:'}
                                            </p>
                                            <button onClick={() => window.open(selectedItem.evidence_url, '_blank')} className="btn-secondary" style={{ width: '100%', fontSize: '0.75rem' }}>Ver Documento</button>
                                        </div>
                                    )}

                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                        {selectedItem.status === 'created' || selectedItem.status === 'waiting_deposit' ? (
                                            <button onClick={() => handleUpdateStatus(selectedItem.id, 'payment_orders', 'deposit_received')} className="btn-primary" style={{ width: '100%' }}>Confirmar Depósito</button>
                                        ) : selectedItem.status === 'deposit_received' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <div className="input-group">
                                                        <label style={{ fontSize: '0.7rem' }}>Tasa de Cambio Real</label>
                                                        <input type="number" placeholder="Ej: 10.55" value={staffExchangeRate} onChange={e => setStaffExchangeRate(e.target.value)} />
                                                    </div>
                                                    <div className="input-group">
                                                        <label style={{ fontSize: '0.7rem' }}>Comisión Real ($)</label>
                                                        <input type="number" placeholder="Ej: 15.00" value={staffFee} onChange={e => setStaffFee(e.target.value)} />
                                                    </div>
                                                    <div className="input-group" style={{ gridColumn: '1/-1' }}>
                                                        <label style={{ fontSize: '0.7rem' }}>Monto Neto Final ($)</label>
                                                        <input type="number" placeholder="Monto total liquidado" value={staffConvertedAmount} onChange={e => setStaffConvertedAmount(e.target.value)} />
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleUpdateStatus(selectedItem.id, 'payment_orders', 'processing', {
                                                        exchange_rate_applied: Number(staffExchangeRate),
                                                        amount_converted: Number(staffConvertedAmount),
                                                        fee_total: Number(staffFee)
                                                    })}
                                                    className="btn-primary"
                                                    disabled={!staffExchangeRate || !staffConvertedAmount}
                                                >
                                                    Pasar a Procesamiento
                                                </button>
                                            </div>
                                        ) : selectedItem.status === 'processing' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div className="input-group">
                                                    <label style={{ fontSize: '0.7rem' }}>Referencia / Hash (Evidencia)</label>
                                                    <input placeholder="Hash o Ref Bancaria" value={staffReference} onChange={e => setStaffReference(e.target.value)} />
                                                </div>
                                                <div className="input-group">
                                                    <label style={{ fontSize: '0.7rem' }}>Comprobante Final (PDF/Imagen):</label>
                                                    <input id="staff_evidence" type="file" />
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        const file = (document.getElementById('staff_evidence') as HTMLInputElement).files?.[0]
                                                        if (!file && !staffReference) return alert('Debes cargar un archivo o registrar el Hash/Referencia')

                                                        try {
                                                            let publicUrl = selectedItem.staff_comprobante_url
                                                            if (file) {
                                                                const fileExt = file.name.split('.').pop()
                                                                const filePath = `evidences/${selectedItem.id}/staff_${Date.now()}.${fileExt}`
                                                                const { error: uploadError } = await supabase.storage.from('order-evidences').upload(filePath, file)
                                                                if (uploadError) throw uploadError
                                                                const { data: { publicUrl: url } } = supabase.storage.from('order-evidences').getPublicUrl(filePath)
                                                                publicUrl = url
                                                            }

                                                            await supabase.from('payment_orders').update({
                                                                status: 'completed',
                                                                staff_comprobante_url: publicUrl,
                                                                metadata: { ...selectedItem.metadata, reference: staffReference }
                                                            }).eq('id', selectedItem.id)

                                                            setSelectedItem(null)
                                                            fetchData()
                                                        } catch (err: any) {
                                                            alert('Error: ' + err.message)
                                                        }
                                                    }}
                                                    className="btn-primary"
                                                    style={{ background: 'var(--success)' }}
                                                >
                                                    Completar Orden
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>
                                                ORDEN FINALIZADA
                                                <button
                                                    onClick={() => generatePaymentPDF({
                                                        id: selectedItem.id,
                                                        userName: selectedItem.profiles?.email || 'Cliente',
                                                        supplierName: selectedItem.metadata?.swiftDetails?.bankName || 'Destinatario Internacional',
                                                        date: selectedItem.updated_at,
                                                        amount: selectedItem.amount_origin,
                                                        currency: selectedItem.origin_currency,
                                                        fee: selectedItem.fee_total || 0,
                                                        netAmount: selectedItem.amount_converted || selectedItem.amount_origin,
                                                        exchangeRate: selectedItem.exchange_rate_applied,
                                                        type: translateOrderType(selectedItem.order_type),
                                                        rail: selectedItem.processing_rail,
                                                        reference: selectedItem.metadata?.reference,
                                                        paymentReason: selectedItem.metadata?.payment_reason
                                                    })}
                                                    className="btn-secondary"
                                                    style={{ width: '100%', marginTop: '1rem', gap: '0.5rem' }}
                                                >
                                                    <FileDown size={14} /> Descargar Comprobante PDF
                                                </button>
                                            </div>
                                        )}

                                        {selectedItem.status !== 'completed' && (
                                            <button onClick={() => handleUpdateStatus(selectedItem.id, 'payment_orders', 'failed')} className="btn-secondary" style={{ width: '100%', marginTop: '1rem', color: 'var(--error)' }}>Anular / Fallar</button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
