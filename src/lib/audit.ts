import { supabase } from './supabase'

export interface AuditLogEntry {
    performed_by: string
    role: 'staff' | 'admin'
    action: 'create' | 'update' | 'change_status' | 'logical_cancel'
    table_name: string
    record_id: string
    previous_values?: any
    new_values?: any
    reason?: string
    source?: 'ui' | 'api' | 'system'
}

/**
 * Registra una acción de auditoría en la base de datos.
 * Calcula el diferencial de los campos modificados para minimizar el ruido en los logs.
 */
export async function registerAuditLog(entry: AuditLogEntry) {
    const {
        performed_by,
        role,
        action,
        table_name,
        record_id,
        previous_values,
        new_values,
        reason,
        source = 'ui'
    } = entry

    // Validar motivo obligatorio para acciones distintas de 'create'
    if (action !== 'create' && (!reason || reason.trim().length < 5)) {
        throw new Error('El motivo de la modificación es obligatorio y debe ser descriptivo.')
    }

    let affected_fields: string[] = []
    let filtered_previous: any = {}
    let filtered_new: any = {}

    // Calcular diferencial si es una actualización
    if (action === 'update' && previous_values && new_values) {
        Object.keys(new_values).forEach(key => {
            if (JSON.stringify(previous_values[key]) !== JSON.stringify(new_values[key])) {
                affected_fields.push(key)
                filtered_previous[key] = previous_values[key]
                filtered_new[key] = new_values[key]
            }
        })

        // Si no hay cambios reales, no registrar log (Auditoría Semántica)
        if (affected_fields.length === 0) return null
    } else {
        // Para create o change_status, podemos guardar el objeto parcial enviado
        filtered_new = new_values
        filtered_previous = previous_values
        affected_fields = new_values ? Object.keys(new_values) : []
    }

    const { error } = await supabase.from('audit_logs').insert({
        performed_by,
        role,
        action,
        table_name,
        record_id,
        affected_fields,
        previous_values: action === 'update' ? filtered_previous : previous_values,
        new_values: action === 'update' ? filtered_new : new_values,
        reason,
        source
    })

    if (error) {
        console.error('Error al registrar auditoría:', error)
        throw error
    }

    return true
}
