import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
    User,
    Users,
    Building2,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    Upload,
    Plus,
    Trash2,
    Save,
    Send,
    MapPin,
    Briefcase,
    Target,
    RefreshCw
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { logActivity } from '../lib/activity'

type OnboardingStatus = 'draft' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'needs_changes' | 'waiting_ubo_kyc'

export const OnboardingFlow: React.FC = () => {
    const { user, profile } = useAuth()
    const [step, setStep] = useState(1)
    const [type, setType] = useState<'personal' | 'business' | null>(null)
    const [loading, setLoading] = useState(false)
    const [initialLoading, setInitialLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<OnboardingStatus>('draft')

    // Form Data
    const [formData, setFormData] = useState<any>({
        // Common
        email: profile?.email || '',
        phone: '',

        // Personal
        first_names: '',
        last_names: '',
        dob: '',
        nationality: '',
        occupation: '',
        purpose: '', // Purpose of using the platform
        source_of_funds: '',
        estimated_monthly_volume: '',

        // Address
        street: '',
        city: '',
        state_province: '',
        postal_code: '',
        country: '',

        // Identity
        id_number: '',
        id_expiry: '',
        tax_id: '', // SSN, ITIN or National Tax ID

        // Business
        company_legal_name: '',
        registration_number: '',
        country_of_incorporation: '',
        entity_type: '',
        incorporation_date: '',
        business_description: '',

        // Business Address
        business_street: '',
        business_city: '',
        business_country: '',

        // Legal Rep
        legal_rep_first_names: '',
        legal_rep_last_names: '',
        legal_rep_position: '',
        legal_rep_id_number: '',

        ubos: [] as any[] // Beneficial Owners
    })

    // File pointers
    const [files, setFiles] = useState<{ [key: string]: File | null }>({
        id_front: null,
        id_back: null,
        selfie: null,
        proof_of_address: null,
        company_cert: null,
        legal_rep_id: null
    })

    const [uboFiles, setUboFiles] = useState<{ [key: number]: { [doc: string]: File | null } }>({})

    useEffect(() => {
        fetchExistingOnboarding()
    }, [user])

    const fetchExistingOnboarding = async () => {
        if (!user) return
        setInitialLoading(true)

        // Use .limit(1) and order to get the latest, avoids error if multiple exist
        const { data } = await supabase
            .from('onboarding')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)

        if (data && data.length > 0) {
            const latest = data[0]
            setStatus(latest.status)
            setType(latest.type)
            setFormData((prev: any) => ({ ...prev, ...latest.data }))
        }
        setInitialLoading(false)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
        if (e.target.files && e.target.files[0]) {
            setFiles({ ...files, [key]: e.target.files[0] })
            setError(null)
        }
    }

    const saveDraft = async () => {
        if (!user || !type) return
        setSaving(true)
        const { error } = await supabase
            .from('onboarding')
            .upsert({
                user_id: user.id,
                type,
                status: 'draft',
                data: formData,
                updated_at: new Date().toISOString()
            })

        if (!error) {
            await logActivity(user.id, 'guardar_borrador', { step })
        }
        setSaving(false)
    }

    const handleUboFileChange = (e: React.ChangeEvent<HTMLInputElement>, uboIdx: number, docKey: string) => {
        if (e.target.files && e.target.files[0]) {
            setUboFiles({
                ...uboFiles,
                [uboIdx]: { ...(uboFiles[uboIdx] || {}), [docKey]: e.target.files[0] }
            })
            setError(null)
        }
    }

    const handleSubmit = async () => {
        if (!user || !type) return
        setLoading(true)
        setError(null)

        try {
            // Check mandatory files for step completion logic usually, 
            // but here we just upload what we have
            const uploadedUrls: any = {}
            for (const [key, file] of Object.entries(files)) {
                if (file) {
                    const fileExt = file.name.split('.').pop()
                    const fileName = `${user.id}/${key}_${Date.now()}.${fileExt}`
                    const { error: uploadError } = await supabase.storage
                        .from('onboarding_docs')
                        .upload(fileName, file)

                    if (uploadError) throw new Error(`Error al subir ${key}: ${uploadError.message}`)
                    uploadedUrls[key] = fileName
                }
            }

            // Merge uploaded URLs into data
            const finalData = { ...formData, ...uploadedUrls }

            // 1. Update Onboarding Record
            const { error: upsertError } = await supabase
                .from('onboarding')
                .upsert({
                    user_id: user.id,
                    type,
                    status: 'submitted',
                    data: finalData,
                    updated_at: new Date().toISOString()
                })

            if (upsertError) throw upsertError

            // 2. Sync Profile Status and Name
            const fullName = type === 'personal'
                ? `${finalData.first_names} ${finalData.last_names}`.trim()
                : finalData.company_legal_name;

            await supabase
                .from('profiles')
                .update({
                    onboarding_status: 'submitted',
                    full_name: fullName || null
                })
                .eq('id', user.id)

            await logActivity(user.id, 'enviar_onboarding', { type })
            setStatus('submitted')

        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmitUboDocs = async () => {
        if (!user) return
        setLoading(true)
        setError(null)

        try {
            const updatedUbos = [...formData.ubos]

            for (let i = 0; i < updatedUbos.length; i++) {
                const uFiles = uboFiles[i]
                if (!uFiles) continue

                updatedUbos[i].docs = updatedUbos[i].docs || {}

                for (const [key, file] of Object.entries(uFiles)) {
                    if (file) {
                        const fileExt = file.name.split('.').pop()
                        const fileName = `${user.id}/ubo_${i}_${key}_${Date.now()}.${fileExt}`
                        const { error: uploadError } = await supabase.storage
                            .from('onboarding_docs')
                            .upload(fileName, file)

                        if (uploadError) throw new Error(`Error al subir ${key} para socio ${i + 1}: ${uploadError.message}`)
                        updatedUbos[i].docs[key] = fileName
                    }
                }
            }

            const { error: upsertError } = await supabase
                .from('onboarding')
                .update({
                    status: 'under_review',
                    data: { ...formData, ubos: updatedUbos },
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)

            if (upsertError) throw upsertError

            await supabase
                .from('profiles')
                .update({ onboarding_status: 'under_review' })
                .eq('id', user.id)

            setStatus('under_review')
            await logActivity(user.id, 'enviar_docs_socios', { count: updatedUbos.length })

        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleRetry = async () => {
        if (!user) return
        setLoading(true)
        try {
            await supabase.from('onboarding').update({ status: 'needs_changes' }).eq('user_id', user.id)
            await supabase.from('profiles').update({ onboarding_status: 'needs_changes' }).eq('id', user.id)
            setStatus('needs_changes')
            setStep(1)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const addUBO = () => {
        setFormData({
            ...formData,
            ubos: [...(formData.ubos || []), { first_names: '', last_names: '', percentage: '', nationality: '' }]
        })
    }

    const removeUBO = (index: number) => {
        const newUbos = [...formData.ubos]
        newUbos.splice(index, 1)
        setFormData({ ...formData, ubos: newUbos })
    }

    if (initialLoading) {
        return <div className="loading-spinner" style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>Cargando datos de verificación...</div>
    }

    if (status !== 'draft' && status !== 'needs_changes' && status !== 'waiting_ubo_kyc') {
        const statusColors: any = {
            submitted: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', text: 'Solicitud Enviada' },
            under_review: { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', text: 'En Revisión' },
            verified: { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', text: 'Verificado' },
            rejected: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', text: 'Rechazado' }
        }
        const current = statusColors[status] || statusColors.submitted

        return (
            <div className="premium-card" style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center', padding: '4rem' }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: current.bg,
                    color: current.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 2rem'
                }}>
                    <CheckCircle2 size={40} />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem' }}>{current.text}</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                    {status === 'submitted' && 'Estamos validando tu información para la habilitación de operaciones. Esto suele tardar entre 24 y 48 horas laborales.'}
                    {status === 'under_review' && 'Un oficial de cumplimiento está verificando la coherencia de tu documentación detallada actualmente.'}
                    {status === 'verified' && '¡Tu perfil ha sido validado con éxito! Ya puedes comenzar a orquestar tus operaciones en Guira.'}
                    {status === 'rejected' && 'Lamentablemente, no pudimos validar tu perfil en este momento. Revisa tu correo para más detalles.'}
                </p>
                {status === 'verified' && (
                    <button onClick={() => window.location.reload()} className="btn-primary">Ir a Control Operativo</button>
                )}
                {status === 'rejected' && (
                    <button onClick={handleRetry} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', margin: '0 auto' }}>
                        {loading ? 'Preparando...' : <><RefreshCw size={18} /> Corregir y Reenviar Datos</>}
                    </button>
                )}
            </div>
        )
    }

    if (status === 'waiting_ubo_kyc') {
        return (
            <div style={{ maxWidth: '850px', margin: '2rem auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <div style={{ width: '60px', height: '60px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                        <Users size={30} />
                    </div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Verificación de Socios (UBOs)</h2>
                    <p style={{ color: 'var(--text-muted)' }}>La empresa ha sido pre-aprobada. Ahora necesitamos los documentos de identidad de cada socio.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                    {formData.ubos?.map((ubo: any, idx: number) => (
                        <div key={idx} className="premium-card" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                                <div style={{ width: '40px', height: '40px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary)' }}>
                                    {idx + 1}
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{ubo.first_names} {ubo.last_names}</h4>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Socio - {ubo.percentage}% Participación</span>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
                                {['id_front', 'id_back', 'selfie'].map(docKey => (
                                    <div key={docKey} className="file-upload-card">
                                        <label className="input-label" style={{ fontSize: '0.65rem' }}>{docKey ? String(docKey).replace(/_/g, ' ') : ''}</label>
                                        <div className="upload-dropzone" style={{ height: '70px' }}>
                                            <input type="file" onChange={e => handleUboFileChange(e, idx, docKey)} />
                                            <div className="upload-content" style={{ fontSize: '0.7rem', color: uboFiles[idx]?.[docKey] ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                                <Upload size={18} style={{ marginBottom: '0.2rem' }} />
                                                {uboFiles[idx]?.[docKey] ? uboFiles[idx][docKey]!.name : 'Subir Archivo'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {error && <div className="error-message" style={{ marginTop: '2rem' }}>{error}</div>}

                <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={handleSubmitUboDocs}
                        disabled={loading}
                        className="btn-primary"
                        style={{ padding: '1rem 3rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                    >
                        {loading ? 'Procesando Documentos...' : <><Send size={20} /> Enviar Documentación de Socios</>}
                    </button>
                </div>
            </div>
        )
    }

    if (!type) {
        return (
            <div style={{ maxWidth: '800px', margin: '2rem auto' }}>
                <h1 style={{ fontSize: '2.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '1rem' }}>Comienza Ahora</h1>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '3.5rem' }}>Selecciona tu perfil para iniciar el proceso de validación documental y habilitación de rieles.</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <motion.button
                        whileHover={{ y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                        onClick={() => setType('personal')}
                        className="premium-card"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '3.5rem' }}
                    >
                        <div style={{ padding: '1.25rem', borderRadius: '20px', background: 'rgba(0, 82, 255, 0.05)', color: 'var(--secondary)' }}>
                            <User size={40} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Perfil Personal</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Para individuos que buscan documentar y orquestar operaciones internacionales de forma segura.</p>
                        </div>
                    </motion.button>

                    <motion.button
                        whileHover={{ y: -5, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
                        onClick={() => setType('business')}
                        className="premium-card"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '3.5rem' }}
                    >
                        <div style={{ padding: '1.25rem', borderRadius: '20px', background: 'rgba(30, 74, 140, 0.05)', color: 'var(--primary)' }}>
                            <Building2 size={40} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Perfil de Empresa</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Para empresas registradas y entidades legales con necesidad de trazabilidad operativa.</p>
                        </div>
                    </motion.button>
                </div>
            </div>
        )
    }

    const stepsCount = type === 'personal' ? 4 : 5
    const progress = (step / stepsCount) * 100

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto 4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <button onClick={() => setType(null)} style={{ background: 'none', color: 'var(--secondary)', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ChevronLeft size={16} /> Cambiar Tipo de Cuenta
                    </button>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.5rem' }}>
                        {type === 'personal' ? 'Validación de Identidad (KYC)' : 'Habilitación Corporativa (KYB)'}
                    </h2>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Paso {step} de {stepsCount}</span>
                </div>
            </div>

            <div className="progress-bar-container">
                <motion.div className="progress-bar-fill" animate={{ width: `${progress}%` }} />
            </div>

            <div className="premium-card" style={{ padding: '2.5rem' }}>
                <AnimatePresence mode="wait">
                    {/* Step 1: Names and Identification */}
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <h3 className="form-section-title"><User size={20} /> Sujeto de Operación ({type === 'personal' ? 'Titular' : 'Representante Legal'})</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div>
                                    <label className="input-label">Nombres Completos</label>
                                    <input value={type === 'personal' ? formData.first_names : formData.legal_rep_first_names}
                                        onChange={e => setFormData({ ...formData, [type === 'personal' ? 'first_names' : 'legal_rep_first_names']: e.target.value })}
                                        placeholder="Ej: Juan Antonio" />
                                </div>
                                <div>
                                    <label className="input-label">Apellidos Completos</label>
                                    <input value={type === 'personal' ? formData.last_names : formData.legal_rep_last_names}
                                        onChange={e => setFormData({ ...formData, [type === 'personal' ? 'last_names' : 'legal_rep_last_names']: e.target.value })}
                                        placeholder="Ej: Perez Garcia" />
                                </div>
                                <div>
                                    <label className="input-label">Número de Identificación (ID/DNI/Pasaporte)</label>
                                    <input value={type === 'personal' ? formData.id_number : formData.legal_rep_id_number}
                                        onChange={e => setFormData({ ...formData, [type === 'personal' ? 'id_number' : 'legal_rep_id_number']: e.target.value })}
                                        placeholder="Número de documento" />
                                </div>
                                <div className="input-group">
                                    <label>Identificación Tax (SSN/NIT/RUT)</label>
                                    <input placeholder="Requerido para Bridge.xyz" value={formData.tax_id} onChange={e => setFormData({ ...formData, tax_id: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label>Fecha de Expiración ID</label>
                                    <input type="date" value={formData.id_expiry} onChange={e => setFormData({ ...formData, id_expiry: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label>Teléfono de Contacto</label>
                                    <input placeholder="+1 234 567 890" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                                <div>
                                    <label className="input-label">Fecha de Nacimiento</label>
                                    <input type="date" value={formData.dob} onChange={e => setFormData({ ...formData, dob: e.target.value })} />
                                </div>
                                <div>
                                    <label className="input-label">Nacionalidad</label>
                                    <input value={formData.nationality} onChange={e => setFormData({ ...formData, nationality: e.target.value })} placeholder="Ej: Dominicano" />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Address */}
                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <h3 className="form-section-title"><MapPin size={20} /> Dirección de Residencia Permanente</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div>
                                    <label className="input-label">Calle y Número / Edificio</label>
                                    <input value={formData.street} onChange={e => setFormData({ ...formData, street: e.target.value })} placeholder="Ej: Av. Winston Churchill 100" />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                    <div>
                                        <label className="input-label">Ciudad</label>
                                        <input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="Ej: Santo Domingo" />
                                    </div>
                                    <div>
                                        <label className="input-label">Estado / Provincia / Departamento</label>
                                        <input value={formData.state_province} onChange={e => setFormData({ ...formData, state_province: e.target.value })} placeholder="Ej: Distrito Nacional" />
                                    </div>
                                    <div>
                                        <label className="input-label">Código Postal</label>
                                        <input value={formData.postal_code} onChange={e => setFormData({ ...formData, postal_code: e.target.value })} placeholder="Ej: 10101" />
                                    </div>
                                    <div>
                                        <label className="input-label">País</label>
                                        <input value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} placeholder="Ej: República Dominicana" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 3: Economic Context */}
                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <h3 className="form-section-title"><Briefcase size={20} /> Perfil Económico y Ocupacional</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div>
                                    <label className="input-label">Ocupación / Profesión</label>
                                    <input value={formData.occupation} onChange={e => setFormData({ ...formData, occupation: e.target.value })} placeholder="Ej: Ingeniero de Software, Comerciante" />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                    <div>
                                        <label className="input-label">Origen de los Fondos</label>
                                        <select value={formData.source_of_funds} onChange={e => setFormData({ ...formData, source_of_funds: e.target.value })}>
                                            <option value="">Seleccionar...</option>
                                            <option value="salary">Salario / Empleado</option>
                                            <option value="business">Ingresos de Negocio Propio</option>
                                            <option value="investments">Inversiones / Dividendos</option>
                                            <option value="inheritance">Herencia / Ahorros</option>
                                            <option value="other">Otros</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="input-label">Volumen Mensual Estimado (USD)</label>
                                        <input type="number" value={formData.estimated_monthly_volume} onChange={e => setFormData({ ...formData, estimated_monthly_volume: e.target.value })} placeholder="0.00" />
                                    </div>
                                </div>
                                <div>
                                    <label className="input-label"><Target size={16} /> Propósito de Uso de la Plataforma</label>
                                    <textarea
                                        value={formData.purpose}
                                        onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                                        placeholder="Ej: Documentación de operaciones internacionales, cumplimiento operativo, gestión de expedientes..."
                                        style={{ minHeight: '100px' }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 4: Documents (Personal) or Business Info (KYB) */}
                    {step === 4 && type === 'personal' && (
                        <motion.div key="step4per" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <h3 className="form-section-title"><Upload size={20} /> Documentación de Verificación</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div className="file-upload-card">
                                    <label className="input-label">Documento de Identidad (Frente)</label>
                                    <div className="upload-dropzone">
                                        <input type="file" onChange={e => handleFileChange(e, 'id_front')} />
                                        <div className="upload-content" style={{ color: files.id_front ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                            <Upload size={24} style={{ marginBottom: '0.5rem' }} />
                                            {files.id_front ? files.id_front.name : 'Subir foto del frente del documento'}
                                        </div>
                                    </div>
                                </div>
                                <div className="file-upload-card">
                                    <label className="input-label">Documento de Identidad (Reverso)</label>
                                    <div className="upload-dropzone">
                                        <input type="file" onChange={e => handleFileChange(e, 'id_back')} />
                                        <div className="upload-content" style={{ color: files.id_back ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                            <Upload size={24} style={{ marginBottom: '0.5rem' }} />
                                            {files.id_back ? files.id_back.name : 'Subir foto del reverso del documento'}
                                        </div>
                                    </div>
                                </div>
                                <div className="file-upload-card">
                                    <label className="input-label">Prueba de Dirección (Recibo de luz, agua, banco - Máx 3 meses)</label>
                                    <div className="upload-dropzone">
                                        <input type="file" onChange={e => handleFileChange(e, 'proof_of_address')} />
                                        <div className="upload-content" style={{ color: files.proof_of_address ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                            <Upload size={24} style={{ marginBottom: '0.5rem' }} />
                                            {files.proof_of_address ? files.proof_of_address.name : 'Subir comprobante de domicilio'}
                                        </div>
                                    </div>
                                </div>
                                <div className="file-upload-card">
                                    <label className="input-label">Selfie con su Documento</label>
                                    <div className="upload-dropzone">
                                        <input type="file" onChange={e => handleFileChange(e, 'selfie')} />
                                        <div className="upload-content" style={{ color: files.selfie ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                            <Upload size={24} style={{ marginBottom: '0.5rem' }} />
                                            {files.selfie ? files.selfie.name : 'Subir selfie clara con el documento en la mano'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 4 Business Specific: Company Details */}
                    {step === 4 && type === 'business' && (
                        <motion.div key="step4bus" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <h3 className="form-section-title"><Building2 size={20} /> Información de la Empresa</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div style={{ gridColumn: '1/-1' }}>
                                    <label className="input-label">Nombre Legal de la Empresa / Razón Social</label>
                                    <input value={formData.company_legal_name} onChange={e => setFormData({ ...formData, company_legal_name: e.target.value })} placeholder="Ej: Importaciones Guira S.R.L" />
                                </div>
                                <div>
                                    <label className="input-label">Número de Registro Fiscal / RNC / Tax ID</label>
                                    <input value={formData.registration_number} onChange={e => setFormData({ ...formData, registration_number: e.target.value })} placeholder="Número oficial" />
                                </div>
                                <div>
                                    <label className="input-label">País de Incorporación</label>
                                    <input value={formData.country_of_incorporation} onChange={e => setFormData({ ...formData, country_of_incorporation: e.target.value })} placeholder="Ej: Panamá" />
                                </div>
                                <div>
                                    <label className="input-label">Tipo de Entidad</label>
                                    <select value={formData.entity_type} onChange={e => setFormData({ ...formData, entity_type: e.target.value })}>
                                        <option value="">Seleccionar...</option>
                                        <option value="LLC">LLC / S.R.L</option>
                                        <option value="CORP">Corporación / S.A.</option>
                                        <option value="PARTNERSHIP">Sociedad</option>
                                        <option value="NON_PROFIT">Sin Fines de Lucro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="input-label">Fecha de Incorporación</label>
                                    <input type="date" value={formData.incorporation_date} onChange={e => setFormData({ ...formData, incorporation_date: e.target.value })} />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 5 Business Specific: UBOs and Docs */}
                    {step === 5 && type === 'business' && (
                        <motion.div key="step5bus" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <h3 className="form-section-title"><Users size={20} /> Beneficiarios Finales (dueños de más de 25%)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                                {formData.ubos?.map((ubo: any, idx: number) => (
                                    <div key={idx} style={{ padding: '1.5rem', background: '#F8FAFC', borderRadius: '16px', border: '1px solid var(--border)', position: 'relative' }}>
                                        <button onClick={() => removeUBO(idx)} style={{ position: 'absolute', top: '15px', right: '15px', color: 'var(--error)', background: 'none' }}>
                                            <Trash2 size={16} />
                                        </button>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <input placeholder="Nombre Completo" value={ubo.first_names} onChange={e => {
                                                const newUbos = [...formData.ubos]; newUbos[idx].first_names = e.target.value; setFormData({ ...formData, ubos: newUbos })
                                            }} />
                                            <input placeholder="Apellidos Completos" value={ubo.last_names} onChange={e => {
                                                const newUbos = [...formData.ubos]; newUbos[idx].last_names = e.target.value; setFormData({ ...formData, ubos: newUbos })
                                            }} />
                                            <input placeholder="% de Propiedad" value={ubo.percentage} onChange={e => {
                                                const newUbos = [...formData.ubos]; newUbos[idx].percentage = e.target.value; setFormData({ ...formData, ubos: newUbos })
                                            }} />
                                            <input placeholder="Nacionalidad" value={ubo.nationality} onChange={e => {
                                                const newUbos = [...formData.ubos]; newUbos[idx].nationality = e.target.value; setFormData({ ...formData, ubos: newUbos })
                                            }} />
                                        </div>
                                    </div>
                                ))}
                                <button onClick={addUBO} className="btn-secondary" style={{ border: '1px dashed var(--border)', background: 'transparent', padding: '1rem' }}>
                                    <Plus size={18} /> Agregar Beneficiario Final
                                </button>
                            </div>

                            <h3 className="form-section-title"><Upload size={20} /> Documentos Legales de la Empresa</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div className="file-upload-card">
                                    <label className="input-label">Certificado de Incorporación / Registro Mercantil</label>
                                    <div className="upload-dropzone">
                                        <input type="file" onChange={e => handleFileChange(e, 'company_cert')} />
                                        <div className="upload-content" style={{ color: files.company_cert ? 'var(--secondary)' : 'var(--text-muted)' }}>
                                            <Upload size={24} style={{ marginBottom: '0.5rem' }} />
                                            {files.company_cert ? files.company_cert.name : 'Subir documento constitutivo'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {error && <div className="error-message" style={{ background: 'rgba(239, 68, 68, 0.05)', color: 'var(--error)', padding: '1rem', borderRadius: '12px', marginTop: '1.5rem', textAlign: 'center', fontWeight: 600 }}>{error}</div>}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
                    {step > 1 && (
                        <button onClick={() => setStep(step - 1)} className="btn-secondary" style={{ flex: 1 }}>
                            Anterior
                        </button>
                    )}

                    <button onClick={saveDraft} disabled={saving} className="btn-secondary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        {saving ? 'Guardando...' : <><Save size={18} /> Guardar Borrador</>}
                    </button>

                    {step < stepsCount ? (
                        <button onClick={() => setStep(step + 1)} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            Continuar <ChevronRight size={18} />
                        </button>
                    ) : (
                        <button onClick={handleSubmit} disabled={loading} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            {loading ? 'Procesando...' : <><Send size={18} /> Enviar Documentación</>}
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                .input-label { display: block; font-size: 0.75rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.025em; }
                .file-upload-card { display: flex; flex-direction: column; gap: 0.5rem; }
                .upload-dropzone { position: relative; width: 100%; height: 80px; }
                .upload-dropzone input { opacity: 0; position: absolute; inset: 0; cursor: pointer; z-index: 2; width: 100%; height: 100%; }
                .upload-content { position: absolute; inset: 0; border: 2px dashed var(--border); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.8rem; z-index: 1; transition: all 0.2s; background: var(--bg-main); }
                .upload-dropzone:hover .upload-content { border-color: var(--secondary); background: rgba(0, 82, 255, 0.02); }
                .loading-spinner { font-weight: 600; color: var(--secondary); }
            `}</style>
        </div>
    )
}
