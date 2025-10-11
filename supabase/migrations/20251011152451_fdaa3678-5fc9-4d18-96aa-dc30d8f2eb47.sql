-- Create role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table to manage user permissions
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update committee_votes RLS policies
DROP POLICY IF EXISTS "Public can view committee votes" ON public.committee_votes;
DROP POLICY IF EXISTS "Admins can insert committee votes" ON public.committee_votes;
DROP POLICY IF EXISTS "Admins can update committee votes" ON public.committee_votes;
DROP POLICY IF EXISTS "Admins can delete committee votes" ON public.committee_votes;

CREATE POLICY "Only admins can view committee votes"
ON public.committee_votes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert committee votes"
ON public.committee_votes
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update committee votes"
ON public.committee_votes
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete committee votes"
ON public.committee_votes
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update featured_app_committee_votes RLS policies
DROP POLICY IF EXISTS "Public can view featured app committee votes" ON public.featured_app_committee_votes;
DROP POLICY IF EXISTS "Admins can insert featured app committee votes" ON public.featured_app_committee_votes;
DROP POLICY IF EXISTS "Admins can update featured app committee votes" ON public.featured_app_committee_votes;
DROP POLICY IF EXISTS "Admins can delete featured app committee votes" ON public.featured_app_committee_votes;

CREATE POLICY "Only admins can view featured app committee votes"
ON public.featured_app_committee_votes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert featured app committee votes"
ON public.featured_app_committee_votes
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update featured app committee votes"
ON public.featured_app_committee_votes
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete featured app committee votes"
ON public.featured_app_committee_votes
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update sv_votes RLS policies
DROP POLICY IF EXISTS "Public can view SV votes" ON public.sv_votes;
DROP POLICY IF EXISTS "Admins can insert SV votes" ON public.sv_votes;
DROP POLICY IF EXISTS "Admins can update SV votes" ON public.sv_votes;
DROP POLICY IF EXISTS "Admins can delete SV votes" ON public.sv_votes;

CREATE POLICY "Only admins can view SV votes"
ON public.sv_votes
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert SV votes"
ON public.sv_votes
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update SV votes"
ON public.sv_votes
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete SV votes"
ON public.sv_votes
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update other tables with weak admin policies
DROP POLICY IF EXISTS "Admins can insert CIP types" ON public.cip_types;
DROP POLICY IF EXISTS "Admins can update CIP types" ON public.cip_types;
DROP POLICY IF EXISTS "Admins can delete CIP types" ON public.cip_types;

CREATE POLICY "Only admins can insert CIP types"
ON public.cip_types
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update CIP types"
ON public.cip_types
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete CIP types"
ON public.cip_types
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert CIPs" ON public.cips;
DROP POLICY IF EXISTS "Admins can update CIPs" ON public.cips;

CREATE POLICY "Only admins can insert CIPs"
ON public.cips
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update CIPs"
ON public.cips
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert featured app votes" ON public.featured_app_votes;
DROP POLICY IF EXISTS "Admins can update featured app votes" ON public.featured_app_votes;

CREATE POLICY "Only admins can insert featured app votes"
ON public.featured_app_votes
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update featured app votes"
ON public.featured_app_votes
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));