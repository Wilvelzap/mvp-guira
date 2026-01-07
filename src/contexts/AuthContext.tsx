import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

interface AuthContextType {
    session: Session | null
    user: User | null
    profile: Profile | null
    loading: boolean
    isRecovering: boolean
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null)
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [isRecovering, setIsRecovering] = useState(false)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) fetchProfile(session.user.id)
            else setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)

            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) fetchProfile(session.user.id)
            else {
                setProfile(null)
                setLoading(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const fetchProfile = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle()

            if (error) throw error
            if (data) setProfile(data)
        } catch (error) {
            console.error('Error fetching profile:', error)
        } finally {
            setLoading(false)
        }
    }

    const signOut = async () => {
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider value={{ session, user, profile, loading, isRecovering, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
