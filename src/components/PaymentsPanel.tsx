import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { CreditCard, Globe, Shield } from 'lucide-react'
import type { BusinessPurpose } from '../lib/bridge'
import { createBridgeTransfer } from '../lib/bridge'
import { getFeeConfig, calculateFee } from '../lib/fees'
import { generatePaymentPDF } from '../lib/pdf'

export const PaymentsPanel: React.FC<{ initialRoute?: any; onRouteClear?: () => void }> = ({ initialRoute, onRouteClear }) => {
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState<'payin' | 'payout'>('payin')
    const [payinRoutes, setPayinRoutes] = useState<any[]>([])
    const [bridgeTransfers, setBridgeTransfers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Unified Flow states
    const [selectedRoute, setSelectedRoute] = useState<null | 'bank_to_crypto' | 'crypto_to_crypto' | 'crypto_to_bank'>(null)
    const [sendNetwork, setSendNetwork] = useState('ethereum') // Origins
    const [receiveNetwork, setReceiveNetwork] = useState('base') // Destinations
    const [fiatMethod, setFiatMethod] = useState<'ach' | 'wire'>('ach')

    // Core Transaction Data
    const [amount, setAmount] = useState('')
    const [currency, setCurrency] = useState('USDC')
    const [businessPurpose, setBusinessPurpose] = useState<BusinessPurpose>('supplier_payment')
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

    // Handle deep links from dashboard
    useEffect(() => {
        if (initialRoute) {
            setSelectedRoute(initialRoute)
            onRouteClear?.()
        }
    }, [initialRoute])

    // Assets mapping per network
    const networkAssets: Record<string, string[]> = {
        'ethereum': ['USDC', 'USDT', 'EURC', 'PYUSD'],
        'solana': ['USDC', 'USDT', 'EURC', 'PYUSD'],
        'base': ['USDC', 'EURC', 'PYUSD'],
        'polygon': ['USDC', 'USDT'],
        'arbitrum': ['USDC', 'USDT']
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

        const [routes, transfers, suppliersRes, feeRes] = await Promise.all([
            supabase.from('payin_routes').select('*').eq('user_id', user.id),
            supabase.from('bridge_transfers').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('suppliers').select('*').eq('user_id', user.id),
            getFeeConfig('supplier_payment')
        ])

        if (routes.data) setPayinRoutes(routes.data)
        if (transfers.data) setBridgeTransfers(transfers.data)
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
        setDestinationId('')
        setClientCryptoAddress('')
        setError(null)
    }

    // MAPS to existing backend logic
    const handleExecuteOperation = async () => {
        if (!user) return
        setLoading(true)
        setError(null)

        try {
            if (selectedRoute === 'crypto_to_bank') {
                if (!amount) throw new Error('Ingresa un monto válido')
                const idempotencyKey = `transfer_${user.id}_${Date.now()}`
                const { error: transferErr } = await createBridgeTransfer({
                    userId: user.id,
                    amount: Number(amount),
                    currency,
                    kind: 'wallet_to_external_bank',
                    purpose: businessPurpose,
                    idempotencyKey,
                    destinationId,
                    destinationType: selectedSupplier?.country === 'Bolivia' ? 'external_crypto_address' : 'external_account',
                    network: sendNetwork || 'ethereum',
                    exchangeRate: selectedSupplier?.country === 'Bolivia' ? exchangeRateBs : 1
                })
                if (transferErr) throw transferErr
            } else if (selectedRoute === 'bank_to_crypto' || selectedRoute === 'crypto_to_crypto') {
                const type = selectedRoute === 'bank_to_crypto' ? 'ACH_to_crypto' : 'crypto_to_crypto'
                const { error } = await supabase
                    .from('payin_routes')
                    .insert([{
                        user_id: user.id,
                        type,
                        status: 'submitted',
                        metadata: {
                            destination_address: clientCryptoAddress,
                            stablecoin: clientStablecoin,
                            network: receiveNetwork,
                            origin_network: selectedRoute === 'crypto_to_crypto' ? sendNetwork : 'fiat'
                        }
                    }])
                if (error) throw error
            }

            resetFlow()
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
            'ACH_to_crypto': 'Banco (EE.UU.) a Crypto',
            'crypto_to_crypto': 'Crypto a Crypto',
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
                        <h3 style={{ marginBottom: '1.5rem', fontWeight: 700 }}>¿Qué quieres hacer?</h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                            gap: '1rem'
                        }}>
                            <div
                                onClick={() => setSelectedRoute('bank_to_crypto')}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    border: '1px solid transparent',
                                    transition: 'all 0.2s',
                                    padding: '2.5rem',
                                    textAlign: 'center',
                                    background: '#ffffff'
                                }}
                            >
                                <div style={{ width: '80px', height: '80px', margin: '0 auto 1.5rem', background: '#fff', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src="/assets/branding/icon_bank_to_crypto.png" alt="Banco a Cripto" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Banco (EE.UU.) a Cripto</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.75rem', lineHeight: '1.5' }}>
                                    Recibe transferencias bancarias desde Estados Unidos y conviértelas automáticamente en stablecoins.
                                </p>
                            </div>

                            <div
                                onClick={() => setSelectedRoute('crypto_to_crypto')}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    border: '1px solid transparent',
                                    transition: 'all 0.2s',
                                    padding: '2.5rem',
                                    textAlign: 'center',
                                    background: '#ffffff'
                                }}
                            >
                                <div style={{ width: '80px', height: '80px', margin: '0 auto 1.5rem', background: '#fff', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src="/assets/branding/icon_crypto_to_crypto.png" alt="Wallet a Wallet" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Cripto a Cripto</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.75rem', lineHeight: '1.5' }}>
                                    Recibe pagos desde otras billeteras o plataformas cripto directamente en tu cuenta Guira.
                                </p>
                            </div>

                            <div
                                onClick={() => setSelectedRoute('crypto_to_bank')}
                                className="premium-card clickable-card"
                                style={{
                                    cursor: 'pointer',
                                    border: '1px solid transparent',
                                    transition: 'all 0.2s',
                                    padding: '2.5rem',
                                    textAlign: 'center',
                                    background: '#ffffff'
                                }}
                            >
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    margin: '0 auto 1.5rem',
                                    background: 'linear-gradient(135deg, #0052FF 0%, #1E4A8C 100%)',
                                    borderRadius: '24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    boxShadow: '0 10px 20px -5px rgba(0, 82, 255, 0.3)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top left, rgba(255,255,255,0.2) 0%, transparent 70%)' }} />
                                    <Globe size={40} />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Enviar dinero a un banco</h4>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.75rem', lineHeight: '1.5' }}>
                                    Convierte tus activos digitales y envía el dinero a cuentas bancarias vía ACH o Wire.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="premium-card" style={{ background: '#F8FAFC' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                                {selectedRoute === 'bank_to_crypto' && 'Recibir fondos desde Banco'}
                                {selectedRoute === 'crypto_to_crypto' && 'Recibir fondos desde Wallet'}
                                {selectedRoute === 'crypto_to_bank' && 'Enviar fondos a Banco'}
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
                            {/* ROUTE 1: BANK TO CRYPTO */}
                            {selectedRoute === 'bank_to_crypto' && (
                                <>
                                    <div className="input-group">
                                        <label style={{ fontWeight: 700 }}>1. Red donde recibirás los fondos</label>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Tu wallet debe ser compatible con esta red.
                                        </p>
                                        <select value={receiveNetwork} onChange={e => setReceiveNetwork(e.target.value)} style={{ padding: '0.75rem' }}>
                                            <option value="base">Base</option>
                                            <option value="polygon">Polygon</option>
                                            <option value="arbitrum">Arbitrum</option>
                                            <option value="solana">Solana</option>
                                            <option value="ethereum">Ethereum</option>
                                        </select>
                                    </div>

                                    <div className="input-group">
                                        <label style={{ fontWeight: 700 }}>2. Moneda de llegada</label>
                                        <select value={clientStablecoin} onChange={e => setClientStablecoin(e.target.value)} style={{ padding: '0.75rem' }}>
                                            {networkAssets[receiveNetwork]?.map(asset => (
                                                <option key={asset} value={asset}>{asset} (Dólar Digital)</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="input-group">
                                        <label style={{ fontWeight: 700 }}>3. Tu dirección de wallet en {receiveNetwork.toUpperCase()}</label>
                                        <input
                                            placeholder="Ingresa la dirección de destino 0x..."
                                            value={clientCryptoAddress}
                                            onChange={e => setClientCryptoAddress(e.target.value)}
                                            style={{ padding: '0.75rem' }}
                                        />
                                        <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: '8px', marginTop: '0.5rem', fontSize: '0.8rem', display: 'flex', gap: '0.5rem' }}>
                                            <Shield size={16} color="var(--primary)" />
                                            <span>Te proporcionaremos una cuenta bancaria dedicada para que el banco envíe los fondos a esta dirección.</span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ROUTE 2: CRYPTO TO CRYPTO */}
                            {selectedRoute === 'crypto_to_crypto' && (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div className="input-group">
                                            <label style={{ fontWeight: 700 }}>Red donde recibirás el dinero</label>
                                            <select value={receiveNetwork} onChange={e => setReceiveNetwork(e.target.value)} style={{ padding: '0.75rem' }}>
                                                <option value="base">Base 🔵</option>
                                                <option value="solana">Solana ◎</option>
                                                <option value="polygon">Polygon 🟣</option>
                                                <option value="arbitrum">Arbitrum 💙</option>
                                                <option value="ethereum">Ethereum ⟠</option>
                                            </select>
                                        </div>
                                        <div className="input-group">
                                            <label style={{ fontWeight: 700 }}>Red desde donde se enviará</label>
                                            <select value={sendNetwork} onChange={e => setSendNetwork(e.target.value)} style={{ padding: '0.75rem' }}>
                                                <option value="ethereum">Ethereum ⟠</option>
                                                <option value="solana">Solana ◎</option>
                                                <option value="base">Base 🔵</option>
                                                <option value="polygon">Polygon 🟣</option>
                                                <option value="arbitrum">Arbitrum 💙</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="input-group">
                                        <label style={{ fontWeight: 700 }}>¿Qué moneda quieres recibir?</label>
                                        <select value={clientStablecoin} onChange={e => setClientStablecoin(e.target.value)} style={{ padding: '0.75rem' }}>
                                            {// Intersection of supported assets if complex, but here we just filter by destination
                                                networkAssets[receiveNetwork]?.map(asset => (
                                                    <option key={asset} value={asset}>{asset}</option>
                                                ))
                                            }
                                        </select>
                                    </div>

                                    <div className="input-group">
                                        <label style={{ fontWeight: 700 }}>Tu dirección de wallet (Recibo)</label>
                                        <input
                                            placeholder="Ingresa tu dirección de destino 0x..."
                                            value={clientCryptoAddress}
                                            onChange={e => setClientCryptoAddress(e.target.value)}
                                            style={{ padding: '0.75rem' }}
                                        />
                                    </div>
                                </>
                            )}

                            {/* ROUTE 3: CRYPTO TO BANK (Refined for Suppliers) */}
                            {selectedRoute === 'crypto_to_bank' && (
                                <>
                                    <div className="input-group">
                                        <label style={{ fontWeight: 700 }}>Agenda de Proveedores</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <select
                                                style={{ flex: 1, padding: '0.75rem' }}
                                                value={selectedSupplier?.id || ''}
                                                onChange={(e) => {
                                                    const s = suppliers.find(sup => sup.id === e.target.value)
                                                    setSelectedSupplier(s)
                                                    if (s) {
                                                        setDestinationId(s.payment_method === 'bank' ? s.bank_details?.account : s.crypto_details?.address)
                                                    }
                                                }}
                                            >
                                                <option value="">-- Seleccionar Proveedor --</option>
                                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
                                            </select>
                                            <button onClick={() => setIsAddingSupplier(true)} className="btn-secondary" style={{ padding: '0.5rem' }}>+</button>
                                        </div>
                                    </div>

                                    {isAddingSupplier ? (
                                        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <h5 style={{ marginTop: 0 }}>Registrar Nuevo Proveedor</h5>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <input placeholder="Nombre / Empresa" onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })} />
                                                <select onChange={e => setNewSupplier({ ...newSupplier, country: e.target.value })}>
                                                    <option value="US">Estados Unidos</option>
                                                    <option value="Bolivia">Bolivia</option>
                                                    <option value="Other">Resto del Mundo</option>
                                                </select>
                                                <button onClick={handleAddSupplier} className="btn-primary" style={{ fontSize: '0.8rem' }}>Guardar Beneficiario</button>
                                                <button onClick={() => setIsAddingSupplier(false)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Cancelar</button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {selectedSupplier?.country === 'Bolivia' && (
                                        <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--success)' }}>
                                            <label style={{ fontWeight: 700, color: 'var(--success)', display: 'block', marginBottom: '0.5rem' }}>Calculadora Bolivia (Bs → USDT)</label>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                <input
                                                    type="number"
                                                    placeholder="Monto en Bs"
                                                    value={amountBs}
                                                    onChange={e => {
                                                        setAmountBs(e.target.value)
                                                        setAmount((Number(e.target.value) / exchangeRateBs).toFixed(2))
                                                    }}
                                                    style={{ flex: 1 }}
                                                />
                                                <span>=</span>
                                                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{amount} USDT</div>
                                            </div>
                                            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.8 }}>T.C. Aplicado: 1 USDT = {exchangeRateBs} Bs</p>
                                        </div>
                                    )}

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                        <div className="input-group">
                                            <label style={{ fontWeight: 700 }}>Monto a enviar (USDC/USDT)</label>
                                            <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={{ padding: '0.75rem' }} />
                                        </div>
                                        <div className="input-group">
                                            <label style={{ fontWeight: 700 }}>Método de Salida</label>
                                            <select value={fiatMethod} onChange={e => setFiatMethod(e.target.value as any)} style={{ padding: '0.75rem' }}>
                                                <option value="ach">ACH (EE.UU.)</option>
                                                <option value="wire">Wire (Internacional)</option>
                                                <option value="crypto" disabled={selectedSupplier?.country !== 'Bolivia'}>Crypto / USDT</option>
                                            </select>
                                        </div>
                                    </div>

                                    {amount && feeConfig && (
                                        <div style={{ background: '#F1F5F9', padding: '1rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span>Monto enviado:</span>
                                                <span>{amount} {currency}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--error)' }}>
                                                <span>Fee Guira ({feeConfig.value}{feeConfig.fee_type === 'percentage' ? '%' : ' ' + feeConfig.currency}):</span>
                                                <span>- {calculatedFeeValue.toFixed(2)} {currency}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #CBD5E1', paddingTop: '0.5rem' }}>
                                                <span>Monto neto que recibe:</span>
                                                <span>{netAmountValue.toFixed(2)} {currency}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="input-group">
                                        <label style={{ fontWeight: 700 }}>ID / Wallet de Destino</label>
                                        <input
                                            placeholder="Cuenta bancaria o Address..."
                                            value={destinationId}
                                            onChange={e => setDestinationId(e.target.value)}
                                            style={{ padding: '0.75rem' }}
                                        />
                                    </div>
                                </>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button
                                    onClick={handleExecuteOperation}
                                    disabled={loading || (selectedRoute !== 'crypto_to_bank' && !clientCryptoAddress) || (selectedRoute === 'crypto_to_bank' && !destinationId)}
                                    className="btn-primary"
                                    style={{ flex: 1 }}
                                >
                                    {loading ? 'Procesando...' : selectedRoute === 'crypto_to_bank' ? 'Enviar pago' : 'Recibir fondos'}
                                </button>
                                <button onClick={resetFlow} className="btn-secondary" style={{ flex: 0.3 }}>Cancelar</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HISTORY AND LISTS (Visible when not in a flow) */}
            {selectedRoute === null && (
                <AnimatePresence mode="wait">
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
                                                                {trans.business_purpose === 'supplier_payment' && (
                                                                    <button
                                                                        onClick={() => generatePaymentPDF({
                                                                            id: trans.id,
                                                                            userName: user.email || 'Usuario',
                                                                            supplierName: trans.metadata?.supplier?.name || 'Proveedor Destino',
                                                                            date: trans.created_at,
                                                                            amount: trans.amount,
                                                                            currency: trans.currency,
                                                                            fee: trans.fee_amount || 0,
                                                                            netAmount: trans.net_amount || trans.amount,
                                                                            exchangeRate: trans.exchange_rate,
                                                                            type: trans.transfer_kind
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
                </AnimatePresence>
            )}
        </div>
    )
}
