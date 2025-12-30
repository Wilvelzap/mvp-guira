import { supabase } from './supabase'

export const logActivity = async (userId: string, action: string, metadata: any = {}) => {
    try {
        const { error } = await supabase
            .from('activity_logs')
            .insert([{ user_id: userId, action, metadata }])

        if (error) throw error
    } catch (err) {
        console.error('Logging failed:', err)
    }
}
