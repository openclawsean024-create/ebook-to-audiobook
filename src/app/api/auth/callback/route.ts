import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Create profile for new user
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).single()
        if (!existing) {
          // Get plan from user metadata (set during registration)
          const plan = user.user_metadata?.plan || 'free'
          await supabase.from('profiles').insert({
            id: user.id,
            plan,
            characters_used: 0,
          })
        }
      }
      return Response.redirect(`${origin}${next}`)
    }
  }

  return Response.redirect(`${origin}/login?error=auth`)
}
