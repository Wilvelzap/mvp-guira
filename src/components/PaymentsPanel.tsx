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
    const exchangeRateBs = 10.5 // Mock exchange rate
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

        const [routes, transfers, suppliersRes, feeRes, orders] = await Promise.all([
            supabase.from('payin_routes').select('*').eq('user_id', user.id),
            supabase.from('bridge_transfers').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('suppliers').select('*').eq('user_id', user.id),
            getFeeConfig('supplier_payment'),
            supabase.from('payment_orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
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
                is_payment_order: true
            }))
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        if (allHistory) setBridgeTransfers(allHistory as any)
        if (suppliersRes.data) setSuppliers(suppliersRes.data)
        if (feeRes) setFeeConfig(feeRes)
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
        // Reset new fields
        setFundingMethod('bs')
        setDeliveryMethod('swift')
        setPaymentReason('')
        setSupportDocument(null)
        setAchDetails({ routingNumber: '', accountNumber: '', bankName: '' })
        setSwiftDetails({ bankName: '', swiftCode: '', iban: '', bankAddress: '', country: '' })
        setCryptoDestination({ address: '', network: 'ethereum' })
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
                await uploadOrderEvidence(order.id, supportDocument, 'evidence_url')
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
                if (selectedRoute === 'crypto_to_crypto') resetFlow()
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
                            Mis Instrucciones
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
                            Historial
                        </button>
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {selectedRoute === null ? (
                    <motion.div key="selector" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>Selecciona una Ruta de Pago</h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
                            gap: '1rem'
                        }}>
                            <div
                                onClick={() => { setSelectedRoute('bolivia_to_exterior'); setStep(2); }}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🇧🇴</div>
                                <h4 style={{ margin: 0, fontWeight: 700 }}>Pagar al exterior</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    Envía Bs a cuentas bancarias internacionales.
                                </p>
                            </div>

                            <div
                                onClick={() => { setSelectedRoute('us_to_wallet'); setStep(2); }}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🇺🇸</div>
                                <h4 style={{ margin: 0, fontWeight: 700 }}>Recibir desde EE.UU.</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    Recibe USD en tu billetera como USDC/USDT.
                                </p>
                            </div>

                            <div
                                onClick={() => { setSelectedRoute('crypto_to_crypto'); setStep(2); }}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
                                <h4 style={{ margin: 0, fontWeight: 700 }}>Enviar cripto</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    Transferencias rápidas entre redes.
                                </p>
                            </div>

                            <div
                                onClick={() => { setSelectedRoute('us_to_bolivia'); setFundingMethod('crypto'); setStep(2); }}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
                                <h4 style={{ margin: 0, fontWeight: 700 }}>Recibir en Bolivia</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    Liquida tus USD/USDC directamente en tu banco.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="premium-card" style={{ background: '#F8FAFC' }}>
                        <StepHeader />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                                {selectedRoute === 'bolivia_to_exterior' && 'Pagar al exterior'}
                                {selectedRoute === 'us_to_wallet' && 'Recibir desde EE.UU.'}
                                {selectedRoute === 'crypto_to_crypto' && 'Enviar cripto'}
                                {selectedRoute === 'us_to_bolivia' && 'Recibir en Bolivia'}
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
                                            💡 <b>Aviso:</b> {selectedRoute === 'bolivia_to_exterior' ? 'Este pago se procesa a través de un operador local autorizado (Riel PSAV).' : 'Guira coordina y documenta esta operación.'}
                                        </div>
                                    </div>

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
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Red Digital</div>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>¿Cómo se enviará al exterior?</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    <button onClick={() => setDeliveryMethod('swift')} className={`btn-secondary ${deliveryMethod === 'swift' ? 'active' : ''}`} style={{ border: `2px solid ${deliveryMethod === 'swift' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff', justifyContent: 'flex-start' }}>🌐 SWIFT / Local (Mundo)</button>
                                                    <button onClick={() => setDeliveryMethod('ach')} className={`btn-secondary ${deliveryMethod === 'ach' ? 'active' : ''}`} style={{ border: `2px solid ${deliveryMethod === 'ach' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff', justifyContent: 'flex-start' }}>🇺🇸 ACH (EE.UU.)</button>
                                                    <button onClick={() => setDeliveryMethod('crypto')} className={`btn-secondary ${deliveryMethod === 'crypto' ? 'active' : ''}`} style={{ border: `2px solid ${deliveryMethod === 'crypto' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff', justifyContent: 'flex-start' }}>⚡ Cripto (USDT/USDC)</button>
                                                </div>
                                            </div>

                                            {fundingMethod === 'bs' ? (
                                                <div style={{ background: '#F0FDFA', padding: '1.25rem', border: '1px solid #CCFBF1', borderRadius: '12px' }}>
                                                    <label style={{ fontWeight: 700, color: '#0F766E' }}>Monto en Bolivianos</label>
                                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
                                                        <input type="number" value={amountBs} onChange={e => { setAmountBs(e.target.value); setAmount((Number(e.target.value) / exchangeRateBs).toFixed(2)); }} style={{ flex: 1, fontSize: '1.1rem', fontWeight: 700 }} />
                                                        <span>≈</span>
                                                        <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{amount || '0.00'} USDT</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Monto USDT/USDC</label>
                                                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Proveedor / Beneficiario</label>
                                                <select value={selectedSupplier?.id || ''} onChange={e => setSelectedSupplier(suppliers.find(s => s.id === e.target.value))} style={{ width: '100%', padding: '0.75rem' }}>
                                                    <option value="">-- Seleccionar --</option>
                                                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Motivo del pago</label>
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
                                                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
                                            </div>
                                            {selectedRoute === 'us_to_wallet' && (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Billetera de Recepción</label>
                                                    <input value={clientCryptoAddress} onChange={e => setClientCryptoAddress(e.target.value)} />
                                                </div>
                                            )}
                                            {selectedRoute === 'crypto_to_crypto' && (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Dirección Destino</label>
                                                    <input value={destinationId} onChange={e => setDestinationId(e.target.value)} />
                                                </div>
                                            )}
                                            {selectedRoute === 'us_to_bolivia' && (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>ID de Referencia</label>
                                                    <input value={destinationId} onChange={e => setDestinationId(e.target.value)} />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setStep(3)}
                                        disabled={!amount || (selectedRoute === 'bolivia_to_exterior' && (!paymentReason || !supportDocument)) || loading}
                                        className="btn-primary"
                                        style={{ marginTop: '1rem' }}
                                    >
                                        Continuar a Revisión
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
                                        <button onClick={handleExecuteOperation} disabled={loading} className="btn-primary" style={{ flex: 2 }}>{loading ? 'Creando...' : 'Confirmar e Iniciar'}</button>
                                        <button onClick={() => setStep(2)} className="btn-secondary" style={{ flex: 1 }}>Corregir</button>
                                    </div>
                                </div>
                            )}

                            {step === 4 && (
                                <div style={{ padding: '2rem', textAlign: 'center' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                                        <ShieldCheck size={48} />
                                    </div>
                                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>¡Orden Creada!</h2>
                                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Tu solicitud ha sido registrada. Sigue las instrucciones para completar el pago.</p>

                                    {waitingForEvidence ? (
                                        <div style={{ textAlign: 'left', background: '#FFFBEB', padding: '1.5rem', borderRadius: '16px', border: '1px solid #FEF3C7' }}>
                                            <h4 style={{ color: '#92400E' }}>Instrucciones de Depósito</h4>
                                            <div style={{ margin: '1rem 0', fontSize: '0.9rem' }}>
                                                {fundingMethod === 'bs' ? (
                                                    <div><b>Banco:</b> Mercantil Santa Cruz<br /><b>Cuenta:</b> 401-2345678-9<br /><b>Monto:</b> {amountBs} Bs</div>
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
                                                <button onClick={handleUploadEvidence} disabled={!evidenceFile || loading} className="btn-primary" style={{ width: '100%', marginTop: '1rem', background: '#D97706' }}>Notificar Pago</button>
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
                                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>Mis Instrucciones de Depósito</h3>
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
                                                                    <span style={{ fontWeight: 700 }}>
                                                                        {trans.amount.toLocaleString()} {trans.currency}
                                                                    </span>
                                                                </div>
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
                    </div>
                )
            }
        </div>
    )
}
