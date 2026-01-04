import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
    Users,
    ExternalLink,
    Search,
    ArrowUpRight,
    ArrowDownLeft,
    Shield
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export const StaffPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'onboarding' | 'payins' | 'transfers' | 'config'>('onboarding')
    const [items, setItems] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Config states
    const [fees, setFees] = useState<any[]>([])

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
            // 1. Update status in the main table
            const { error } = await supabase
                .from(table)
                .update({ status, ...additionalData })
                .eq('id', id)

            if (error) throw error

            // 2. Specialized Logic per Table
            if (table === 'onboarding') {
                const profileStatus = status === 'verified' ? 'verified' : (status === 'rejected' ? 'rejected' : status)
                const { error: pError } = await supabase.from('profiles').update({ onboarding_status: profileStatus }).eq('id', item.user_id)
                if (pError) throw pError

                if (status === 'verified') {
                    // Check if wallet exists first to avoid error
                    const { data: existingWallet } = await supabase.from('wallets').select('id').eq('user_id', item.user_id).maybeSingle()
                    if (!existingWallet) {
                        await supabase.from('wallets').insert([{ user_id: item.user_id, currency: 'USD' }])
                    }
                }
            }

            if (table === 'bridge_transfers' && status === 'completed') {
                // LEDGER INMUTABLE: Create entry only on completion
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

    const translateType = (type: string) => {
        const types: any = {
            'ACH_to_crypto': 'ACH a Crypto',
            'crypto_to_crypto': 'Crypto a Crypto',
            'incoming_transfer': 'Otros Activos / Tron USDT'
        }
        return types[type] || type.replace(/_/g, ' ')
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
            'kyb_passed': 'Empresa Aprobada'
        }
        return statuses[status] || status
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
                <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 800, margin: 0 }}>Gestión</h1>
                <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: '400px' }}>
                    <div style={{
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
                </div>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column' }}>
                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '0.5rem',
                    width: '100%',
                    overflowX: 'auto',
                    paddingBottom: '0.5rem',
                    scrollbarWidth: 'none'
                }}>
                    <button onClick={() => setActiveTab('onboarding')} className={`nav-item ${activeTab === 'onboarding' ? 'active' : ''}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Users size={18} /> Onboarding
                    </button>
                    <button onClick={() => setActiveTab('payins')} className={`nav-item ${activeTab === 'payins' ? 'active' : ''}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <ArrowDownLeft size={18} /> Rutas
                    </button>
                    <button onClick={() => setActiveTab('transfers')} className={`nav-item ${activeTab === 'transfers' ? 'active' : ''}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <ArrowUpRight size={18} /> Transfers
                    </button>
                    <button onClick={() => setActiveTab('config')} className={`nav-item ${activeTab === 'config' ? 'active' : ''}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Shield size={18} /> Configuración
                    </button>
                </div>

                {/* Content Area */}
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
                                        .filter(item => item.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .map(item => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '1.25rem' }}>
                                                    <div style={{ fontWeight: 600 }}>{item.profiles?.email}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {item.transfer_kind ? `${item.transfer_kind} (${item.business_purpose})` : (item.type || 'General')}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1.25rem' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        background: ['verified', 'paid', 'completed', 'active'].includes(item.status) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                        color: ['verified', 'paid', 'completed', 'active'].includes(item.status) ? 'var(--success)' : (item.status === 'inactive' || item.status === 'rejected' ? 'var(--error)' : 'var(--warning)'),
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {translateStatus(item.status)}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                    {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                                                </td>
                                                <td style={{ padding: '1.25rem', textAlign: 'right' }}>
                                                    <button onClick={() => setSelectedItem(item)} className="btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
                                                        Revisar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal-like Review Area */}
            <AnimatePresence>
                {selectedItem && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        style={{
                            position: 'fixed',
                            bottom: 0,
                            right: 0,
                            width: 'min(100%, 450px)',
                            height: '100vh',
                            background: '#fff',
                            boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
                            zIndex: 1100,
                            padding: 'clamp(1.5rem, 5vw, 3rem)',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: 'clamp(1.2rem, 4vw, 1.5rem)', fontWeight: 800 }}>Revisar Ítem</h2>
                            <button onClick={() => setSelectedItem(null)} className="btn-secondary" style={{ padding: '0.5rem' }}>✕</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Email del Usuario</h4>
                                <p style={{ fontWeight: 600 }}>{selectedItem.profiles?.email}</p>
                            </div>

                            {activeTab === 'onboarding' && (
                                <>
                                    <div>
                                        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Detalles del Perfil</h4>
                                        <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                            {selectedItem.data && Object.entries(selectedItem.data).map(([key, val]) => {
                                                if (typeof val === 'string' && (val.includes('/') || val.length > 60)) return null;
                                                if (key === 'ubos') return null;
                                                return (
                                                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}:</span>
                                                        <span style={{ fontWeight: 500 }}>{String(val)}</span>
                                                    </div>
                                                )
                                            })}
                                            {selectedItem.data?.ubos?.length > 0 && (
                                                <div style={{ marginTop: '0.5rem' }}>
                                                    <p style={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '0.5rem' }}>Beneficiarios Finales:</p>
                                                    {selectedItem.data.ubos.map((ubo: any, i: number) => (
                                                        <div key={i} style={{ fontSize: '0.75rem', marginBottom: '0.3rem', background: '#fff', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                            {ubo.first_names} {ubo.last_names} - {ubo.percentage}% ({ubo.nationality})
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Documentos Adjuntos</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            {['id_front', 'id_back', 'selfie', 'proof_of_address', 'company_cert'].map(doc => selectedItem.data?.[doc] && (
                                                <button key={doc} onClick={() => handleViewDoc(selectedItem.data[doc])} className="btn-secondary" style={{ fontSize: '0.7rem', gap: '0.4rem', padding: '0.5rem' }}>
                                                    <ExternalLink size={12} /> {doc.replace(/_/g, ' ')}
                                                </button>
                                            ))}
                                            {selectedItem.data?.ubos?.map((ubo: any, uIdx: number) => (
                                                ubo.docs && Object.entries(ubo.docs).map(([dKey, dVal]: any) => (
                                                    <button key={`${uIdx}-${dKey}`} onClick={() => handleViewDoc(dVal)} className="btn-secondary" style={{ fontSize: '0.7rem', gap: '0.4rem', padding: '0.5rem', borderColor: 'var(--primary-light)' }}>
                                                        <ExternalLink size={12} /> {ubo.first_names} - {dKey.replace(/_/g, ' ')}
                                                    </button>
                                                ))
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                        {selectedItem.type === 'business' && selectedItem.status === 'under_review' ? (
                                            <button onClick={() => handleUpdateStatus(selectedItem.id, 'onboarding', 'waiting_ubo_kyc')} className="btn-primary" style={{ flex: 1, background: 'var(--primary)', boxShadow: 'none' }}>
                                                Aprobar Empresa (Solicitar KYC Socios)
                                            </button>
                                        ) : (
                                            <button onClick={() => handleUpdateStatus(selectedItem.id, 'onboarding', 'verified')} className="btn-primary" style={{ flex: 1, background: 'var(--success)', boxShadow: 'none' }}>
                                                Aprobar Final
                                            </button>
                                        )}
                                        <button onClick={() => handleUpdateStatus(selectedItem.id, 'onboarding', 'rejected')} className="btn-primary" style={{ flex: 1, background: 'var(--error)', boxShadow: 'none' }}>
                                            Rechazar
                                        </button>
                                    </div>
                                </>
                            )}

                            {activeTab === 'payins' && (
                                <>
                                    <div style={{ background: '#F8FAFC', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
                                        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>Configurar Instrucciones para {translateType(selectedItem.type)}</h4>

                                        {selectedItem.metadata && Object.keys(selectedItem.metadata).length > 0 && (
                                            <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px dashed var(--primary-light)' }}>
                                                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Solicitud del Cliente:</p>
                                                {selectedItem.metadata.stablecoin && (
                                                    <div style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}><strong>Token:</strong> {selectedItem.metadata.stablecoin}</div>
                                                )}
                                                {selectedItem.metadata.destination_address && (
                                                    <div style={{ fontSize: '0.8rem' }}><strong>Address:</strong> <code style={{ fontSize: '0.7rem' }}>{selectedItem.metadata.destination_address}</code></div>
                                                )}
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {selectedItem.type === 'ACH_to_crypto' && (
                                                <>
                                                    <div className="input-group">
                                                        <label>Banco</label>
                                                        <input defaultValue={selectedItem.instructions?.banco || 'Bridge Bank'} onChange={e => {
                                                            selectedItem.instructions = { ...selectedItem.instructions, banco: e.target.value }
                                                        }} />
                                                    </div>
                                                    <div className="input-group">
                                                        <label>Número de Cuenta</label>
                                                        <input defaultValue={selectedItem.instructions?.cuenta} onChange={e => {
                                                            selectedItem.instructions = { ...selectedItem.instructions, cuenta: e.target.value }
                                                        }} />
                                                    </div>
                                                    <div className="input-group">
                                                        <label>Número de Ruta (Routing)</label>
                                                        <input defaultValue={selectedItem.instructions?.routing} onChange={e => {
                                                            selectedItem.instructions = { ...selectedItem.instructions, routing: e.target.value }
                                                        }} />
                                                    </div>
                                                </>
                                            )}

                                            {(selectedItem.type === 'crypto_to_crypto' || selectedItem.type === 'incoming_transfer') && (
                                                <>
                                                    <div className="input-group">
                                                        <label>Red / Protocolo</label>
                                                        <input placeholder="e.g. Solana, Tron (TRC20), Base" defaultValue={selectedItem.instructions?.network} onChange={e => {
                                                            selectedItem.instructions = { ...selectedItem.instructions, network: e.target.value }
                                                        }} />
                                                    </div>
                                                    <div className="input-group">
                                                        <label>Dirección de Wallet</label>
                                                        <input placeholder="0x... o Address" defaultValue={selectedItem.instructions?.address} onChange={e => {
                                                            selectedItem.instructions = { ...selectedItem.instructions, address: e.target.value }
                                                        }} />
                                                    </div>
                                                </>
                                            )}

                                            <div className="input-group">
                                                <label>Notas Adicionales (Opcional)</label>
                                                <input placeholder="Referencia o notas" defaultValue={selectedItem.instructions?.notes} onChange={e => {
                                                    selectedItem.instructions = { ...selectedItem.instructions, notes: e.target.value }
                                                }} />
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                                        <button
                                            onClick={() => handleUpdateStatus(selectedItem.id, 'payin_routes', 'active', { instructions: selectedItem.instructions || {} })}
                                            className="btn-primary"
                                            style={{ flex: 1 }}
                                        >
                                            {selectedItem.status === 'active' ? 'Actualizar Instrucciones' : 'Activar y Enviar'}
                                        </button>
                                        {selectedItem.status === 'active' && (
                                            <button
                                                onClick={() => handleUpdateStatus(selectedItem.id, 'payin_routes', 'inactive')}
                                                className="btn-secondary"
                                                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                                            >
                                                Desactivar
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {activeTab === 'transfers' && (
                                <>
                                    <div style={{ background: '#F8FAFC', borderRadius: '16px', padding: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monto:</span>
                                            <span style={{ fontWeight: 800, fontSize: '1.25rem' }}>${selectedItem.amount.toLocaleString()} {selectedItem.currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fee Guira:</span>
                                            <span style={{ fontWeight: 600, color: 'var(--error)' }}>- ${selectedItem.fee_amount?.toLocaleString()}</span>
                                        </div>
                                        {selectedItem.exchange_rate && selectedItem.exchange_rate !== 1 && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>T. Cambio:</span>
                                                <span style={{ fontWeight: 600 }}>{selectedItem.exchange_rate}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monto Neto:</span>
                                            <span style={{ fontWeight: 800, color: 'var(--success)' }}>${selectedItem.net_amount?.toLocaleString()}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tipo:</span>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedItem.transfer_kind}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Destino:</span>
                                            <span style={{ fontWeight: 600, fontSize: '0.8rem', maxWidth: '200px', wordBreak: 'break-all', textAlign: 'right' }}>{selectedItem.destination_id}</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                                        <button
                                            onClick={() => handleUpdateStatus(selectedItem.id, 'bridge_transfers', 'completed')}
                                            className="btn-primary"
                                            style={{ background: 'var(--success)', boxShadow: 'none' }}
                                        >
                                            Confirmar Pago (Sim Webhook)
                                        </button>
                                        <button
                                            onClick={() => handleUpdateStatus(selectedItem.id, 'bridge_transfers', 'failed')}
                                            className="btn-primary"
                                            style={{ background: 'var(--error)', boxShadow: 'none' }}
                                        >
                                            Marcar Error
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
                                        Confirmar actualizará el Ledger inmutablemente.
                                    </p>
                                </>
                            )}

                            {/* Removed obsolete payout tab */}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
