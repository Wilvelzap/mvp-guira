import { supabase } from './supabase'
import { getFeeConfig, calculateFee } from './fees'

export type TransferKind = 'wallet_to_wallet' | 'wallet_to_external_crypto' | 'wallet_to_external_bank' | 'virtual_account_to_wallet'
export type BusinessPurpose = 'supplier_payment' | 'client_withdrawal' | 'funding' | 'liquidation' | 'internal'

export interface CreateTransferParams {
    userId: string
    amount: number
    currency: string
    kind: TransferKind
    purpose: BusinessPurpose
    idempotencyKey: string
    destinationId?: string
    destinationType?: 'wallet' | 'external_account' | 'external_crypto_address'
    network?: string
    exchangeRate?: number
}

/**
 * Orchestrates a transfer following Bridge.xyz senior architecture rules.
 * 1. Pre-validation (Balance, KYC, Destination)
 * 2. Idempotency check 
 * 3. Atomic creation of Transfer record
 */
export async function createBridgeTransfer(params: CreateTransferParams) {
    const { userId, amount, currency, kind, purpose, idempotencyKey } = params

    // 1. Pre-validations
    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('onboarding_status, bridge_customer_id')
        .eq('id', userId)
        .single()

    if (profileErr || !profile) throw new Error('Usuario no encontrado o perfil incompleto')
    if (profile.onboarding_status !== 'verified') {
        throw new Error('El usuario debe estar verificado (KYC Approved) para operar')
    }

    // 2. Idempotency Check
    const { data: existing } = await supabase
        .from('bridge_transfers')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single()

    if (existing) {
        console.log('Transferencia existente encontrada (Idempotencia):', existing.id)
        return { data: existing, error: null }
    }

    // 3. Balance Validation (Only for outgoing transfers from wallet)
    if (kind.startsWith('wallet_to_')) {
        const { data: wallet } = await supabase
            .from('wallets')
            .select('id')
            .eq('user_id', userId)
            .single()

        if (!wallet) throw new Error('Billetera no encontrada')

        const { data: entries } = await supabase
            .from('ledger_entries')
            .select('amount, type')
            .eq('wallet_id', wallet.id)

        const currentBalance = (entries || []).reduce((acc, curr) => {
            return curr.type === 'deposit' ? acc + Number(curr.amount) : acc - Number(curr.amount)
        }, 0)

        if (currentBalance < amount) {
            throw new Error('Saldo insuficiente para realizar esta operación')
        }
    }

    // 4. Calculate Fees
    let feeAmount = 0
    if (purpose === 'supplier_payment' || purpose === 'client_withdrawal') {
        const feeConfig = await getFeeConfig('supplier_payment')
        if (feeConfig) {
            feeAmount = calculateFee(amount, feeConfig)
        }
    }

    const netAmount = amount - feeAmount
    const exchangeRate = params.exchangeRate || 1

    // 5. Create Transfer Record (Optimistic state: 'created' or 'pending')
    const { data: transfer, error: transferErr } = await supabase
        .from('bridge_transfers')
        .insert({
            user_id: userId,
            idempotency_key: idempotencyKey,
            transfer_kind: kind,
            business_purpose: purpose,
            amount,
            currency,
            status: 'pending', // Bridge usually starts as pending/created
            destination_type: params.destinationType,
            destination_id: params.destinationId,
            fee_amount: feeAmount,
            net_amount: netAmount,
            exchange_rate: exchangeRate,
            metadata: {
                system: 'guira-bridge-v1',
                network: params.network,
                timestamp: new Date().toISOString()
            }
        })
        .select()
        .single()

    return { data: transfer, error: transferErr }
}

/**
 * Persists Virtual Account Events for full traceability.
 */
export async function logVirtualAccountEvent(bridgeEventId: string, vaId: string, type: string, amount: number, currency: string, payload: any) {
    await supabase.from('bridge_virtual_account_events').upsert({
        bridge_event_id: bridgeEventId,
        bridge_virtual_account_id: vaId,
        event_type: type,
        amount,
        currency,
        raw_payload: payload
    })
}
