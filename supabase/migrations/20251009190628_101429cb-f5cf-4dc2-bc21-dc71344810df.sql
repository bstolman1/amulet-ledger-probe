-- Create CIPs table
CREATE TABLE public.cips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cip_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  vote_start_date DATE,
  vote_close_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create SV votes table
CREATE TABLE public.sv_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cip_id UUID NOT NULL REFERENCES public.cips(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  email TEXT NOT NULL,
  contact TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  vote TEXT CHECK (vote IN ('yes', 'no', 'abstain', '')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create committee votes table
CREATE TABLE public.committee_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cip_id UUID NOT NULL REFERENCES public.cips(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  email TEXT NOT NULL,
  contact TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  vote TEXT CHECK (vote IN ('yes', 'no', 'abstain', '')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create featured app votes table
CREATE TABLE public.featured_app_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cip_id UUID NOT NULL REFERENCES public.cips(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  description TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.cips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sv_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_app_votes ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (anyone can view votes)
CREATE POLICY "Public can view CIPs"
  ON public.cips FOR SELECT
  USING (true);

CREATE POLICY "Public can view SV votes"
  ON public.sv_votes FOR SELECT
  USING (true);

CREATE POLICY "Public can view committee votes"
  ON public.committee_votes FOR SELECT
  USING (true);

CREATE POLICY "Public can view featured app votes"
  ON public.featured_app_votes FOR SELECT
  USING (true);

-- Create policies for insert/update (will add role-based restriction later)
CREATE POLICY "Admins can insert CIPs"
  ON public.cips FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update CIPs"
  ON public.cips FOR UPDATE
  USING (true);

CREATE POLICY "Admins can insert SV votes"
  ON public.sv_votes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update SV votes"
  ON public.sv_votes FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete SV votes"
  ON public.sv_votes FOR DELETE
  USING (true);

CREATE POLICY "Admins can insert committee votes"
  ON public.committee_votes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update committee votes"
  ON public.committee_votes FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete committee votes"
  ON public.committee_votes FOR DELETE
  USING (true);

CREATE POLICY "Admins can insert featured app votes"
  ON public.featured_app_votes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update featured app votes"
  ON public.featured_app_votes FOR UPDATE
  USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_cips_updated_at
  BEFORE UPDATE ON public.cips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sv_votes_updated_at
  BEFORE UPDATE ON public.sv_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_committee_votes_updated_at
  BEFORE UPDATE ON public.committee_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_featured_app_votes_updated_at
  BEFORE UPDATE ON public.featured_app_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();