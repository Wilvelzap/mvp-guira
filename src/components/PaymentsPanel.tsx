import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, Globe, Upload, Clock } from 'lucide-react'
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
    const [sendNetwork, setSendNetwork] = useState('ethereum') // Origins
    const [receiveNetwork, setReceiveNetwork] = useState('base') // Destinations
    const [processingRail, setProcessingRail] = useState<ProcessingRail>('DIGITAL_NETWORK')
    const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
    const [waitingForEvidence, setWaitingForEvidence] = useState(false)
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null)

    // Core Transaction Data
    const [amount, setAmount] = useState('')
    const [currency, setCurrency] = useState('USDC')
    const [destinationId, setDestinationId] = useState('')
    const [clientCryptoAddress, setClientCryptoAddress] = useState('')
    const [clientStablecoin, setClientStablecoin] = useState('USDC')
    const [error, setError] = useState<string | null>(null)
    const [feeConfig, setFeeConfig] = useState<any>(null)

    // Supplier Agenda states
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null)
    const [isAddingSupplier, setIsAddingSupplier] = useState(false)
    const [newSupplier, setNewSupplier] = useState({ name: '', country: 'US', payment_method: 'bank', bank_details: {}, crypto_details: {} })

    // Bolivia Specific
    const [amountBs, setAmountBs] = useState('')
    const exchangeRateBs = 10.5 // Mock exchange rate
    const [receptionMethod, setReceptionMethod] = useState<'qr' | 'bank'>('qr')
    const [qrFile, setQrFile] = useState<File | null>(null)

    const [isConfirmed, setIsConfirmed] = useState(false)

    // Step-by-Step "Pagar al exterior" states
    const [fundingMethod, setFundingMethod] = useState<'bs' | 'crypto'>('bs')
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
    const [isSwift, setIsSwift] = useState(false) // Deprecated but mapping to swift delivery method

    // Handle deep links from dashboard
    useEffect(() => {
        if (initialRoute) {
            setSelectedRoute(initialRoute)
            onRouteClear?.()
        }
    }, [initialRoute])

    // Assets mapping per network
    const networkAssets: Record<string, string[]> = {
        'ethereum': ['USDC', 'USDT', 'ETH'],
        'base': ['USDC', 'ETH'],
        'solana': ['USDC', 'USDT', 'SOL'],
        'polygon': ['USDC', 'USDT', 'POL'],
        'arbitrum': ['USDC', 'ETH']
    }

    // Auto-adjust currencies when networks change
    useEffect(() => {
        if (networkAssets[receiveNetwork] && !networkAssets[receiveNetwork].includes(clientStablecoin)) {
            setClientStablecoin(networkAssets[receiveNetwork][0])
        }
    }, [receiveNetwork])

    useEffect(() => {
        if (networkAssets[sendNetwork] && !networkAssets[sendNetwork].includes(currency)) {
            setCurrency(networkAssets[sendNetwork][0])
        }
    }, [sendNetwork])

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

    const handleAddSupplier = async () => {
        if (!user) return
        const { error } = await supabase.from('suppliers').insert([{ ...newSupplier, user_id: user.id }])
        if (error) setError(error.message)
        else {
            setIsAddingSupplier(false)
            fetchPaymentsData()
        }
    }

    const resetFlow = () => {
        setSelectedRoute(null)
        setAmount('')
        setAmountBs('')
        setDestinationId('')
        setClientCryptoAddress('')
        setError(null)
        setProcessingRail('DIGITAL_NETWORK')
        setWaitingForEvidence(false)
        setEvidenceFile(null)
        setIsSwift(false)
        setIsConfirmed(false)
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
        if (!isConfirmed) {
            setIsConfirmed(true)
            return
        }
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
                finalRail = 'PSAV'
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
                reception_method: receptionMethod,
                intended_amount: amount ? Number(amount) : null,
                destination_address: clientCryptoAddress || destinationId || cryptoDestination.address,
                stablecoin: clientStablecoin || currency,
                sendNetwork,
                receiveNetwork
            }

            if (selectedRoute === 'bolivia_to_exterior') {
                metadata.funding_method = fundingMethod
                metadata.delivery_method = deliveryMethod
                if (deliveryMethod === 'swift') metadata.swift_details = swiftDetails
                if (deliveryMethod === 'ach') metadata.ach_details = achDetails
                if (deliveryMethod === 'crypto') metadata.crypto_destination = cryptoDestination
            } else if (isSwift) {
                metadata.swiftDetails = swiftDetails
            }

            // 3. Create standard PaymentOrder (Order First)
            const { data: order, error: orderErr } = await createPaymentOrder({
                userId: user.id,
                orderType,
                rail: finalRail,
                amountOrigin: Number(selectedRoute === 'bolivia_to_exterior' && fundingMethod === 'bs' ? amountBs : (amount || 0)),
                originCurrency: (selectedRoute === 'bolivia_to_exterior' && fundingMethod === 'bs') ? 'Bs' : currency,
                destinationCurrency: (selectedRoute === 'us_to_bolivia') ? 'Bs' : (selectedRoute === 'bolivia_to_exterior' ? 'USDT' : currency),
                beneficiaryId: selectedSupplier?.id || null,
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
                // If crypto funding, status is waiting_deposit too (waiting for hash)
                await supabase.from('payment_orders').update({ status: 'waiting_deposit' }).eq('id', order.id)
            } else if (selectedRoute === 'us_to_bolivia') {
                if (qrFile) {
                    await uploadOrderEvidence(order.id, qrFile, 'evidence_url')
                }
                await supabase.from('payment_orders').update({ status: 'waiting_deposit' }).eq('id', order.id)
            } else {
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
            'ACH_to_crypto': 'Banco (EE.UU.) a Cripto',
            'crypto_to_crypto': 'Cripto a Cripto',
            'incoming_transfer': 'Depósito USDT'
        }
        return types[type] || type.replace(/_/g, ' ')
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
                                onClick={() => setSelectedRoute('bolivia_to_exterior')}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0'
                                }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🇧🇴</div>
                                <h4 style={{ margin: 0, fontWeight: 700 }}>Pagar al exterior</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    Envía Bs a cuentas bancarias internacionales.
                                </p>
                            </div>

                            <div
                                onClick={() => setSelectedRoute('us_to_wallet')}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0'
                                }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🇺🇸</div>
                                <h4 style={{ margin: 0, fontWeight: 700 }}>Recibir desde EE.UU.</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    Recibe USD en tu billetera como USDC/USDT.
                                </p>
                            </div>

                            <div
                                onClick={() => setSelectedRoute('crypto_to_crypto')}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0'
                                }}
                            >
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
                                <h4 style={{ margin: 0, fontWeight: 700 }}>Enviar cripto</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    Transferencias rápidas entre redes.
                                </p>
                            </div>

                            <div
                                onClick={() => setSelectedRoute('us_to_bolivia')}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    padding: '2rem',
                                    textAlign: 'center',
                                    background: '#ffffff',
                                    border: '1px solid #E2E8F0'
                                }}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                                {selectedRoute === 'bolivia_to_exterior' && 'Pagar al exterior'}
                                {selectedRoute === 'us_to_wallet' && 'Recibir desde EE.UU.'}
                                {selectedRoute === 'crypto_to_crypto' && 'Enviar cripto'}
                                {selectedRoute === 'us_to_bolivia' && 'Recibir en Bolivia'}
                            </h4>
                            <button onClick={resetFlow} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
                                Volver atrás
                            </button>
                        </div>

                        {error && (
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {waitingForEvidence && (
                                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ background: '#FFFBEB', border: '1px solid #FEF3C7', padding: '2rem', borderRadius: '16px', textAlign: 'center' }}>
                                    <Clock size={48} color="#D97706" style={{ marginBottom: '1rem' }} />
                                    <h3 style={{ margin: 0, color: '#92400E' }}>Instrucciones del Riel PSAV</h3>
                                    <p style={{ fontSize: '0.9rem', color: '#B45309', marginTop: '0.5rem' }}>
                                        Realiza el depósito directamente en el riel financiero externo y adjunta el comprobante para documentar la operación.
                                    </p>

                                    <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', margin: '1.5rem 0', textAlign: 'left', fontSize: '0.9rem', border: '1px solid #FEF3C7' }}>
                                        <div style={{ marginBottom: '0.5rem' }}><b>Banco:</b> Mercantil Santa Cruz</div>
                                        <div style={{ marginBottom: '0.5rem' }}><b>Cuenta Bs:</b> 401-2345678-9</div>
                                        <div style={{ marginBottom: '0.5rem' }}><b>Nombre:</b> GUIRA PASV</div>
                                        <div><b>Monto a depositar:</b> <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{amountBs} Bs</span></div>
                                    </div>

                                    <div className="input-group" style={{ textAlign: 'left' }}>
                                        <label style={{ fontWeight: 700 }}>Adjuntar Comprobante (Imagen/PDF)</label>
                                        <div style={{ border: '2px dashed #D1D5DB', padding: '2rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', background: '#F9FAFB', cursor: 'pointer' }} onClick={() => document.getElementById('evidence_upload')?.click()}>
                                            <Upload size={24} color="#9CA3AF" />
                                            <span style={{ fontSize: '0.85rem', color: '#6B7280' }}>{evidenceFile ? evidenceFile.name : 'Haz clic para subir comprobante'}</span>
                                            <input id="evidence_upload" type="file" style={{ display: 'none' }} onChange={e => setEvidenceFile(e.target.files?.[0] || null)} />
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleUploadEvidence}
                                        disabled={!evidenceFile || loading}
                                        className="btn-primary"
                                        style={{ width: '100%', marginTop: '1.5rem', background: '#D97706', borderColor: '#D97706' }}
                                    >
                                        {loading ? 'Procesando...' : 'Notificar Depósito al Riel'}
                                    </button>
                                </motion.div>
                            )}

                            {!waitingForEvidence && (
                                <>
                                    {/* Rail Selection & Disclaimer */}
                                    <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                                        <div style={{ background: '#EFF6FF', padding: '1rem', borderRadius: '12px', border: '1px solid #BFDBFE', color: '#1E40AF', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                            💡 <b>Aviso:</b> {selectedRoute === 'bolivia_to_exterior' ? 'Este pago se procesa a través de un operador local autorizado (Riel PSAV).' : 'Guira coordina y documenta esta operación. El movimiento de fondos se realiza a través del riel indicado.'}
                                        </div>

                                        {(selectedRoute === 'us_to_bolivia') && (
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Riel de Liquidación / Pago</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => setProcessingRail('PSAV')}
                                                        style={{
                                                            padding: '1rem',
                                                            borderRadius: '12px',
                                                            border: `2px solid ${processingRail === 'PSAV' ? 'var(--primary)' : 'var(--border)'}`,
                                                            background: '#fff',
                                                            cursor: 'pointer',
                                                            textAlign: 'left'
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>PSAV</div>
                                                        <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>Riel operativo local</div>
                                                    </button>
                                                    <button
                                                        onClick={() => setProcessingRail('SWIFT')}
                                                        style={{
                                                            padding: '1rem',
                                                            borderRadius: '12px',
                                                            border: `2px solid ${processingRail === 'SWIFT' ? 'var(--primary)' : 'var(--border)'}`,
                                                            background: '#fff',
                                                            cursor: 'pointer',
                                                            textAlign: 'left'
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>SWIFT</div>
                                                        <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>Transferencia bancaria</div>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {selectedRoute === 'us_to_wallet' && (
                                            <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px', fontWeight: 600 }}>
                                                Riel: ACH (Automático)
                                            </div>
                                        )}
                                        {selectedRoute === 'crypto_to_crypto' && (
                                            <div style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '12px', fontWeight: 600 }}>
                                                Riel: Red Digital (Blockchain)
                                            </div>
                                        )}
                                    </div>
                                    {/* ROUTE 1: BOLIVIA AL EXTERIOR */}
                                    {selectedRoute === 'bolivia_to_exterior' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            {/* Paso 1: Fondeo */}
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Paso 1: ¿Con qué pagarás?</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <button
                                                        onClick={() => setFundingMethod('bs')}
                                                        style={{
                                                            padding: '1.25rem', borderRadius: '12px', border: `2px solid ${fundingMethod === 'bs' ? 'var(--primary)' : 'var(--border)'}`,
                                                            background: fundingMethod === 'bs' ? '#EFF6FF' : '#fff', cursor: 'pointer', textAlign: 'center'
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>Bolivianos (Bs)</div>
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Vía riel PSAV local</div>
                                                    </button>
                                                    <button
                                                        onClick={() => setFundingMethod('crypto')}
                                                        style={{
                                                            padding: '1.25rem', borderRadius: '12px', border: `2px solid ${fundingMethod === 'crypto' ? 'var(--primary)' : 'var(--border)'}`,
                                                            background: fundingMethod === 'crypto' ? '#EFF6FF' : '#fff', cursor: 'pointer', textAlign: 'center'
                                                        }}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>USDT / USDC</div>
                                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Vía Red Digital</div>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Paso 2: Envío */}
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Paso 2: ¿Cómo se enviará al exterior?</label>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                    <button
                                                        onClick={() => setDeliveryMethod('swift')}
                                                        className={`btn-secondary ${deliveryMethod === 'swift' ? 'active' : ''}`}
                                                        style={{ justifyContent: 'flex-start', padding: '1rem', border: `2px solid ${deliveryMethod === 'swift' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff' }}
                                                    >
                                                        🌐 Transferencia Bancaria Internacional (SWIFT)
                                                    </button>

                                                    {(!selectedSupplier || selectedSupplier.country === 'US') && (
                                                        <button
                                                            onClick={() => setDeliveryMethod('ach')}
                                                            className={`btn-secondary ${deliveryMethod === 'ach' ? 'active' : ''}`}
                                                            style={{ justifyContent: 'flex-start', padding: '1rem', border: `2px solid ${deliveryMethod === 'ach' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff' }}
                                                        >
                                                            🇺🇸 Transferencia Bancaria en EE.UU. (ACH)
                                                        </button>
                                                    )}

                                                    {(!selectedSupplier || selectedSupplier.payment_method === 'crypto') && (
                                                        <button
                                                            onClick={() => setDeliveryMethod('crypto')}
                                                            className={`btn-secondary ${deliveryMethod === 'crypto' ? 'active' : ''}`}
                                                            style={{ justifyContent: 'flex-start', padding: '1rem', border: `2px solid ${deliveryMethod === 'crypto' ? 'var(--primary)' : 'var(--border)'}`, background: '#fff' }}
                                                        >
                                                            ⚡ Transferencia en Cripto (USDT / USDC)
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />

                                            {/* Motivo y Monto */}
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Motivo del pago (Obligatorio)</label>
                                                <input
                                                    placeholder="Ej: Pago de factura comercial, Honorarios, Mercadería..."
                                                    value={paymentReason}
                                                    onChange={e => setPaymentReason(e.target.value)}
                                                    required
                                                />
                                            </div>

                                            {fundingMethod === 'bs' ? (
                                                <div style={{ background: '#F0FDFA', padding: '1.25rem', borderRadius: '12px', border: '1px solid #CCFBF1' }}>
                                                    <label style={{ fontWeight: 700, color: '#0F766E', display: 'block', marginBottom: '0.5rem' }}>Monto en Bolivianos</label>
                                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                        <input
                                                            type="number"
                                                            placeholder="Monto Bs"
                                                            value={amountBs}
                                                            onChange={e => {
                                                                setAmountBs(e.target.value)
                                                                setAmount((Number(e.target.value) / exchangeRateBs).toFixed(2))
                                                            }}
                                                            style={{ flex: 1, fontSize: '1.1rem', fontWeight: 600 }}
                                                        />
                                                        <span style={{ fontSize: '1.2rem' }}>≈</span>
                                                        <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#115E59' }}>{amount || '0.00'} USDT</div>
                                                    </div>
                                                    <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#134E4A' }}>T.C. Referencial: 1 USDT = {exchangeRateBs} Bs</p>
                                                </div>
                                            ) : (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Monto a Enviar (USDT / USDC)</label>
                                                    <input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={amount}
                                                        onChange={e => setAmount(e.target.value)}
                                                        style={{ fontSize: '1.1rem', fontWeight: 600 }}
                                                    />
                                                </div>
                                            )}

                                            {/* Datos del Beneficiario Dinámicos */}
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Proveedor / Beneficiario</label>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <select
                                                        style={{ flex: 1, padding: '0.75rem' }}
                                                        value={selectedSupplier?.id || ''}
                                                        onChange={(e) => {
                                                            const s = suppliers.find(sup => sup.id === e.target.value)
                                                            setSelectedSupplier(s)
                                                            if (s?.country === 'US') setDeliveryMethod('ach')
                                                            else if (s?.payment_method === 'crypto') setDeliveryMethod('crypto')
                                                            else setDeliveryMethod('swift')
                                                        }}
                                                    >
                                                        <option value="">-- Seleccionar de Agenda --</option>
                                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
                                                    </select>
                                                    <button onClick={() => setIsAddingSupplier(true)} className="btn-secondary">+</button>
                                                </div>
                                            </div>

                                            {isAddingSupplier && (
                                                <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <h5 style={{ marginTop: 0 }}>Registrar Nuevo Proveedor</h5>
                                                    <input placeholder="Nombre / Empresa" onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })} />
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                        <select onChange={e => setNewSupplier({ ...newSupplier, country: e.target.value })}>
                                                            <option value="US">Estados Unidos</option>
                                                            <option value="Bolivia">Bolivia</option>
                                                            <option value="Other">Resto del Mundo</option>
                                                        </select>
                                                        <select onChange={e => setNewSupplier({ ...newSupplier, payment_method: e.target.value as any })}>
                                                            <option value="bank">Banco (SWIFT/ACH)</option>
                                                            <option value="crypto">Cripto (USDT/USDC)</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button onClick={handleAddSupplier} className="btn-primary" style={{ flex: 1, fontSize: '0.8rem' }}>Guardar</button>
                                                        <button onClick={() => setIsAddingSupplier(false)} className="btn-secondary" style={{ flex: 1, fontSize: '0.8rem' }}>Cancelar</button>
                                                    </div>
                                                </div>
                                            )}

                                            {deliveryMethod === 'swift' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <h5 style={{ margin: 0 }}>Datos de Cuenta Bancaria (SWIFT)</h5>
                                                    <input placeholder="Nombre del Banco" value={swiftDetails.bankName} onChange={e => setSwiftDetails({ ...swiftDetails, bankName: e.target.value })} />
                                                    <input placeholder="Dirección del Banco (Calle, Ciudad, País)" value={swiftDetails.bankAddress} onChange={e => setSwiftDetails({ ...swiftDetails, bankAddress: e.target.value })} />
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                        <input placeholder="SWIFT / BIC" value={swiftDetails.swiftCode} onChange={e => setSwiftDetails({ ...swiftDetails, swiftCode: e.target.value })} />
                                                        <input placeholder="IBAN o Account Number" value={swiftDetails.iban} onChange={e => setSwiftDetails({ ...swiftDetails, iban: e.target.value })} />
                                                    </div>
                                                </div>
                                            )}

                                            {deliveryMethod === 'ach' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <h5 style={{ margin: 0 }}>Cuenta Bancaria en EE.UU. (ACH)</h5>
                                                    <input placeholder="Nombre del Banco" value={achDetails.bankName} onChange={e => setAchDetails({ ...achDetails, bankName: e.target.value })} />
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                        <input placeholder="Routing Number (9 dígitos)" value={achDetails.routingNumber} onChange={e => setAchDetails({ ...achDetails, routingNumber: e.target.value })} />
                                                        <input placeholder="Account Number" value={achDetails.accountNumber} onChange={e => setAchDetails({ ...achDetails, accountNumber: e.target.value })} />
                                                    </div>
                                                </div>
                                            )}

                                            {deliveryMethod === 'crypto' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#F8FAFC', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <h5 style={{ margin: 0 }}>Dirección de Billetera</h5>
                                                    <input placeholder="Dirección USDT / USDC" value={cryptoDestination.address} onChange={e => setCryptoDestination({ ...cryptoDestination, address: e.target.value })} />
                                                    <select value={cryptoDestination.network} onChange={e => setCryptoDestination({ ...cryptoDestination, network: e.target.value })}>
                                                        <option value="ethereum">Ethereum (ERC-20)</option>
                                                        <option value="base">Base</option>
                                                        <option value="polygon">Polygon</option>
                                                        <option value="solana">Solana</option>
                                                        <option value="arbitrum">Arbitrum</option>
                                                    </select>
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Documento de Respaldo (Factura / Proforma)</label>
                                                <div
                                                    style={{ border: '2px dashed #D1D5DB', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', background: '#F9FAFB', cursor: 'pointer' }}
                                                    onClick={() => document.getElementById('support_doc_upload')?.click()}
                                                >
                                                    <Upload size={20} color="#9CA3AF" />
                                                    <span style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                                                        {supportDocument ? <b>✅ {supportDocument.name}</b> : 'Haz clic para subir (PDF o Imagen)'}
                                                    </span>
                                                    <input id="support_doc_upload" type="file" style={{ display: 'none' }} onChange={e => setSupportDocument(e.target.files?.[0] || null)} />
                                                </div>
                                                <p style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: '0.4rem' }}>
                                                    ⚠️ Este documento respalda el motivo del pago y será incluido en el reporte final.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ROUTE 2: EE.UU. A BILLETERA */}
                                    {selectedRoute === 'us_to_wallet' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div style={{ background: '#F0F9FF', padding: '1.5rem', borderRadius: '16px', border: '1px solid #BAE6FD' }}>
                                                <h4 style={{ marginTop: 0, color: '#0369A1' }}>Instrucciones de Fondeo (USD)</h4>
                                                <p style={{ fontSize: '0.9rem', color: '#0C4A6E' }}>Configura la billetera donde quieres recibir tus fondos. Se te asignarán instrucciones bancarias de EE.UU. vinculadas a esta dirección.</p>
                                            </div>

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Dirección de Billetera (Donde recibes)</label>
                                                <input
                                                    placeholder="0x... o Dirección de Red..."
                                                    value={clientCryptoAddress}
                                                    onChange={e => setClientCryptoAddress(e.target.value)}
                                                    style={{ padding: '0.75rem' }}
                                                />
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Recibir Moneda</label>
                                                    <select value={clientStablecoin} onChange={e => setClientStablecoin(e.target.value)} style={{ padding: '0.75rem' }}>
                                                        <option value="USDC">USDC (Recomendado)</option>
                                                        <option value="USDT">USDT</option>
                                                    </select>
                                                </div>
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Red de Destino</label>
                                                    <select value={receiveNetwork} onChange={e => setReceiveNetwork(e.target.value)} style={{ padding: '0.75rem' }}>
                                                        <option value="base">Base</option>
                                                        <option value="ethereum">Ethereum</option>
                                                        <option value="polygon">Polygon</option>
                                                        <option value="solana">Solana</option>
                                                        <option value="arbitrum">Arbitrum</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                                                <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                                                    <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                                    Al completar la solicitud, se te asignarán instrucciones bancarias únicas. Los fondos se acreditan automáticamente en 1-3 días hábiles.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ROUTE 3: CRIPTO A CRIPTO */}
                                    {selectedRoute === 'crypto_to_crypto' && (
                                        <>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Monto a enviar</label>
                                                    <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={{ padding: '0.75rem' }} />
                                                </div>
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Red de Envío</label>
                                                    <select value={sendNetwork} onChange={e => setSendNetwork(e.target.value)} style={{ padding: '0.75rem' }}>
                                                        <option value="ethereum">Ethereum</option>
                                                        <option value="base">Base</option>
                                                        <option value="polygon">Polygon</option>
                                                        <option value="solana">Solana</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Dirección de Billetera Destino</label>
                                                <input
                                                    placeholder="0x... o Dirección de Red..."
                                                    value={destinationId}
                                                    onChange={e => setDestinationId(e.target.value)}
                                                    style={{ padding: '0.75rem' }}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* ROUTE 4: EE.UU. A BOLIVIA */}
                                    {selectedRoute === 'us_to_bolivia' && (
                                        <>
                                            <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--primary)' }}>
                                                <label style={{ fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '0.5rem' }}>Calculadora (USD → Bs)</label>
                                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                    <input
                                                        type="number"
                                                        placeholder="Monto en USD"
                                                        value={amount}
                                                        onChange={e => {
                                                            setAmount(e.target.value)
                                                            setAmountBs((Number(e.target.value) * exchangeRateBs).toFixed(2))
                                                        }}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <span>=</span>
                                                    <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{amountBs || '0.00'} Bs</div>
                                                </div>
                                                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.8 }}>T.C. Aplicado: 1 USD = {exchangeRateBs} Bs</p>
                                            </div>

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Método de Recepción en Bolivia</label>
                                                <div style={{ display: 'flex', gap: '1rem' }}>
                                                    <label style={{ flex: 1, padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '12px', cursor: 'pointer', background: receptionMethod === 'qr' ? 'rgba(59, 130, 246, 0.05)' : '#fff' }}>
                                                        <input type="radio" name="reception" value="qr" checked={receptionMethod === 'qr'} onChange={() => setReceptionMethod('qr')} /> QR Bancario
                                                    </label>
                                                    <label style={{ flex: 1, padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '12px', cursor: 'pointer', background: receptionMethod === 'bank' ? 'rgba(59, 130, 246, 0.05)' : '#fff' }}>
                                                        <input type="radio" name="reception" value="bank" checked={receptionMethod === 'bank'} onChange={() => setReceptionMethod('bank')} /> Cuenta Bancaria
                                                    </label>
                                                </div>
                                            </div>

                                            {receptionMethod === 'qr' && (
                                                <div className="input-group">
                                                    <label style={{ fontWeight: 700 }}>Subir Imagen QR (Obligatorio)</label>
                                                    <input type="file" onChange={e => setQrFile(e.target.files?.[0] || null)} />
                                                </div>
                                            )}

                                            <div className="input-group">
                                                <label style={{ fontWeight: 700 }}>Datos de Cuenta / Referencia</label>
                                                <input
                                                    placeholder="Número de cuenta bancaria o nombre del QR..."
                                                    value={destinationId}
                                                    onChange={e => setDestinationId(e.target.value)}
                                                    style={{ padding: '0.75rem' }}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {amount && feeConfig && !['us_to_wallet'].includes(selectedRoute || '') && (
                                        <div style={{ background: '#F1F5F9', padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid #CBD5E1' }}>
                                            <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revisión de la Operación</h5>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                                                <span style={{ color: '#64748B' }}>Proveedor:</span>
                                                <span style={{ fontWeight: 600, textAlign: 'right' }}>{selectedSupplier?.name || 'No seleccionado'} ({selectedSupplier?.country || '-'})</span>

                                                <span style={{ color: '#64748B' }}>Motivo:</span>
                                                <span style={{ fontWeight: 600, textAlign: 'right' }}>{paymentReason || '-'}</span>

                                                <span style={{ color: '#64748B' }}>Documento:</span>
                                                <span style={{ fontWeight: 600, textAlign: 'right', color: 'var(--primary)' }}>{supportDocument ? supportDocument.name : 'No adjunto'}</span>
                                            </div>

                                            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem' }}>
                                                    <span style={{ color: '#64748B' }}>Monto {fundingMethod === 'bs' ? 'Origen' : 'enviado'}:</span>
                                                    <span style={{ fontWeight: 600 }}>{fundingMethod === 'bs' ? amountBs + ' Bs' : amount + ' ' + currency}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: 'var(--error)' }}>
                                                    <span style={{ color: '#64748B' }}>Fee Guira:</span>
                                                    <span>- {calculatedFeeValue.toFixed(2)} {currency}</span>
                                                </div>
                                                {fundingMethod === 'bs' && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                        <span style={{ color: '#64748B' }}>Tipo de Cambio Applied:</span>
                                                        <span>1 USDT = {exchangeRateBs} Bs</span>
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748B' }}>
                                                    <span>Método de envío:</span>
                                                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{deliveryMethod}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748B' }}>
                                                    <span>Riel operativo:</span>
                                                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{fundingMethod === 'bs' ? 'PSAV (Local)' : 'Digital Network'}</span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, borderTop: '2px solid #CBD5E1', paddingTop: '1rem', fontSize: '1.1rem', color: 'var(--success)' }}>
                                                <span>Recibirá el proveedor:</span>
                                                <span>{netAmountValue.toFixed(2)} {currency}</span>
                                            </div>

                                            <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.4rem', borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                                                {selectedRoute === 'bolivia_to_exterior'
                                                    ? 'Guira coordina y documenta esta operación. El movimiento de fondos se realiza a través del riel indicado.'
                                                    : 'Guira facilita la documentación y orquestación de este flujo financiero.'}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Clock size={14} /> Tiempo estimado: {fundingMethod === 'crypto' ? 'Minutos' : '1-3 días hábiles'}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                        {isConfirmed ? (
                                            <div style={{ padding: '1rem', background: '#FFF7ED', border: '1px solid #FFEDD5', borderRadius: '12px', fontSize: '0.85rem', color: '#9A3412' }}>
                                                ⚠️ <b>Confirma los datos:</b> Al hacer clic en el botón de abajo, se creará la Orden de Pago obligatoria y se te mostrarán las instrucciones del riel financiero.
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '0.8rem', color: '#64748B', textAlign: 'center' }}>
                                                Revisa los detalles antes de solicitar la creación de la orden.
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <button
                                                onClick={handleExecuteOperation}
                                                disabled={
                                                    loading ||
                                                    (selectedRoute === 'bolivia_to_exterior' && (
                                                        !selectedSupplier || !paymentReason || !supportDocument || !amount ||
                                                        (deliveryMethod === 'swift' && (!swiftDetails.bankName || !swiftDetails.swiftCode || !swiftDetails.iban)) ||
                                                        (deliveryMethod === 'ach' && (!achDetails.bankName || !achDetails.routingNumber || !achDetails.accountNumber)) ||
                                                        (deliveryMethod === 'crypto' && !cryptoDestination.address)
                                                    )) ||
                                                    (selectedRoute === 'us_to_bolivia' && (!amount || !destinationId || (receptionMethod === 'qr' && !qrFile))) ||
                                                    (selectedRoute === 'us_to_wallet' && !clientCryptoAddress)
                                                }
                                                className="btn-primary"
                                                style={{ flex: 1, padding: '1rem', fontSize: '1.1rem' }}
                                            >
                                                {loading ? 'Procesando...' : (isConfirmed ? 'Confirmar y Crear Orden' : 'Revisar Datos')}
                                            </button>
                                            <button onClick={resetFlow} className="btn-secondary" style={{ flex: 0.3 }}>Cancelar</button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HISTORY AND LISTS (Visible when not in a flow) */}
            {selectedRoute === null && (
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
                                            Red: {route.metadata?.network?.toUpperCase() || 'TRON'}
                                        </p>

                                        {route.status === 'active' && route.instructions ? (
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
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', fontStyle: 'italic' }}>
                                                {route.status === 'submitted' ? 'Estamos configurando tus accesos...' : 'Contacta a soporte para instrucciones.'}
                                            </p>
                                        )}
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
                                                                {trans.business_purpose.replace(/_/g, ' ')}
                                                                {trans.metadata?.network && ` • ${trans.metadata.network.toUpperCase()}`}
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
                                                                {trans.status.toUpperCase()}
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
            )}
        </div>
    )
}
