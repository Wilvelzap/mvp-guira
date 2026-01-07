import { supabase } from './supabase'

export type OrderType = 'BO_TO_WORLD' | 'WORLD_TO_BO' | 'US_TO_WALLET' | 'CRYPTO_TO_CRYPTO'
export type ProcessingRail = 'ACH' | 'SWIFT' | 'PSAV' | 'DIGITAL_NETWORK'
export type OrderStatus = 'created' | 'waiting_deposit' | 'deposit_received' | 'processing' | 'sent' | 'completed' | 'failed'

export interface PaymentOrder {
    id: string
    user_id: string
    order_type: OrderType
    processing_rail: ProcessingRail
    amount_origin: number
    origin_currency: string
    amount_converted: number | null
    destination_currency: string
    exchange_rate_applied: number | null
    fee_total: number
    status: OrderStatus
    beneficiary_id: string | null
    metadata: any
    evidence_url: string | null
    staff_comprobante_url: string | null
    created_at: string
    updated_at: string
}

export interface CreateOrderParams {
    userId: string
    orderType: OrderType
    rail: ProcessingRail
    amountOrigin: number
    originCurrency: string
    destinationCurrency: string
    beneficiaryId?: string
    amountConverted?: number
    exchangeRate?: number
    feeTotal?: number
    metadata?: any
}

export async function createPaymentOrder(params: CreateOrderParams) {
    const { data, error } = await supabase
        .from('payment_orders')
        .insert({
            user_id: params.userId,
            order_type: params.orderType,
            processing_rail: params.rail,
            amount_origin: params.amountOrigin,
            origin_currency: params.originCurrency,
            destination_currency: params.destinationCurrency,
            beneficiary_id: params.beneficiaryId,
            amount_converted: params.amountConverted,
            exchange_rate_applied: params.exchangeRate,
            fee_total: params.feeTotal || 0,
            metadata: params.metadata || {},
            status: 'created'
        })
        .select()
        .maybeSingle()

    return { data, error }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, metadataUpdates?: any) {
    const { data: current } = await supabase
        .from('payment_orders')
        .select('metadata')
        .eq('id', orderId)
        .maybeSingle()

    const newMetadata = { ...(current?.metadata || {}), ...metadataUpdates }

    const { data, error } = await supabase
        .from('payment_orders')
        .update({ status, metadata: newMetadata, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
        .maybeSingle()

    return { data, error }
}

export async function uploadOrderEvidence(orderId: string, file: File, column: 'evidence_url' | 'staff_comprobante_url') {
    const fileExt = (file.name || '').split('.').pop()
    const fileName = `${orderId}/${column}_${Math.random()}.${fileExt}`
    const filePath = `evidences/${fileName}`

    const { error: uploadError } = await supabase.storage
        .from('order-evidences')
        .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
        .from('order-evidences')
        .getPublicUrl(filePath)

    const { error: updateError } = await supabase
        .from('payment_orders')
        .update({ [column]: publicUrl })
        .eq('id', orderId)

    return { publicUrl, error: updateError }
}
