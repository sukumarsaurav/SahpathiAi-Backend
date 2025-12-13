-- Fix Infinite Recursion in Users Table RLS
-- The previous policy caused infinite recursion because checking if a user is an admin 
-- required querying the users table, which triggered the policy again.

-- 1. Create a secure function to fetch the current user's role without triggering RLS.
-- SECURITY DEFINER ensures the function runs with the privileges of the creator (postgres/superuser), bypassing RLS.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- 2. Drop the problematic recursive policy
DROP POLICY IF EXISTS admin_all_policy ON public.users;

-- 3. Re-create the policy using the secure function
CREATE POLICY admin_all_policy ON public.users FOR ALL USING (
  get_my_role() IN ('admin', 'content_manager')
);

-- 4. Also update other admin policies to use this function for better performance/safety (Optional but good practice)
-- We'll just stick to fixing the error for now to avoid side effects, but this function can be used elsewhere.
