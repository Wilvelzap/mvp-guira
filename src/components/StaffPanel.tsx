import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
    Users,
    Search,
    ArrowUpRight,
    ArrowDownLeft,
    Shield,
    Box,
    FileDown,
    Plus,
    X,
    AlertTriangle,
    Save,
    Upload
} from 'lucide-react'
import { generatePaymentPDF } from '../lib/pdf'
import { registerAuditLog } from '../lib/audit'
import { motion, AnimatePresence } from 'framer-motion'

export const StaffPanel: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'onboarding' | 'payins' | 'transfers' | 'orders' | 'config'>('onboarding')
    const [items, setItems] = useState<any[]>([])
    const [selectedItem, setSelectedItem] = useState<any>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Config states
    const [fees, setFees] = useState<any[]>([])
    const [platformSettings, setPlatformSettings] = useState<any[]>([])
    const [uploadingQr, setUploadingQr] = useState(false)

    // Order processing states
    const [staffExchangeRate, setStaffExchangeRate] = useState<string>('')
    const [staffConvertedAmount, setStaffConvertedAmount] = useState<string>('')
    const [staffFee, setStaffFee] = useState<string>('')
    const [staffReference, setStaffReference] = useState<string>('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [railFilter, setRailFilter] = useState<string>('all')

    // Audit and Control States
    const [userRole, setUserRole] = useState<'staff' | 'admin' | null>(null)
    const [showReasonModal, setShowReasonModal] = useState(false)
    const [modificationReason, setModificationReason] = useState('')
    const [pendingAction, setPendingAction] = useState<any>(null)
    const [isCreatingManual, setIsCreatingManual] = useState<boolean>(false)
    const [isEditingMaterial, setIsEditingMaterial] = useState<boolean>(false)

    // Form for manual creation/edit
    const [formContent, setFormContent] = useState<any>({})
    const [allProfiles, setAllProfiles] = useState<any[]>([])
    const [userSearchTerm, setUserSearchTerm] = useState('')

    useEffect(() => {
        const checkRole = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
                if (profile) setUserRole(profile.role)
            }
        }
        const fetchProfiles = async () => {
            const { data } = await supabase.from('profiles').select('id, email, full_name')
            if (data) setAllProfiles(data)
        }
        checkRole()
        fetchProfiles()
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
            const { data: feeData } = await supabase.from('fees_config').select('*')
            if (feeData) setFees(feeData)

            const { data: settingsData } = await supabase.from('app_settings').select('*')
            if (settingsData) setPlatformSettings(settingsData)
            return
        }

        const { data } = await query
        if (data) setItems(data)
    }

    const handleUpdateStatus = async (id: string, table: string, status: string, additionalData: any = {}, reason: string = '') => {
        const item = items.find(i => i.id === id)
        if (!item) return

        // Validación de retroceso (Admin solo)
        if (status === 'created' && item.status !== 'created' && ['deposit_received', 'processing', 'completed'].includes(item.status)) {
            if (userRole !== 'admin') {
                alert('Solo los administradores pueden retroceder estados de órdenes fondeadas.')
                return
            }
        }

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('No autenticado')

            // Registrar Auditoría antes del cambio (para tener los valores previos)
            if (reason) {
                await registerAuditLog({
                    performed_by: user.id,
                    role: userRole as any,
                    action: 'change_status',
                    table_name: table,
                    record_id: id,
                    previous_values: { status: item.status },
                    new_values: { status, ...additionalData },
                    reason
                })
            }

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
                const { data: wallet } = await supabase.from('wallets').select('id').eq('user_id', item.user_id).maybeSingle()
                if (wallet) {
                    await supabase.from('ledger_entries').insert([{
                        wallet_id: wallet.id,
                        bridge_transfer_id: item.id,
                        type: item.transfer_kind.startsWith('wallet_to_') ? 'payout' : 'deposit',
                        amount: item.amount,
                        description: `Bridge Transfer: ${String(item.business_purpose || 'Transferencia').replace(/_/g, ' ')}`,
                        metadata: { bridge_transfer_id: item.bridge_transfer_id }
                    }])
                }
            }

            fetchData()
            setSelectedItem(null)
            setShowReasonModal(false)
            setModificationReason('')
            setPendingAction(null)
        } catch (err: any) {
            console.error('Error updating status:', err)
            alert('Error al actualizar: ' + err.message)
        }
    }

    const handleSaveManual = async () => {
        if (!userRole || userRole !== 'admin') {
            alert('Solo los administradores pueden realizar esta acción.')
            return
        }

        if (!modificationReason && !isCreatingManual) {
            alert('El motivo de la modificación es obligatorio.')
            return
        }

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('No autenticado')

            const table = activeTab === 'orders' ? 'payment_orders' : (activeTab === 'payins' ? 'payin_routes' : 'bridge_transfers')
            let res: any

            if (isCreatingManual) {
                // Agregar metadatos de creación manual
                const payload = {
                    ...formContent,
                    user_id: formContent.user_id || user.id, // Fallback si no se seleccionó cliente
                    metadata: {
                        ...(formContent.metadata || {}),
                        created_by: 'admin',
                        creation_type: 'manual',
                        requires_review: true
                    }
                }

                // Fix para bridge_transfers (campos obligatorios y saneamiento)
                if (table === 'bridge_transfers') {
                    payload.idempotency_key = crypto.randomUUID()
                    payload.transfer_kind = payload.transfer_kind || 'payout'
                    payload.business_purpose = payload.business_purpose || 'Administrative payout'
                    payload.amount = payload.amount || formContent.amount_origin || 0
                    payload.currency = payload.currency || formContent.origin_currency || 'USD'

                    // Sanear campos que pertenecen a otras tablas y que podrían estar en formContent
                    const keysToDelete = ['amount_origin', 'origin_currency', 'destination_currency', 'order_type', 'processing_rail', 'user_email', 'type'];
                    keysToDelete.forEach(k => delete payload[k]);
                }

                if (table === 'payment_orders') {
                    delete payload.user_email;
                    delete payload.type; // Pertenece a payin_routes
                }

                res = await supabase.from(table).insert(payload).select().single()
                if (res.error) throw res.error

                await registerAuditLog({
                    performed_by: user.id,
                    role: 'admin',
                    action: 'create',
                    table_name: table,
                    record_id: res.data.id,
                    new_values: payload,
                    reason: modificationReason || 'Creaci\u00f3n manual de registro operativo'
                })
            } else {
                // Edici\u00f3n Material de Admin
                const item = items.find(i => i.id === selectedItem.id)

                // Asegurar que formContent tenga lo necesario
                const updatePayload = { ...formContent }
                delete updatePayload.profiles // Evitar error de columna inexistente

                res = await supabase.from(table).update(updatePayload).eq('id', item.id)
                if (res.error) throw res.error

                await registerAuditLog({
                    performed_by: user.id,
                    role: 'admin',
                    action: 'update',
                    table_name: table,
                    record_id: item.id,
                    previous_values: item,
                    new_values: updatePayload,
                    reason: modificationReason
                })
            }

            fetchData()
            setSelectedItem(null)
            setIsCreatingManual(false)
            setIsEditingMaterial(false)
            setFormContent({})
            setModificationReason('')
            setShowReasonModal(false)
        } catch (err: any) {
            alert('Error al guardar: ' + err.message)
        }
    }

    const handleViewDoc = async (path: string) => {
        const { data } = await supabase.storage.from('onboarding_docs').createSignedUrl(path, 600)
        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    }

    const translateStatus = (status: string) => {
        if (!status) return 'Estado'
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
        if (!type) return 'Orden'
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

                    {userRole === 'admin' && activeTab !== 'config' && (
                        <button
                            onClick={() => {
                                setIsCreatingManual(true)
                                setFormContent({})
                            }}
                            className="btn-primary"
                            style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Plus size={18} /> Nuevo
                        </button>
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
                    {isCreatingManual ? (
                        <div className="premium-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <h3>+ Nueva {activeTab === 'orders' ? 'Órden' : (activeTab === 'payins' ? 'Ruta' : 'Transferencia')} (Manual)</h3>
                                <button onClick={() => setIsCreatingManual(false)} className="btn-secondary"><X size={18} /></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                {activeTab === 'orders' && (
                                    <>
                                        <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                            <label>Buscar Cliente (Email)</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    placeholder="Buscar por email..."
                                                    value={userSearchTerm}
                                                    onChange={e => setUserSearchTerm(e.target.value)}
                                                />
                                                {userSearchTerm && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                                        {allProfiles.filter(p => p.email?.toLowerCase().includes(userSearchTerm.toLowerCase())).map(p => (
                                                            <div
                                                                key={p.id}
                                                                style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                                                onClick={() => {
                                                                    setFormContent({ ...formContent, user_id: p.id, user_email: p.email })
                                                                    setUserSearchTerm(p.email)
                                                                }}
                                                            >
                                                                {p.email} ({p.full_name})
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="input-group">
                                            <label>Tipo de Orden</label>
                                            <select onChange={e => setFormContent({ ...formContent, order_type: e.target.value })}>
                                                <option value="">Seleccione...</option>
                                                <option value="BO_TO_WORLD">Pagar al Exterior</option>
                                                <option value="WORLD_TO_BO">Recibir en Bolivia</option>
                                                <option value="US_TO_WALLET">Recibir desde EE.UU.</option>
                                                <option value="CRYPTO_TO_CRYPTO">Enviar Cripto</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>Riel</label>
                                            <select onChange={e => setFormContent({ ...formContent, processing_rail: e.target.value })}>
                                                <option value="">Seleccione...</option>
                                                <option value="PSAV">PSAV (Bolivia)</option>
                                                <option value="SWIFT">SWIFT</option>
                                                <option value="ACH">ACH (EE.UU.)</option>
                                                <option value="DIGITAL_NETWORK">Cripto / Digital</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>Monto Origen</label>
                                            <input type="number" placeholder="0.00" onChange={e => setFormContent({ ...formContent, amount_origin: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>Moneda Origen</label>
                                            <select onChange={e => setFormContent({ ...formContent, origin_currency: e.target.value })}>
                                                <option value="">Seleccione...</option>
                                                <option value="Bs">Bs</option>
                                                <option value="USD">USD</option>
                                                <option value="USDT">USDT</option>
                                                <option value="USDC">USDC</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>Moneda Destino</label>
                                            <select onChange={e => setFormContent({ ...formContent, destination_currency: e.target.value })}>
                                                <option value="">Seleccione...</option>
                                                <option value="USD">USD</option>
                                                <option value="EUR">EUR</option>
                                                <option value="USDT">USDT</option>
                                                <option value="USDC">USDC</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>Red (Cripto)</label>
                                            <input placeholder="Ethereum, Base, etc." onChange={e => setFormContent({ ...formContent, metadata: { ...formContent.metadata, network: e.target.value } })} />
                                        </div>
                                        <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                            <label>Address / Wallet Destino</label>
                                            <input placeholder="0x..." onChange={e => setFormContent({ ...formContent, metadata: { ...formContent.metadata, address: e.target.value } })} />
                                        </div>
                                    </>
                                )}

                                {activeTab === 'payins' && (
                                    <>
                                        <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                            <label>Buscar Cliente (Email)</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    placeholder="Buscar por email..."
                                                    value={userSearchTerm}
                                                    onChange={e => setUserSearchTerm(e.target.value)}
                                                />
                                                {userSearchTerm && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                                        {allProfiles.filter(p => p.email?.toLowerCase().includes(userSearchTerm.toLowerCase())).map(p => (
                                                            <div
                                                                key={p.id}
                                                                style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                                                onClick={() => {
                                                                    setFormContent({ ...formContent, user_id: p.id })
                                                                    setUserSearchTerm(p.email)
                                                                }}
                                                            >
                                                                {p.email} ({p.full_name})
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="input-group">
                                            <label>Tipo de Ruta</label>
                                            <select onChange={e => setFormContent({ ...formContent, type: e.target.value })}>
                                                <option value="">Seleccione...</option>
                                                <option value="ACH_to_crypto">ACH a Billetera</option>
                                                <option value="crypto_to_crypto">Cripto a Cripto</option>
                                                <option value="crypto_to_ACH">Cripto a ACH</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label>Moneda Origen</label>
                                            <input placeholder="USD, USDT, etc." onChange={e => setFormContent({ ...formContent, metadata: { ...formContent.metadata, origin_currency: e.target.value } })} />
                                        </div>

                                        <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                            <h4 style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Instrucciones de Deposito (Que recibe el cliente)</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <input placeholder="Banco" onChange={e => setFormContent({ ...formContent, instructions: { ...formContent.instructions, banco: e.target.value } })} />
                                                <input placeholder="Cuenta" onChange={e => setFormContent({ ...formContent, instructions: { ...formContent.instructions, cuenta: e.target.value } })} />
                                                <input placeholder="Routing" onChange={e => setFormContent({ ...formContent, instructions: { ...formContent.instructions, routing: e.target.value } })} />
                                                <input placeholder="Red / Address" onChange={e => setFormContent({ ...formContent, instructions: { ...formContent.instructions, network_address: e.target.value } })} />
                                            </div>
                                        </div>

                                        <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                            <h4 style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Datos de Destino Final</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <input placeholder="Billetera Destino" onChange={e => setFormContent({ ...formContent, metadata: { ...formContent.metadata, destination_wallet: e.target.value } })} />
                                                <input placeholder="Moneda Destino" onChange={e => setFormContent({ ...formContent, metadata: { ...formContent.metadata, destination_currency: e.target.value } })} />
                                                <input placeholder="Red Destino" onChange={e => setFormContent({ ...formContent, metadata: { ...formContent.metadata, destination_network: e.target.value } })} />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {activeTab === 'transfers' && (
                                    <>
                                        <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                            <label>Buscar Cliente (Email)</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    placeholder="Email o ID del cliente..."
                                                    value={userSearchTerm}
                                                    onChange={e => setUserSearchTerm(e.target.value)}
                                                />
                                                {userSearchTerm && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border)', borderRadius: '8px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                                        {allProfiles.filter(p => p.email?.toLowerCase().includes(userSearchTerm.toLowerCase())).map(p => (
                                                            <div
                                                                key={p.id}
                                                                style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                                                onClick={() => {
                                                                    setFormContent({ ...formContent, user_id: p.id })
                                                                    setUserSearchTerm(p.email)
                                                                }}
                                                            >
                                                                {p.email} ({p.full_name})
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="input-group">
                                            <label>Monto</label>
                                            <input type="number" placeholder="0.00" onChange={e => setFormContent({ ...formContent, amount: Number(e.target.value) })} />
                                        </div>
                                        <div className="input-group">
                                            <label>Moneda</label>
                                            <input placeholder="USDT, USDC, USD..." onChange={e => setFormContent({ ...formContent, currency: e.target.value })} />
                                        </div>
                                        <div className="input-group">
                                            <label>ID de Transferencia Externa</label>
                                            <input placeholder="TXID o Referencia..." onChange={e => setFormContent({ ...formContent, bridge_transfer_id: e.target.value })} />
                                        </div>
                                    </>
                                )}
                                {/* Otros formularios para Transfers se pueden expandir aquí */}
                            </div>
                            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                                <button onClick={() => setIsCreatingManual(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                                <button onClick={handleSaveManual} className="btn-primary" style={{ flex: 1 }}>Crear Registro Documental</button>
                            </div>
                        </div>
                    ) : activeTab === 'config' ? (
                        <div className="premium-card">
                            <h3 style={{ marginBottom: '1.5rem' }}>Configuración Global de Fees</h3>
                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                {fees.map(f => (
                                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--primary)' }}>{String(f.type || 'Fee').replace(/_/g, ' ')}</div>
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

                            <h3 style={{ marginTop: '3rem', marginBottom: '1.5rem' }}>Ajustes de Plataforma</h3>
                            <div className="premium-card" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h4 style={{ margin: 0, color: '#0369A1' }}>QR Global de Recepción (Bolivia)</h4>
                                        <p style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: '#0C4A6E' }}>
                                            Este QR se mostrará a todos los clientes que elijan "Recibir en Bolivia".
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {platformSettings.find(s => s.key === 'bolivia_reception_qr_url')?.value ? (
                                            <div style={{ marginBottom: '1rem' }}>
                                                <img
                                                    src={platformSettings.find(s => s.key === 'bolivia_reception_qr_url')?.value}
                                                    alt="Bolivia QR"
                                                    style={{ width: '100px', height: '100px', objectFit: 'contain', border: '1px solid #BAE6FD', borderRadius: '8px', background: '#fff' }}
                                                />
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: '0.75rem', color: '#0C4A6E', fontStyle: 'italic' }}>No se ha subido ningún QR.</p>
                                        )}
                                        <button
                                            onClick={() => document.getElementById('global_qr_upload')?.click()}
                                            disabled={uploadingQr}
                                            className="btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem' }}
                                        >
                                            <Upload size={16} /> {uploadingQr ? 'Subiendo...' : 'Cambiar QR'}
                                        </button>
                                        <input
                                            id="global_qr_upload"
                                            type="file"
                                            style={{ display: 'none' }}
                                            accept="image/*"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                setUploadingQr(true)
                                                try {
                                                    const fileName = `global_bolivia_qr_${Date.now()}.${file.name.split('.').pop()}`
                                                    const { error: uploadError } = await supabase.storage.from('platform_assets').upload(fileName, file)
                                                    if (uploadError) throw uploadError

                                                    const { data: { publicUrl } } = supabase.storage.from('platform_assets').getPublicUrl(fileName)

                                                    const { error: updateError } = await supabase
                                                        .from('app_settings')
                                                        .upsert({ key: 'bolivia_reception_qr_url', value: publicUrl, updated_at: new Date().toISOString() })

                                                    if (updateError) throw updateError

                                                    const { data: settingsData } = await supabase.from('app_settings').select('*')
                                                    if (settingsData) setPlatformSettings(settingsData)
                                                    alert('QR actualizado con éxito.')
                                                } catch (err: any) {
                                                    alert('Error al subir: ' + err.message)
                                                } finally {
                                                    setUploadingQr(false)
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
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
                                                    <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>{item.profiles?.email || 'Sistema'}</p>
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(item.created_at).toLocaleDateString()}</p>
                                                        {item.metadata?.creation_type === 'manual' && (
                                                            <span style={{ fontSize: '10px', background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>MANUAL</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {activeTab === 'orders'
                                                            ? `${translateOrderType(item.order_type)} [${String(item.processing_rail || "").split('_')[0].toUpperCase()}]`
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
                                                    <span style={{ color: 'var(--text-muted)' }}>{String(key || "").replace(/_/g, ' ')}:</span>
                                                    <span style={{ fontWeight: 500 }}>{String(val)}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        {['id_front', 'id_back', 'selfie', 'proof_of_address', 'company_cert'].map(doc => selectedItem.data?.[doc] && (
                                            <button key={doc} onClick={() => handleViewDoc(selectedItem.data[doc])} className="btn-secondary" style={{ fontSize: '0.7rem' }}>
                                                Ver {String(doc || "").replace(/_/g, ' ')}
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

                                        <h4 style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Datos de Destino y Red</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                            <div className="input-group">
                                                <label style={{ fontSize: '0.7rem' }}>Billetera Destino</label>
                                                <input
                                                    placeholder="Billetera"
                                                    defaultValue={selectedItem.metadata?.destination_wallet || selectedItem.metadata?.destination_address}
                                                    onChange={e => {
                                                        const newMeta = { ...selectedItem.metadata, destination_wallet: e.target.value };
                                                        if (isEditingMaterial) setFormContent({ ...formContent, metadata: newMeta });
                                                        else selectedItem.metadata = newMeta;
                                                    }}
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label style={{ fontSize: '0.7rem' }}>Moneda Destino</label>
                                                <input
                                                    placeholder="Moneda"
                                                    defaultValue={selectedItem.metadata?.destination_currency || selectedItem.metadata?.stablecoin}
                                                    onChange={e => {
                                                        const newMeta = { ...selectedItem.metadata, destination_currency: e.target.value };
                                                        if (isEditingMaterial) setFormContent({ ...formContent, metadata: newMeta });
                                                        else selectedItem.metadata = newMeta;
                                                    }}
                                                />
                                            </div>
                                            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                                <label style={{ fontSize: '0.7rem' }}>Red Destino</label>
                                                <input
                                                    placeholder="Red"
                                                    defaultValue={selectedItem.metadata?.destination_network || selectedItem.metadata?.network}
                                                    onChange={e => {
                                                        const newMeta = { ...selectedItem.metadata, destination_network: e.target.value };
                                                        if (isEditingMaterial) setFormContent({ ...formContent, metadata: newMeta });
                                                        else selectedItem.metadata = newMeta;
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="input-group">
                                            <label style={{ fontSize: '0.7rem' }}>Comisión (%) - Deja vacío para usar global</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                placeholder="Ej: 1.5"
                                                defaultValue={selectedItem.fee_percentage}
                                                onChange={e => {
                                                    const val = e.target.value === '' ? null : Number(e.target.value);
                                                    if (isEditingMaterial) setFormContent({ ...formContent, fee_percentage: val });
                                                    else setSelectedItem({ ...selectedItem, fee_percentage: val });
                                                }}
                                            />
                                        </div>

                                        <h4 style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>Configurar Instrucciones Bancarias</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {(selectedItem.type === 'ACH_to_crypto' || formContent.type === 'ACH_to_crypto') && (
                                                <>
                                                    <div className="input-group">
                                                        <label style={{ fontSize: '0.7rem' }}>Banco</label>
                                                        <input
                                                            placeholder="Banco"
                                                            defaultValue={selectedItem.instructions?.banco}
                                                            onChange={e => {
                                                                const newInstr = { ...(isEditingMaterial ? formContent.instructions : selectedItem.instructions), banco: e.target.value };
                                                                if (isEditingMaterial) setFormContent({ ...formContent, instructions: newInstr });
                                                                else selectedItem.instructions = newInstr;
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="input-group">
                                                        <label style={{ fontSize: '0.7rem' }}>Cuenta</label>
                                                        <input
                                                            placeholder="Cuenta"
                                                            defaultValue={selectedItem.instructions?.cuenta}
                                                            onChange={e => {
                                                                const newInstr = { ...(isEditingMaterial ? formContent.instructions : selectedItem.instructions), cuenta: e.target.value };
                                                                if (isEditingMaterial) setFormContent({ ...formContent, instructions: newInstr });
                                                                else selectedItem.instructions = newInstr;
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="input-group">
                                                        <label style={{ fontSize: '0.7rem' }}>Routing / ABA</label>
                                                        <input
                                                            placeholder="Routing"
                                                            defaultValue={selectedItem.instructions?.routing}
                                                            onChange={e => {
                                                                const newInstr = { ...(isEditingMaterial ? formContent.instructions : selectedItem.instructions), routing: e.target.value };
                                                                if (isEditingMaterial) setFormContent({ ...formContent, instructions: newInstr });
                                                                else selectedItem.instructions = newInstr;
                                                            }}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            {(selectedItem.type === 'crypto_to_crypto' || selectedItem.type === 'incoming_transfer' || !['ACH_to_crypto'].includes(selectedItem.type)) && (
                                                <>
                                                    <div className="input-group">
                                                        <label style={{ fontSize: '0.7rem' }}>Red / Instrucción</label>
                                                        <input
                                                            placeholder="Red / Instrucción"
                                                            defaultValue={selectedItem.instructions?.network || selectedItem.instructions?.network_address}
                                                            onChange={e => {
                                                                const newInstr = { ...(isEditingMaterial ? formContent.instructions : selectedItem.instructions), network_address: e.target.value };
                                                                if (isEditingMaterial) setFormContent({ ...formContent, instructions: newInstr });
                                                                else selectedItem.instructions = newInstr;
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="input-group">
                                                        <label style={{ fontSize: '0.7rem' }}>Address / Info Adicional</label>
                                                        <input
                                                            placeholder="Address / Info Adicional"
                                                            defaultValue={selectedItem.instructions?.address}
                                                            onChange={e => {
                                                                const newInstr = { ...(isEditingMaterial ? formContent.instructions : selectedItem.instructions), address: e.target.value };
                                                                if (isEditingMaterial) setFormContent({ ...formContent, instructions: newInstr });
                                                                else selectedItem.instructions = newInstr;
                                                            }}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                                        {isEditingMaterial ? (
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => setIsEditingMaterial(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                                                <button
                                                    onClick={() => {
                                                        setPendingAction({ type: 'edit' })
                                                        setShowReasonModal(true)
                                                    }}
                                                    className="btn-primary"
                                                    style={{ flex: 1 }}
                                                >
                                                    Guardar Cambios
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleUpdateStatus(selectedItem.id, 'payin_routes', 'active', {
                                                        instructions: selectedItem.instructions || {},
                                                        fee_percentage: selectedItem.fee_percentage
                                                    })}
                                                    className="btn-primary"
                                                    style={{ flex: 1 }}
                                                >
                                                    {selectedItem.status === 'active' ? 'Actualizar Instrucciones' : 'Activar con estos Datos'}
                                                </button>
                                                {userRole === 'admin' && (
                                                    <button
                                                        onClick={() => {
                                                            setIsEditingMaterial(true)
                                                            setFormContent(selectedItem)
                                                        }}
                                                        className="btn-secondary"
                                                    >
                                                        Editar
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <h4 style={{ margin: 0 }}>Datos de la Órden</h4>
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                {selectedItem.metadata?.creation_type === 'manual' && (
                                                    <span style={{ fontSize: '10px', background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>MANUAL</span>
                                                )}
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {selectedItem.id.split('-')[0]}</span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div className="input-group">
                                                <label style={{ fontSize: '0.7rem' }}>Tipo de Orden</label>
                                                <select
                                                    disabled={!isEditingMaterial || (['deposit_received', 'processing', 'completed'].includes(selectedItem.status) && userRole !== 'admin')}
                                                    value={formContent.order_type || selectedItem.order_type}
                                                    onChange={e => setFormContent({ ...formContent, order_type: e.target.value })}
                                                >
                                                    <option value="BO_TO_WORLD">Pagar al Exterior</option>
                                                    <option value="WORLD_TO_BO">Recibir en Bolivia</option>
                                                    <option value="US_TO_WALLET">Recibir desde EE.UU.</option>
                                                    <option value="CRYPTO_TO_CRYPTO">Enviar Cripto</option>
                                                </select>
                                            </div>
                                            <div className="input-group">
                                                <label style={{ fontSize: '0.7rem' }}>Riel</label>
                                                <select
                                                    disabled={!isEditingMaterial || (['deposit_received', 'processing', 'completed'].includes(selectedItem.status) && userRole !== 'admin')}
                                                    value={formContent.processing_rail || selectedItem.processing_rail}
                                                    onChange={e => setFormContent({ ...formContent, processing_rail: e.target.value })}
                                                >
                                                    <option value="PSAV">PSAV</option>
                                                    <option value="SWIFT">SWIFT</option>
                                                    <option value="ACH">ACH</option>
                                                    <option value="DIGITAL_NETWORK">Digital</option>
                                                </select>
                                            </div>
                                            <div className="input-group">
                                                <label style={{ fontSize: '0.7rem' }}>Monto Origen</label>
                                                <input
                                                    type="number"
                                                    disabled={!isEditingMaterial || (['deposit_received', 'processing', 'completed'].includes(selectedItem.status) && userRole !== 'admin')}
                                                    defaultValue={selectedItem.amount_origin}
                                                    onChange={e => setFormContent({ ...formContent, amount_origin: Number(e.target.value) })}
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label style={{ fontSize: '0.7rem' }}>Moneda</label>
                                                <input
                                                    disabled={!isEditingMaterial || (['deposit_received', 'processing', 'completed'].includes(selectedItem.status) && userRole !== 'admin')}
                                                    defaultValue={selectedItem.origin_currency}
                                                    onChange={e => setFormContent({ ...formContent, origin_currency: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {isEditingMaterial && (
                                            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
                                                <button onClick={() => setIsEditingMaterial(false)} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                                                <button
                                                    onClick={() => {
                                                        setPendingAction({ type: 'edit' })
                                                        setShowReasonModal(true)
                                                    }}
                                                    className="btn-primary"
                                                    style={{ flex: 1 }}
                                                >
                                                    Guardar Cambios
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tipo:</span>
                                            <span style={{ fontWeight: 700 }}>{translateOrderType(selectedItem.order_type)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monto:</span>
                                            <span style={{ fontWeight: 800 }}>{selectedItem.amount_origin} {selectedItem.currency || selectedItem.origin_currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Rail:</span>
                                            <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{String(selectedItem.processing_rail || "").replace(/_/g, ' ')}</span>
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
                                        {userRole === 'admin' && (
                                            <button
                                                onClick={() => {
                                                    setIsEditingMaterial(true)
                                                    setFormContent(selectedItem)
                                                }}
                                                className="btn-secondary"
                                                style={{ width: '100%', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                            >
                                                <Save size={14} /> Corrección Administrativa
                                            </button>
                                        )}

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
                                                        paymentReason: selectedItem.metadata?.payment_reason,
                                                        isManual: selectedItem.metadata?.creation_type === 'manual'
                                                    })}
                                                    className="btn-secondary"
                                                    style={{ width: '100%', marginTop: '1rem', gap: '0.5rem' }}
                                                >
                                                    <FileDown size={14} /> Descargar Comprobante PDF
                                                </button>
                                            </div>
                                        )}

                                        {selectedItem.status !== 'completed' && (
                                            <button onClick={() => {
                                                setPendingAction({ id: selectedItem.id, table: 'payment_orders', status: 'failed', type: 'status' })
                                                setShowReasonModal(true)
                                            }} className="btn-secondary" style={{ width: '100%', marginTop: '1rem', color: 'var(--error)' }}>Marcar como Fallida / Anular</button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {showReasonModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: '#fff', padding: '2rem', borderRadius: '16px', maxWidth: '450px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--primary)' }}>
                            <AlertTriangle size={24} />
                            <h3 style={{ margin: 0 }}>Motivo de la Modificación</h3>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            De acuerdo a las políticas de Guira, toda modificación manual debe ser debidamente justificada para fines de auditoría.
                        </p>
                        <textarea
                            placeholder="Describa el motivo del cambio (mín. 5 caracteres)..."
                            value={modificationReason}
                            onChange={(e) => setModificationReason(e.target.value)}
                            style={{ width: '100%', minHeight: '100px', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem', fontSize: '1rem' }}
                        />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => {
                                    setShowReasonModal(false)
                                    setModificationReason('')
                                    setPendingAction(null)
                                }}
                                className="btn-secondary"
                                style={{ flex: 1 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    if (pendingAction.type === 'status') {
                                        handleUpdateStatus(pendingAction.id, pendingAction.table, pendingAction.status, pendingAction.additionalData, modificationReason)
                                    } else {
                                        handleSaveManual()
                                    }
                                }}
                                disabled={modificationReason.trim().length < 5}
                                className="btn-primary"
                                style={{ flex: 1 }}
                            >
                                Confirmar Cambio
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    )
}
