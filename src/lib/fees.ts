import { supabase } from './supabase'

export type FeeType = 'route_creation' | 'supplier_payment'

export interface FeeConfig {
    id: string
    type: FeeType
    fee_type: 'fixed' | 'percentage'
    value: number
    currency: string
}

export async function getFeeConfig(type: FeeType): Promise<FeeConfig | null> {
    const { data, error } = await supabase
        .from('fees_config')
        .select('*')
        .eq('type', type)
        .single()

    if (error) {
        console.error('Error fetching fee config:', error)
        return null
    }

    return data
}

export function calculateFee(amount: number, config: FeeConfig): number {
    if (config.fee_type === 'fixed') {
        return config.value
    } else {
        return (amount * config.value) / 100
    }
}
