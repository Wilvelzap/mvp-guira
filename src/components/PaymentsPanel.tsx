import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, Globe, Upload, ChevronLeft, ShieldCheck } from 'lucide-react'
import { getFeeConfig, calculateFee } from '../lib/fees'
import { generatePaymentPDF } from '../lib/pdf'
import { createPaymentOrder, uploadOrderEvidence } from '../lib/orders'
import type { ProcessingRail, OrderType } from '../lib/orders'

// Triggering fresh build on Vercel to resolve synchronization issues.
type PaymentRoute = 'bolivia_to_exterior' | 'us_to_wallet' | 'crypto_to_crypto' | 'us_to_bolivia' | 'bank_to_crypto' | 'crypto_to_bank'

export const PaymentsPanel: React.FC<{ initialRoute?: any; onRouteClear?: () => void }> = ({ initialRoute, onRouteClear }) => {
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState<'payin' | 'payout'>('payin')
    const [payinRoutes, setPayinRoutes] = useState<any[]>([])
    const [bridgeTransfers, setBridgeTransfers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Unified Flow states
    const [selectedRoute, setSelectedRoute] = useState<null | PaymentRoute>(null)
    const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
    const [waitingForEvidence, setWaitingForEvidence] = useState(false)
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null)
    const [isManagingSuppliers, setIsManagingSuppliers] = useState(false)
    const [isCreatingSupplier, setIsCreatingSupplier] = useState(false)
    const [newSupplier, setNewSupplier] = useState({ name: '', bank_name: '', swift_code: '', account_number: '', crypto_address: '', bank_country: '', address: '' })
    const [operationType, setOperationType] = useState<null | 'receive' | 'send'>(null)

    // Core Transaction Data
    const [amount, setAmount] = useState('')
    const currency = 'USDC'
    const [destinationId, setDestinationId] = useState('')
    const [clientCryptoAddress, setClientCryptoAddress] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [feeConfig, setFeeConfig] = useState<any>(null)

    // Supplier Agenda states
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null)

    // Bolivia Specific
    const [amountBs, setAmountBs] = useState('')
    const [exchangeRateBs, setExchangeRateBs] = useState(10.5)
    const [qrUrl, setQrUrl] = useState<string | null>(null)
    const [calcCurrency, setCalcCurrency] = useState<'bs' | 'usdt'>('usdt')
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

    // Step-by-Step "Pagar al exterior" and "Recibir en Bolivia" states
    const [fundingMethod, setFundingMethod] = useState<'bs' | 'crypto' | 'ach' | 'wallet'>('bs')
    const [deliveryMethod, setDeliveryMethod] = useState<'swift' | 'ach' | 'crypto'>('swift')
    const [paymentReason, setPaymentReason] = useState('')
    const [supportDocument, setSupportDocument] = useState<File | null>(null)

    // Dynamic Destination Details
    const [achDetails, setAchDetails] = useState({ routingNumber: '', accountNumber: '', bankName: '' })
    const [swiftDetails, setSwiftDetails] = useState({
        bankName: '',
        swiftCode: '',
        iban: '',
        bankAddress: '',
        country: ''
    })
    const [cryptoDestination, setCryptoDestination] = useState({ address: '', network: 'ethereum' })

    // Handle deep links from dashboard
    useEffect(() => {
        if (initialRoute) {
            setSelectedRoute(initialRoute)
            setStep(2)
            onRouteClear?.()
        }
    }, [initialRoute])

    useEffect(() => {
        if (user) {
            fetchPaymentsData()
        }
    }, [user])




    useEffect(() => {
        fetchPaymentsData()
    }, [user])

    const calculatedFeeValue = feeConfig && amount ? calculateFee(Number(amount), feeConfig) : 0
    const netAmountValue = amount ? Number(amount) - calculatedFeeValue : 0

    const fetchPaymentsData = async () => {
        if (!user) return
        setLoading(true)

        const [routes, transfers, suppliersRes, feeRes, orders, settings] = await Promise.all([
            supabase.from('payin_routes').select('*').eq('user_id', user.id),
            supabase.from('bridge_transfers').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('suppliers').select('*').eq('user_id', user.id),
            getFeeConfig('supplier_payment'),
            supabase.from('payment_orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('app_settings').select('*')
        ])

        if (routes.data) setPayinRoutes(routes.data)

        // Merge bridge_transfers and payment_orders for history
        const allHistory = [
            ...(transfers.data || []),
            ...(orders.data || []).map(o => ({
                id: o.id,
                created_at: o.created_at,
                amount: o.amount_origin,
                currency: o.origin_currency,
                status: o.status,
                transfer_kind: o.order_type,
                business_purpose: 'supplier_payment',
                metadata: o.metadata,
                fee_amount: o.fee_total,
                net_amount: o.amount_converted,
                exchange_rate: o.exchange_rate_applied,
                support_document_url: o.support_document_url,
                evidence_url: o.evidence_url,
                is_payment_order: true
            }))
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        if (allHistory) setBridgeTransfers(allHistory as any)
        if (suppliersRes.data) setSuppliers(suppliersRes.data)
        if (feeRes) setFeeConfig(feeRes)

        const rateSetting = settings.data?.find(s => s.key === 'bolivia_exchange_rate');
        if (rateSetting) setExchangeRateBs(Number(rateSetting.value));
        const qrSetting = settings.data?.find(s => s.key === 'bolivia_reception_qr_url');
        if (qrSetting) setQrUrl(qrSetting.value);

        setLoading(false)
    }


    const resetFlow = () => {
        setSelectedRoute(null)
        setStep(1)
        setAmount('')
        setAmountBs('')
        setDestinationId('')
        setClientCryptoAddress('')
        setError(null)
        setWaitingForEvidence(false)
        setEvidenceFile(null)
        setIsManagingSuppliers(false)
        setIsCreatingSupplier(false)
        setNewSupplier({ name: '', bank_name: '', swift_code: '', account_number: '', crypto_address: '', bank_country: '', address: '' })
        // Reset new fields
        setFundingMethod('bs')
        setDeliveryMethod('swift')
        setPaymentReason('')
        setSupportDocument(null)
        setAchDetails({ routingNumber: '', accountNumber: '', bankName: '' })
        setSwiftDetails({ bankName: '', swiftCode: '', iban: '', bankAddress: '', country: '' })
        setCryptoDestination({ address: '', network: 'ethereum' })
        setOperationType(null)
    }

    const handleUploadEvidence = async () => {
        if (!currentOrderId || !evidenceFile) return
        setLoading(true)
        try {
            await uploadOrderEvidence(currentOrderId, evidenceFile, 'evidence_url')
            setWaitingForEvidence(false)
            fetchPaymentsData()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleExecuteOperation = async () => {
        if (!user) return
        setLoading(true)
        setError(null)

        try {
            // 1. Determine Rail & OrderType
            let orderType: OrderType = 'BO_TO_WORLD'
            let finalRail: ProcessingRail = 'PSAV'

            if (selectedRoute === 'bolivia_to_exterior') {
                orderType = 'BO_TO_WORLD'
                finalRail = fundingMethod === 'bs' ? 'PSAV' : 'DIGITAL_NETWORK'
            } else if (selectedRoute === 'us_to_bolivia') {
                orderType = 'WORLD_TO_BO'
                if (fundingMethod === 'crypto' || fundingMethod === 'wallet') finalRail = 'DIGITAL_NETWORK'
                else if (fundingMethod === 'ach') finalRail = 'ACH'
                else finalRail = 'PSAV'
            } else if (selectedRoute === 'us_to_wallet') {
                orderType = 'US_TO_WALLET'
                finalRail = 'ACH'
            } else if (selectedRoute === 'crypto_to_crypto') {
                orderType = 'CRYPTO_TO_CRYPTO'
                finalRail = 'DIGITAL_NETWORK'
            }

            // 2. Prepare Metadata
            const metadata: any = {
                delivery_method: deliveryMethod,
                payment_reason: paymentReason,
                intended_amount: amount ? Number(amount) : null,
                destination_address: clientCryptoAddress || destinationId || cryptoDestination.address,
                stablecoin: currency
            }

            if (selectedRoute === 'bolivia_to_exterior' || selectedRoute === 'us_to_bolivia') {
                metadata.funding_method = fundingMethod
                metadata.delivery_method = deliveryMethod
                if (deliveryMethod === 'swift') metadata.swift_details = swiftDetails
                if (deliveryMethod === 'ach') metadata.ach_details = achDetails
                if (deliveryMethod === 'crypto') metadata.crypto_destination = cryptoDestination
            }

            // 3. Create standard PaymentOrder (Order First)
            const { data: order, error: orderErr } = await createPaymentOrder({
                userId: user.id,
                orderType,
                rail: finalRail,
                amountOrigin: Number(selectedRoute === 'bolivia_to_exterior' && fundingMethod === 'bs' ? amountBs : (amount || 0)),
                originCurrency: (selectedRoute === 'bolivia_to_exterior' && fundingMethod === 'bs') ? 'Bs' : currency,
                destinationCurrency: (selectedRoute === 'us_to_bolivia') ? 'Bs' : (selectedRoute === 'bolivia_to_exterior' ? 'USDT' : currency),
                beneficiaryId: null,
                supplierId: selectedSupplier?.id || null,
                amountConverted: Number(amount),
                exchangeRate: (selectedRoute === 'bolivia_to_exterior' || selectedRoute === 'us_to_bolivia') ? exchangeRateBs : 1,
                feeTotal: calculatedFeeValue,
                metadata
            })

            if (orderErr) throw orderErr
            setCurrentOrderId(order.id)

            // 4. Upload Supporting Document (Factura/Proforma) if present
            if (supportDocument) {
                await uploadOrderEvidence(order.id, supportDocument, 'support_document_url')
            }

            // 5. Post-Creation Logic
            if (selectedRoute === 'bolivia_to_exterior') {
                // Show instructions based on funding method
                setWaitingForEvidence(true)
                setStep(4)
                // If crypto funding, status is waiting_deposit too (waiting for hash)
                await supabase.from('payment_orders').update({ status: 'waiting_deposit' }).eq('id', order.id)
            } else if (selectedRoute === 'us_to_bolivia') {
                setWaitingForEvidence(true)
                setStep(4)
                await supabase.from('payment_orders').update({ status: 'waiting_deposit' }).eq('id', order.id)
            } else {
                setStep(4)
                // Auto-complete or advance other automated flows
                await supabase.from('payment_orders').update({ status: 'completed' }).eq('id', order.id)
                // Removed immediate resetFlow to show Step 4 Success.
            }

            fetchPaymentsData()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const translateStatus = (status: string) => {
        const statuses: any = {
            'submitted': 'Solicitado',
            'active': 'Activo',
            'paid': 'Completado',
            'pending': 'Pendiente',
            'rejected': 'Rechazado'
        }
        return statuses[status] || status
    }

    const translateType = (type: string) => {
        const types: any = {
            'ACH_to_crypto': 'Banco (EE.UU.) a Billetera',
            'crypto_to_crypto': 'Cripto a Cripto',
            'bolivia_to_exterior': 'Pagar al Exterior',
            'us_to_bolivia': 'Recibir en Bolivia',
            'us_to_wallet': 'Recibir desde EE.UU.',
            'incoming_transfer': 'Depósito USDT'
        }
        return types[type] || (type ? String(type).replace(/_/g, ' ') : 'Tipo')
    }

    const StepHeader = () => {
        const steps = [
            { id: 1, label: 'Ruta' },
            { id: 2, label: 'Detalles' },
            { id: 3, label: 'Revisión' },
            { id: 4, label: 'Finalización' }
        ]

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem', background: '#fff', padding: '1rem 1.5rem', borderRadius: '16px', border: '1px solid var(--border)', overflowX: 'auto' }}>
                {steps.map((s, idx) => (
                    <React.Fragment key={s.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: step >= s.id ? 1 : 0.4, flexShrink: 0 }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: step === s.id ? 'var(--secondary)' : (step > s.id ? 'var(--success)' : 'var(--bg-main)'),
                                color: step === s.id || step > s.id ? '#fff' : 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                border: step < s.id ? '1px solid var(--border)' : 'none'
                            }}>
                                {step > s.id ? '✓' : s.id}
                            </div>
                            <span style={{ fontSize: '0.875rem', fontWeight: step === s.id ? 700 : 500, color: step === s.id ? 'var(--text-main)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {s.label}
                            </span>
                        </div>
                        {idx < steps.length - 1 && (
                            <div style={{ height: '1px', background: 'var(--border)', minWidth: '1rem', flex: 1, opacity: 0.5 }} />
                        )}
                    </React.Fragment>
                ))}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Pagos</h1>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        {showAdvanced ? 'Ocultar detalles técnicos' : 'Ver detalles técnicos'}
                    </button>

                    <div style={{ background: '#E2E8F0', padding: '4px', borderRadius: '12px', display: 'flex', gap: '4px' }}>
                        <button
                            onClick={() => { setActiveTab('payin'); setIsManagingSuppliers(false); setSelectedRoute(null); }}
                            style={{
                                padding: '0.5rem 1.25rem',
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                background: activeTab === 'payin' && !isManagingSuppliers ? '#fff' : 'transparent',
                                boxShadow: activeTab === 'payin' && !isManagingSuppliers ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                color: activeTab === 'payin' && !isManagingSuppliers ? 'var(--secondary)' : 'var(--text-muted)'
                            }}
                        >
                            Mis Instrucciones
                        </button>
                        <button
                            onClick={() => { resetFlow(); setIsManagingSuppliers(true); }}
                            style={{
                                padding: '0.5rem 1.25rem',
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                background: isManagingSuppliers ? '#fff' : 'transparent',
                                boxShadow: isManagingSuppliers ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                color: isManagingSuppliers ? 'var(--secondary)' : 'var(--text-muted)'
                            }}
                        >
                            Proveedores
                        </button>
                        <button
                            onClick={() => { resetFlow(); setActiveTab('payout'); setIsManagingSuppliers(false); }}
                            style={{
                                padding: '0.5rem 1.25rem',
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                background: activeTab === 'payout' && !isManagingSuppliers ? '#fff' : 'transparent',
                                boxShadow: activeTab === 'payout' && !isManagingSuppliers ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                color: activeTab === 'payout' && !isManagingSuppliers ? 'var(--secondary)' : 'var(--text-muted)'
                            }}
                        >
                            Historial
                        </button>
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {isManagingSuppliers ? (
                    <motion.div key="suppliers" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="premium-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button
                                    onClick={() => setIsManagingSuppliers(false)}
                                    style={{ background: '#F1F5F9', border: 'none', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer' }}
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <h3 style={{ margin: 0, fontWeight: 700 }}>Agenda de Proveedores</h3>
                            </div>
                            <button onClick={() => setIsCreatingSupplier(true)} className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}>+ Nuevo Proveedor</button>
                        </div>

                        {isCreatingSupplier && (
                            <div style={{ background: '#F8FAFC', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                                <h4 style={{ marginTop: 0 }}>Nuevo Proveedor</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="input-group">
                                        <label>Nombre / Razón Social</label>
                                        <input value={newSupplier.name} onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label>País del Banco</label>
                                        <select
                                            value={newSupplier.bank_country}
                                            onChange={e => setNewSupplier({ ...newSupplier, bank_country: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem' }}
                                        >
                                            <option value="">-- Seleccionar País --</option>
                                            <option value="Estados Unidos">Estados Unidos</option>
                                            <option value="China">China</option>
                                            <option value="Hong Kong">Hong Kong</option>
                                            <option value="España">España</option>
                                            <option value="Bolivia">Bolivia</option>
                                            <option value="Reino Unido">Reino Unido</option>
                                            <option value="Panamá">Panamá</option>
                                            <option value="Otro">Otro</option>
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Nombre del Banco</label>
                                        <input value={newSupplier.bank_name} onChange={e => setNewSupplier({ ...newSupplier, bank_name: e.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label>
                                            {newSupplier.bank_country === 'Estados Unidos' ? 'Routing Number' : 'SWIFT / BIC Code'}
                                        </label>
                                        <input value={newSupplier.swift_code} onChange={e => setNewSupplier({ ...newSupplier, swift_code: e.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label>
                                            {newSupplier.bank_country === 'Estados Unidos' ? 'Account Number' : ['España', 'Reino Unido'].includes(newSupplier.bank_country) ? 'IBAN' : 'Número de Cuenta'}
                                        </label>
                                        <input value={newSupplier.account_number} onChange={e => setNewSupplier({ ...newSupplier, account_number: e.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label>Dirección Cripto (opcional)</label>
                                        <input value={newSupplier.crypto_address} onChange={e => setNewSupplier({ ...newSupplier, crypto_address: e.target.value })} />
                                    </div>
                                    <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>Dirección Física del Proveedor (OBLIGATORIA para SWIFT)</label>
                                        <input value={newSupplier.address} onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value })} placeholder="Calle, Ciudad, Estado, Código Postal" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                    <button
                                        onClick={async () => {
                                            if (!user || !newSupplier.name) return alert('Nombre es obligatorio');
                                            setLoading(true);
                                            const payload = {
                                                user_id: user.id,
                                                name: newSupplier.name,
                                                country: newSupplier.bank_country,
                                                payment_method: newSupplier.crypto_address ? 'crypto' : 'bank',
                                                bank_details: {
                                                    bank_name: newSupplier.bank_name,
                                                    swift_code: newSupplier.swift_code,
                                                    account_number: newSupplier.account_number,
                                                    bank_country: newSupplier.bank_country
                                                },
                                                crypto_details: {
                                                    address: newSupplier.crypto_address
                                                },
                                                address: newSupplier.address
                                            };
                                            const { error } = await supabase.from('suppliers').insert([payload]);
                                            if (error) alert(error.message);
                                            else {
                                                setIsCreatingSupplier(false);
                                                setNewSupplier({ name: '', bank_name: '', swift_code: '', account_number: '', crypto_address: '', bank_country: '', address: '' });
                                                fetchPaymentsData();
                                            }
                                            setLoading(false);
                                        }}
                                        className="btn-primary"
                                        disabled={loading}
                                    >
                                        {loading ? 'Guardando...' : 'Crear Proveedor'}
                                    </button>
                                    <button onClick={() => setIsCreatingSupplier(false)} className="btn-secondary">Cancelar</button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                            {suppliers.map(s => (
                                <div key={s.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '12px', background: '#fff' }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{s.name}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {s.bank_details?.bank_name} • {s.country}<br />
                                        {s.bank_details?.account_number || s.crypto_details?.address}<br />
                                        {s.address && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{s.address}</span>}
                                    </div>
                                </div>
                            ))}
                            {suppliers.length === 0 && !isCreatingSupplier && <div style={{ gridColumn: '1/-1', textAlign: 'center', opacity: 0.5, padding: '2rem' }}>No tienes proveedores registrados.</div>}
                        </div>
                    </motion.div>
                ) : selectedRoute === null ? (
                    <motion.div key="selector" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontWeight: 700 }}>
                                {operationType === null && 'Selecciona el tipo de operación'}
                                {operationType === 'receive' && 'Recibir pagos'}
                                {operationType === 'send' && 'Enviar pagos'}
                            </h3>
                            {operationType !== null && (
                                <button
                                    onClick={() => setOperationType(null)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                    <ChevronLeft size={16} /> Volver
                                </button>
                            )}
                        </div>

                        {operationType === null ? (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                                gap: '1.5rem'
                            }}>
                                <div
                                    onClick={() => setOperationType('receive')}
                                    className="premium-card clickable-card"
                                    style={{
                                        cursor: 'pointer',
                                        padding: '2.5rem',
                                        textAlign: 'center',
                                        background: '#ffffff',
                                        border: '1px solid #E2E8F0',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '1rem'
                                    }}
                                >
                                    <div style={{ fontSize: '3.5rem' }}>💰</div>
                                    <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Recibir pagos</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                        Crea rutas de llegada vía ACH, Wire o Cripto hacia tu billetera.
                                    </p>
                                </div>

                                <div
                                    onClick={() => setOperationType('send')}
                                    className="premium-card clickable-card"
                                    style={{
                                        cursor: 'pointer',
                                        padding: '2.5rem',
                                        textAlign: 'center',
                                        background: '#ffffff',
                                        border: '1px solid #E2E8F0',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '1rem'
                                    }}
                                >
                                    <div style={{ fontSize: '3.5rem' }}>📤</div>
                                    <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Enviar pagos</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                        Paga facturas o a proveedores vía SWIFT o ACH (USA).
                                    </p>
                                </div>
                            </div>
                        ) : operationType === 'receive' ? (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
                                gap: '1rem'
                            }}>
                                <div
                                    onClick={() => { setSelectedRoute('us_to_wallet'); setFundingMethod('ach'); setStep(2); }}
                                    className="premium-card clickable-card"
                                    style={{ cursor: 'pointer', padding: '1.5rem', textAlign: 'center', background: '#fff', border: '1px solid #E2E8F0' }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🇺🇸</div>
                                    <h4 style={{ margin: 0, fontWeight: 700 }}>Desde ACH/Wire (USA)</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                        Recibe USD en tu billetera como USDC/USDT.
                                    </p>
                                </div>

                                <div
                                    onClick={() => { setSelectedRoute('crypto_to_crypto'); setFundingMethod('crypto'); setStep(2); }}
                                    className="premium-card clickable-card"
                                    style={{ cursor: 'pointer', padding: '1.5rem', textAlign: 'center', background: '#fff', border: '1px solid #E2E8F0' }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔗</div>
                                    <h4 style={{ margin: 0, fontWeight: 700 }}>Desde Cripto</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                        Ingresa fondos directamente en USDC.
                                    </p>
                                </div>

                                <div
                                    onClick={() => { setSelectedRoute('us_to_bolivia'); setFundingMethod('wallet'); setStep(2); }}
                                    className="premium-card clickable-card"
                                    style={{ cursor: 'pointer', padding: '1.5rem', textAlign: 'center', background: '#fff', border: '1px solid #E2E8F0' }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚀</div>
                                    <h4 style={{ margin: 0, fontWeight: 700 }}>Liquidar en Bolivia</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                        Recibe Bs directamente en tu banco.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
                                gap: '1rem'
                            }}>
                                <div
                                    onClick={() => { setSelectedRoute('bolivia_to_exterior'); setFundingMethod('bs'); setStep(2); }}
                                    className="premium-card clickable-card"
                                    style={{ cursor: 'pointer', padding: '1.5rem', textAlign: 'center', background: '#fff', border: '1px solid #E2E8F0' }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🇧🇴</div>
                                    <h4 style={{ margin: 0, fontWeight: 700 }}>Desde Bs (Bolivia)</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                        Envía Bs a cuentas internacionales (SWIFT).
                                    </p>
                                </div>

                                <div
                                    onClick={() => { setSelectedRoute('bolivia_to_exterior'); setFundingMethod('wallet'); setStep(2); }}
                                    className="premium-card clickable-card"
                                    style={{ cursor: 'pointer', padding: '1.5rem', textAlign: 'center', background: '#fff', border: '1px solid #E2E8F0' }}
                                >
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💼</div>
                                    <h4 style={{ margin: 0, fontWeight: 700 }}>Desde Riel Digital</h4>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                        Usa tu volumen en USDC para documentar salida al exterior.
                                    </p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="premium-card" style={{ background: '#F8FAFC' }}>
                        <StepHeader />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                                {selectedRoute === 'bolivia_to_exterior' && 'Nueva Gestión al exterior'}
                                {selectedRoute === 'us_to_wallet' && 'Documentar recepción desde EE.UU.'}
                                {selectedRoute === 'crypto_to_crypto' && 'Documentar envío digital'}
                                {selectedRoute === 'us_to_bolivia' && 'Declarar recepción en Bolivia'}
                            </h4>
                            <button
                                onClick={() => {
                                    if (step > 1) setStep((step - 1) as any)
                                    else resetFlow()
                                }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                                <ChevronLeft size={16} /> Volver {step > 1 ? 'atrás' : ''}
                            </button>
                        </div>

                        {error && (
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {step === 2 && !waitingForEvidence && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {/* Rail Selection & Disclaimer */}
                                    <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                                        <div style={{ background: '#EFF6FF', padding: '1rem', borderRadius: '12px', border: '1px solid #BFDBFE', color: '#1E40AF', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                            💡 <b>Aviso:</b> {selectedRoute === 'bolivia_to_exterior' ? 'Esta gestión se procesa a través de un operador local autorizado (Riel PSAV).' : 'Guira coordina y documenta esta operación.'}
                                        </div>
                                    </div>

                                    {/* Dual-Currency Calculator - Moved here to be always visible in step 2 */}
                                    {selectedRoute === 'bolivia_to_exterior' && (
                                        <div style={{ background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <label style={{ fontWeight: 700, margin: 0 }}>Monto del Pago</label>
                                                <div style={{ display: 'flex', background: '#E2E8F0', borderRadius: '8px', padding: '2px' }}>
                                                    <button
                                                        onClick={() => setCalcCurrency('usdt')}
                                                        style={{
                                                            padding: '4px 12px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            background: calcCurrency === 'usdt' ? '#fff' : 'transparent',
                                                            color: calcCurrency === 'usdt' ? 'var(--primary)' : 'var(--text-muted)',
                                                            border: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        USDT
                                                    </button>
                                                    <button
                                                        onClick={() => setCalcCurrency('bs')}
                                                        style={{
                                                            padding: '4px 12px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            background: calcCurrency === 'bs' ? '#fff' : 'transparent',
                                                            color: calcCurrency === 'bs' ? 'var(--primary)' : 'var(--text-muted)',
                                                            border: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        BS
                                                    </button>
                                                </div>
                                            </div>

                                            {calcCurrency === 'usdt' ? (
                                                <div className="input-group">
                                                    <div style={{ position: 'relative' }}>
                                                        <input
                                                            type="number"
                                                            placeholder="Monto en USDT"
                                                            value={amount}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setAmount(val);
                                                                setAmountBs(val ? (Number(val) * exchangeRateBs).toFixed(2) : '');
                                                            }}
                                                            style={{ fontSize: '1.25rem', fontWeight: 700, paddingRight: '4rem' }}
                                                        />
                                                        <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)' }}>USDT</span>
                                                    </div>
                                                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        ≈ {amountBs || '0.00'} Bs
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="input-group">
                                                    <div style={{ position: 'relative' }}>
                                                        <input
                                                            type="number"
                                                            placeholder="Monto en Bolivianos"
                                                            value={amountBs}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setAmountBs(val);
                                                                setAmount(val ? (Number(val) / exchangeRateBs).toFixed(2) : '');
                                                            }}
                                                            style={{ fontSize: '1.25rem', fontWeight: 700, paddingRight: '3rem' }}
                                                        />
                                                        <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text-muted)' }}>BS</span>
                                                    </div>
                                                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        ≈ {amount || '0.00'} USDT
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#F1F5F9', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tasa Guira:</span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>1 USDT = {exchangeRateBs} Bs</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* BOLIVIA TO EXTERIOR */}
                                    {selectedRoute === 'bolivia_to_exterior' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>¿Con qué pagarás?</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <button onClick={() => setFundingMethod('bs')} style={{ padding: '1.25rem', borderRadius: '12px', border: `2px solid ${fundingMethod === 'bs' ? 'var(--primary)' : 'var(--border)'}`, background: fundingMethod === 'bs' ? '#EFF6FF' : '#fff', cursor: 'pointer' }}>
                                                        <div style={{ fontWeight: 700 }}>Bolivianos (Bs)</div>
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Riel PSAV local</div>
                                                    </button>
                                                    <button onClick={() => setFundingMethod('crypto')} style={{ padding: '1.25rem', borderRadius: '12px', border: `2px solid ${fundingMethod === 'crypto' ? 'var(--primary)' : 'var(--border)'}`, background: fundingMethod === 'crypto' ? '#EFF6FF' : '#fff', cursor: 'pointer' }}>
                                                        <div style={{ fontWeight: 700 }}>USDT / USDC</div>
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Riel Digital</div>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>¿Cómo se enviará al exterior?</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    <button onClick={() => setDeliveryMethod('swift')} className={`btn-secondary ${deliveryMethod === 'swift' ? 'active' : ''}`} style={{ border: `2px solid ${deliveryMethod === 'swift' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff', justifyContent: 'flex-start' }}>🌐 SWIFT / Local (Mundo)</button>
                                                    <button onClick={() => setDeliveryMethod('ach')} className={`btn-secondary ${deliveryMethod === 'ach' ? 'active' : ''}`} style={{ border: `2px solid ${deliveryMethod === 'ach' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff', justifyContent: 'flex-start' }}>🇺🇸 ACH (EE.UU.)</button>
                                                    <button onClick={() => setDeliveryMethod('crypto')} className={`btn-secondary ${deliveryMethod === 'crypto' ? 'active' : ''}`} style={{ border: `2px solid ${deliveryMethod === 'crypto' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff', justifyContent: 'flex-start' }}>⚡ Riel Digital (USDT/USDC)</button>
                                                </div>
                                            </div>

                                            <div className="input-group">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <label style={{ fontWeight: 700, margin: 0 }}>Proveedor / Beneficiario</label>
                                                    <button
                                                        onClick={() => { resetFlow(); setIsManagingSuppliers(true); setIsCreatingSupplier(true); }}
                                                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                                    >
                                                        + Agregar Nuevo
                                                    </button>
                                                </div>
                                                <select
                                                    value={selectedSupplier?.id || ''}
                                                    onChange={e => {
                                                        const s = suppliers.find(sup => sup.id === e.target.value);
                                                        setSelectedSupplier(s);
                                                        if (s) {
                                                            if (s.bank_details) {
                                                                const bRes = {
                                                                    bankName: s.bank_details.bank_name || '',
                                                                    swiftCode: s.bank_details.swift_code || '',
                                                                    iban: s.bank_details.account_number || '',
                                                                    bankAddress: '',
                                                                    country: s.country || ''
                                                                };
                                                                setSwiftDetails(bRes);
                                                                setAchDetails({
                                                                    bankName: bRes.bankName,
                                                                    routingNumber: bRes.swiftCode,
                                                                    accountNumber: bRes.iban
                                                                });
                                                            }
                                                            if (s.crypto_details) {
                                                                setCryptoDestination({
                                                                    address: s.crypto_details.address || '',
                                                                    network: 'ethereum'
                                                                });
                                                            }
                                                        }
                                                    }}
                                                    style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '1rem' }}
                                                >
                                                    <option value="">-- Seleccionar Proveedor --</option>
                                                    {suppliers.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name} ({s.country})</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {selectedSupplier && (
                                                <div style={{ background: '#F0F9FF', padding: '1.25rem', borderRadius: '16px', border: '1px solid #BAE6FD', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Datos del Beneficiario</div>
                                                        <div style={{ fontSize: '0.7rem', background: '#0369A1', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{selectedSupplier.country}</div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748B', marginBottom: '0.1rem' }}>BANCO</div>
                                                            <div style={{ fontWeight: 700 }}>{selectedSupplier.bank_details?.bank_name || '---'}</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748B', marginBottom: '0.1rem' }}>{selectedSupplier.country === 'Estados Unidos' ? 'ROUTING' : 'SWIFT/BIC'}</div>
                                                            <div style={{ fontWeight: 700 }}>{selectedSupplier.bank_details?.swift_code || '---'}</div>
                                                        </div>
                                                        <div style={{ gridColumn: 'span 2' }}>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748B', marginBottom: '0.1rem' }}>NÚMERO DE CUENTA / IBAN</div>
                                                            <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem' }}>{selectedSupplier.bank_details?.account_number || '---'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Motivo de la operación (Justificación)</label>
                                                <input value={paymentReason} onChange={e => setPaymentReason(e.target.value)} placeholder="Ej: Factura #123" />
                                            </div>

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Respaldo (Factura/PDF)</label>
                                                <div style={{ border: '2px dashed #ccc', padding: '1rem', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }} onClick={() => document.getElementById('support_up')?.click()}>
                                                    <Upload size={20} style={{ margin: '0 auto 0.5rem' }} />
                                                    <div style={{ fontSize: '0.8rem' }}>{supportDocument ? supportDocument.name : 'Haz clic para subir'}</div>
                                                    <input id="support_up" type="file" style={{ display: 'none' }} onChange={e => setSupportDocument(e.target.files?.[0] || null)} />
                                                </div>
                                            </div>

                                            {/* Bank details depending on delivery method */}
                                            {deliveryMethod === 'swift' && (
                                                <div style={{ background: '#fff', border: '1px solid #eee', padding: '1rem', borderRadius: '12px' }}>
                                                    <h5>Datos SWIFT</h5>
                                                    <input placeholder="Banco" value={swiftDetails.bankName} onChange={e => setSwiftDetails({ ...swiftDetails, bankName: e.target.value })} style={{ marginBottom: '0.5rem', width: '100%' }} />
                                                    <input placeholder="SWIFT" value={swiftDetails.swiftCode} onChange={e => setSwiftDetails({ ...swiftDetails, swiftCode: e.target.value })} style={{ marginBottom: '0.5rem', width: '100%' }} />
                                                    <input placeholder="IBAN" value={swiftDetails.iban} onChange={e => setSwiftDetails({ ...swiftDetails, iban: e.target.value })} style={{ width: '100%' }} />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* OTHER ROUTES Condensed */}
                                    {(selectedRoute === 'us_to_bolivia' || selectedRoute === 'us_to_wallet' || selectedRoute === 'crypto_to_crypto') && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Completa los datos necesarios para procesar tu {translateType(selectedRoute).toLowerCase()}.</p>
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Monto</label>
                                                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                                            </div>
                                            {selectedRoute === 'us_to_wallet' && (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Riel de Recepción (Destino USDT/USDC)</label>
                                                    <input value={clientCryptoAddress} onChange={e => setClientCryptoAddress(e.target.value)} placeholder="Dirección de tu billetera" />
                                                </div>
                                            )}
                                            {selectedRoute === 'crypto_to_crypto' && (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Dirección Destino</label>
                                                    <input value={destinationId} onChange={e => setDestinationId(e.target.value)} placeholder="0x..." />
                                                </div>
                                            )}
                                            {selectedRoute === 'us_to_bolivia' && (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>ID de Referencia / Banco Destino</label>
                                                    <input value={destinationId} onChange={e => setDestinationId(e.target.value)} placeholder="Ej: Banco Unión - 123456" />
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Motivo de la operación</label>
                                                <input value={paymentReason} onChange={e => setPaymentReason(e.target.value)} placeholder="Ej: Pago de servicios / Fondeo personal" title="Justificación de la operación" />
                                            </div>

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Documento de Respaldo (Opcional)</label>
                                                <div style={{ border: '2px dashed #ccc', padding: '1rem', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }} onClick={() => document.getElementById('support_up_alt')?.click()}>
                                                    <Upload size={20} style={{ margin: '0 auto 0.5rem' }} />
                                                    <div style={{ fontSize: '0.8rem' }}>{supportDocument ? supportDocument.name : 'Haz clic para subir (PDF/Imagen)'}</div>
                                                    <input id="support_up_alt" type="file" style={{ display: 'none' }} onChange={e => setSupportDocument(e.target.files?.[0] || null)} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ background: '#F1F5F9', padding: '1rem', borderRadius: '12px', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Comisión estimada:</span>
                                            <span style={{ fontWeight: 700 }}>{calculatedFeeValue.toFixed(2)} {currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Llegará al proveedor:</span>
                                            <span style={{ fontWeight: 700, color: 'var(--success)' }}>{netAmountValue.toFixed(2)} {currency}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => {
                                            console.log('Transitioning to Step 3', { selectedRoute, amount, paymentReason, supportDocument, selectedSupplier });
                                            setStep(3);
                                        }}
                                        disabled={
                                            loading ||
                                            !amount ||
                                            Number(amount) <= 0 ||
                                            (selectedRoute === 'bolivia_to_exterior' && (!paymentReason || !supportDocument || !selectedSupplier)) ||
                                            (selectedRoute === 'crypto_to_crypto' && !destinationId) ||
                                            ((selectedRoute === 'us_to_bolivia' || selectedRoute === 'us_to_wallet') && !destinationId && !clientCryptoAddress)
                                        }
                                        className="btn-primary"
                                        style={{ marginTop: '1rem', opacity: (loading || !amount || Number(amount) <= 0) ? 0.5 : 1 }}
                                        title={(!amount || Number(amount) <= 0) ? "Ingresa un monto válido" : "Completa todos los campos requeridos"}
                                    >
                                        {(selectedRoute !== 'bolivia_to_exterior' && !amount) ? 'Solicitar Datos de Riel' : 'Continuar a Revisión de Expediente'}
                                    </button>
                                </div>
                            )}

                            {step === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '24px', padding: '2rem' }}>
                                        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldCheck /> Confirmación</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                            <div>
                                                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>ENVÍAS</span>
                                                <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{fundingMethod === 'bs' ? amountBs + ' Bs' : amount + ' ' + currency}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>RECIBES</span>
                                                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--success)' }}>{netAmountValue.toFixed(2)} {currency}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Comisión:</span><b>{calculatedFeeValue.toFixed(2)} {currency}</b></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Proveedor:</span><b>{selectedSupplier?.name || '---'}</b></div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <button onClick={handleExecuteOperation} disabled={loading} className="btn-primary" style={{ flex: 2 }}>{loading ? 'Registrando...' : 'Confirmar e Iniciar Expediente'}</button>
                                        <button onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }}>Corregir</button>
                                    </div>
                                </div>
                            )}

                            {step === 4 && (
                                <div style={{ padding: '2rem', textAlign: 'center' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                        <ShieldCheck size={48} />
                                    </div>
                                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>¡Expediente Iniciado!</h2>
                                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Tu solicitud ha sido registrada en el sistema. Sigue las indicaciones del riel para completar la operación.</p>

                                    {waitingForEvidence ? (
                                        <div style={{ textAlign: 'left', background: '#FFFBEB', padding: '1.5rem', borderRadius: '16px', border: '1px solid #FEF3C7' }}>
                                            <div style={{ margin: '1rem 0', fontSize: '0.9rem' }}>
                                                {fundingMethod === 'bs' ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        <h4 style={{ color: '#B45309', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Datos del Riel Financiero autorizado PSAV por Guira (tercero)</h4>

                                                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'start', flexWrap: 'wrap' }}>
                                                            {qrUrl && (
                                                                <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '12px', border: '1px solid #E2E8F0', flexShrink: 0 }}>
                                                                    <img src={qrUrl} alt="QR Pago" style={{ width: '160px', height: '160px', objectFit: 'contain' }} />
                                                                    <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Escanear para pagar</div>
                                                                </div>
                                                            )}
                                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                                    <div><b>Banco:</b> Mercantil Santa Cruz</div>
                                                                    <div><b>Cuenta:</b> 401-2345678-9</div>
                                                                    <div><b>Monto:</b> <span style={{ fontSize: '1.1rem', color: 'var(--primary)', fontWeight: 800 }}>{amountBs} Bs</span></div>
                                                                </div>
                                                                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#FEF3C7', borderRadius: '8px', borderLeft: '4px solid #D97706', fontSize: '0.85rem', fontStyle: 'italic', lineHeight: 1.4 }}>
                                                                    Deposite su transferencia a esta cuenta Bancaria del PSAV autorizado para la transformación de su dinero a USDC
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>Realiza el envío de <b>{amount} {currency}</b> a la dirección asignada en tu historial.</div>
                                                )}
                                            </div>
                                            <div style={{ marginTop: '1rem' }}>
                                                <label style={{ fontWeight: 700, fontSize: '0.8rem' }}>Adjuntar Comprobante</label>
                                                <div style={{ border: '2px dashed #ccc', padding: '1rem', borderRadius: '12px', textAlign: 'center', marginTop: '0.5rem', cursor: 'pointer', background: '#fff' }} onClick={() => document.getElementById('final_up')?.click()}>
                                                    <Upload size={18} />
                                                    <div style={{ fontSize: '0.75rem' }}>{evidenceFile ? evidenceFile.name : 'Subir Comprobante (PDF/JPG)'}</div>
                                                    <input id="final_up" type="file" style={{ display: 'none' }} onChange={e => setEvidenceFile(e.target.files?.[0] || null)} />
                                                </div>
                                                <button onClick={handleUploadEvidence} disabled={!evidenceFile || loading} className="btn-primary" style={{ width: '100%', marginTop: '1rem', background: '#D97706' }}>Notificar Acreditación</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={resetFlow} className="btn-primary" style={{ width: '200px' }}>Volver al Inicio</button>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HISTORY AND LISTS (Visible when not in a flow) */}
            {
                selectedRoute === null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {activeTab === 'payin' ? (
                            <motion.div key="list_payin" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Mis Rieles de Acreditación</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                                    {payinRoutes.length === 0 ? (
                                        <div className="premium-card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                                            <CreditCard size={48} style={{ marginBottom: '1rem' }} />
                                            <p>No tienes instrucciones configuradas. Selecciona una opción arriba para comenzar.</p>
                                        </div>
                                    ) : payinRoutes.map(route => (
                                        <div key={route.id} className="premium-card">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    background: route.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                    color: route.status === 'active' ? 'var(--success)' : 'var(--warning)'
                                                }}>
                                                    {translateStatus(route.status)}
                                                </span>
                                                {showAdvanced && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>ID: {route.id.slice(0, 8)}</span>}
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '1rem' }}>{translateType(route.type)}</h4>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                                Red: {String(route.metadata?.network || 'TRON').toUpperCase()}
                                                {route.fee_percentage !== null && route.fee_percentage !== undefined && (
                                                    <span style={{ marginLeft: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>
                                                        • Comisión: {route.fee_percentage}%
                                                    </span>
                                                )}
                                            </p>

                                            {
                                                route.status === 'active' && route.instructions ? (
                                                    <div style={{ marginTop: '1rem', background: '#F1F5F9', padding: '1rem', borderRadius: '12px', fontSize: '0.85rem' }}>
                                                        {route.instructions.banco && <div><b>Banco:</b> {route.instructions.banco}</div>}
                                                        {route.instructions.cuenta && <div><b>Cuenta:</b> {route.instructions.cuenta}</div>}
                                                        {route.instructions.routing && <div><b>Routing:</b> {route.instructions.routing}</div>}
                                                        {route.instructions.address && (
                                                            <div style={{ marginTop: '0.5rem' }}>
                                                                <b style={{ display: 'block', marginBottom: '0.2rem' }}>Dirección de envío:</b>
                                                                <code style={{ wordBreak: 'break-all', display: 'block', padding: '4px', background: '#fff', borderRadius: '4px' }}>{route.instructions.address}</code>
                                                            </div>
                                                        )}

                                                        {route.metadata?.destination_wallet && (
                                                            <div style={{ marginTop: '1rem', borderTop: '1px dashed #CBD5E1', paddingTop: '0.5rem' }}>
                                                                <b style={{ display: 'block', marginBottom: '0.2rem', fontSize: '0.75rem', color: 'var(--primary)', textTransform: 'uppercase' }}>Destino Final</b>
                                                                <div style={{ fontSize: '0.8rem' }}>
                                                                    <b>Dirección:</b> <code style={{ wordBreak: 'break-all' }}>{route.metadata.destination_wallet}</code>
                                                                </div>
                                                                {route.metadata.destination_network && (
                                                                    <div style={{ fontSize: '0.8rem' }}><b>Red:</b> {String(route.metadata.destination_network || "").toUpperCase()}</div>
                                                                )}
                                                                {route.metadata.destination_currency && (
                                                                    <div style={{ fontSize: '0.8rem' }}><b>Moneda:</b> {route.metadata.destination_currency}</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', fontStyle: 'italic' }}>
                                                        {route.status === 'submitted' ? 'Estamos configurando tus accesos...' : 'Contacta a soporte para instrucciones.'}
                                                    </p>
                                                )
                                            }
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="list_payout" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Historial Operativo</h3>
                                <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
                                    {bridgeTransfers.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                                            <Globe size={48} style={{ marginBottom: '1rem' }} />
                                            <p>No se encontraron movimientos previos.</p>
                                        </div>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                                        <th style={{ padding: '1.25rem', textAlign: 'left' }}>Operación</th>
                                                        <th style={{ padding: '1.25rem', textAlign: 'left' }}>Estado</th>
                                                        <th style={{ padding: '1.25rem', textAlign: 'right' }}>Monto</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bridgeTransfers.map(trans => (
                                                        <tr key={trans.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '1.25rem' }}>
                                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                                                    {trans.transfer_kind === 'wallet_to_external_bank' ? 'Envío a Banco' :
                                                                        trans.transfer_kind === 'wallet_to_external_crypto' ? 'Envío a Wallet Externa' :
                                                                            trans.transfer_kind === 'external_bank_to_wallet' ? 'Fondeo desde Banco' :
                                                                                'Transferencia Interna'}
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>
                                                                    {trans.business_purpose ? String(trans.business_purpose).replace(/_/g, ' ') : 'Pago'}
                                                                    {trans.metadata?.network && ` • ${String(trans.metadata.network || "").toUpperCase()}`}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '1.25rem' }}>
                                                                <span style={{
                                                                    padding: '4px 10px',
                                                                    borderRadius: '20px',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    background: trans.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                                    color: trans.status === 'completed' ? 'var(--success)' : 'var(--warning)'
                                                                }}>
                                                                    {String(trans.status || "").toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '1.25rem' }}>
                                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                                        {trans.support_document_url && (
                                                                            <button
                                                                                onClick={() => window.open(trans.support_document_url, '_blank')}
                                                                                className="btn-secondary"
                                                                                title="Ver Factura/Respaldo"
                                                                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', background: '#F0F9FF', borderColor: '#BAE6FD', color: '#0369A1' }}
                                                                            >
                                                                                📁
                                                                            </button>
                                                                        )}
                                                                        {trans.evidence_url && (
                                                                            <button
                                                                                onClick={() => window.open(trans.evidence_url, '_blank')}
                                                                                className="btn-secondary"
                                                                                title="Ver Comprobante Cliente"
                                                                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', background: '#FFFBEB', borderColor: '#FEF3C7', color: '#B45309' }}
                                                                            >
                                                                                🧾
                                                                            </button>
                                                                        )}
                                                                        {!trans.evidence_url && trans.is_payment_order && (trans.status === 'created' || trans.status === 'waiting_deposit') && (
                                                                            <button
                                                                                onClick={async () => {
                                                                                    const fileInput = document.createElement('input');
                                                                                    fileInput.type = 'file';
                                                                                    fileInput.accept = 'image/*,application/pdf';
                                                                                    fileInput.onchange = async (e: any) => {
                                                                                        const file = e.target.files?.[0];
                                                                                        if (file) {
                                                                                            setLoading(true);
                                                                                            try {
                                                                                                await uploadOrderEvidence(trans.id, file, 'evidence_url');
                                                                                                // También actualizamos el estado a waiting_deposit si estaba en created
                                                                                                if (trans.status === 'created') {
                                                                                                    await supabase.from('payment_orders').update({ status: 'waiting_deposit' }).eq('id', trans.id);
                                                                                                }
                                                                                                alert('Comprobante subido con éxito');
                                                                                                fetchPaymentsData();
                                                                                            } catch (err: any) {
                                                                                                alert('Error al subir: ' + err.message);
                                                                                            } finally {
                                                                                                setLoading(false);
                                                                                            }
                                                                                        }
                                                                                    };
                                                                                    fileInput.click();
                                                                                }}
                                                                                className="btn-primary"
                                                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem', background: '#D97706', border: 'none' }}
                                                                            >
                                                                                Subir Comprobante
                                                                            </button>
                                                                        )}
                                                                        {trans.business_purpose === 'supplier_payment' && user && (
                                                                            <button
                                                                                onClick={() => generatePaymentPDF({
                                                                                    id: trans.id,
                                                                                    userName: user.email || 'Usuario',
                                                                                    supplierName: trans.metadata?.supplier?.name || trans.metadata?.swift_details?.bankName || 'Destinatario',
                                                                                    date: trans.created_at,
                                                                                    amount: trans.amount,
                                                                                    currency: trans.currency,
                                                                                    fee: trans.fee_amount || 0,
                                                                                    netAmount: trans.net_amount || trans.amount,
                                                                                    exchangeRate: trans.exchange_rate,
                                                                                    type: trans.transfer_kind,
                                                                                    paymentReason: trans.metadata?.payment_reason
                                                                                })}
                                                                                className="btn-secondary"
                                                                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.65rem' }}
                                                                            >
                                                                                📄 PDF
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <span style={{ fontWeight: 700 }}>
                                                                        {trans.amount.toLocaleString()} {trans.currency}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {bridgeTransfers.length === 0 && (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>No hay movimientos registrados.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </div>
                )
            }
        </div>
    )
}
