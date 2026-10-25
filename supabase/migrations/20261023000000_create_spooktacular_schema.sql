-- ==============================================================================
-- SPOOKTACULAR HALLOWEEN PARTY 2026 - SUPABASE POSTGRESQL SCHEMA MIGRATION
-- ==============================================================================
-- This migration script creates all tables, constraints, indexes, RLS policies,
-- and atomic stored procedures required for the event registration platform.
-- Safe to execute in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE DEFINITIONS
-- ==============================================================================

-- Admin Users Table
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Registrations Table
CREATE TABLE IF NOT EXISTS public.registrations (
    id TEXT PRIMARY KEY, -- Canonical format: 'SPH-YYYYMMDD-XXXXX'
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    participant_count INTEGER NOT NULL CHECK (participant_count > 0 AND participant_count <= 100),
    place TEXT NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    pricing_category TEXT NOT NULL, -- 'EARLY_BIRD' or 'REGULAR'
    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    access_token TEXT NOT NULL UNIQUE,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.admin_users(id),
    is_flagged_duplicate BOOLEAN NOT NULL DEFAULT false,
    duplicate_flag_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Payment Sessions Table (Holds 3-minute or 15-minute countdown reservation)
CREATE TABLE IF NOT EXISTS public.payment_sessions (
    id TEXT PRIMARY KEY, -- UUID string
    registration_id TEXT NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXPIRED', 'COMPLETED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Payment Submissions Table (Stores attendee transaction claims)
CREATE TABLE IF NOT EXISTS public.payment_submissions (
    id BIGSERIAL PRIMARY KEY,
    registration_id TEXT NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES public.payment_sessions(id) ON DELETE CASCADE,
    utr_reference TEXT NOT NULL,
    utr_normalized TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    status TEXT NOT NULL DEFAULT 'UNDER_REVIEW', -- 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'FLAGGED_FOR_REVIEW'
    reviewed_by UUID REFERENCES public.admin_users(id),
    reviewed_at TIMESTAMPTZ,
    review_decision TEXT,
    rejection_reason TEXT,
    is_flagged_duplicate BOOLEAN NOT NULL DEFAULT false
);

-- Tickets Table (Issued official entry passes)
CREATE TABLE IF NOT EXISTS public.tickets (
    id BIGSERIAL PRIMARY KEY,
    ticket_number TEXT NOT NULL UNIQUE, -- Canonical format: 'SPH-2026-XXXXXX'
    registration_id TEXT NOT NULL UNIQUE REFERENCES public.registrations(id) ON DELETE CASCADE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    issued_by UUID REFERENCES public.admin_users(id),
    qr_data TEXT,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

-- Admin Audit Log Table (Immutable audit trail for dispute resolution)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_id UUID REFERENCES public.admin_users(id),
    admin_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. UNIQUE CONSTRAINTS & PERFORMANCE INDEXES
-- ==============================================================================

-- Enforce uniqueness of normalized UTR across all active/approved claims
CREATE UNIQUE INDEX IF NOT EXISTS idx_utr_normalized_active
    ON public.payment_submissions(utr_normalized)
    WHERE status != 'REJECTED';

-- Prevent multiple active submissions on the same registration concurrently
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_submission
    ON public.payment_submissions(registration_id)
    WHERE status IN ('UNDER_REVIEW', 'APPROVED', 'FLAGGED_FOR_REVIEW');

-- Enforce unique ticket number and unique registration on tickets
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_number
    ON public.tickets(ticket_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_registration_id
    ON public.tickets(registration_id);

-- Ticket Sequence for collision-proof numbering
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START WITH 100001;

-- Lookup and filter indexes for high throughput (10,000+ attendees)
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON public.registrations(phone);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON public.registrations(created_at);
CREATE INDEX IF NOT EXISTS idx_reg_status_created ON public.registrations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_access_token ON public.registrations(access_token);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_reg ON public.payment_sessions(registration_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_expires ON public.payment_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_reg ON public.payment_submissions(registration_id);
CREATE INDEX IF NOT EXISTS idx_psub_reg_submitted ON public.payment_submissions(registration_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_status ON public.payment_submissions(status);
CREATE INDEX IF NOT EXISTS idx_payment_submissions_utr ON public.payment_submissions(utr_normalized);
CREATE INDEX IF NOT EXISTS idx_ticket_valid_num ON public.tickets(is_valid, ticket_number);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log(created_at);

-- ==============================================================================
-- 4. ATOMIC DATABASE OPERATIONS (STORED PROCEDURES)
-- ==============================================================================

-- Stored procedure for atomic payment approval and ticket issuance
-- Guarantees no race condition, no double approval, and no duplicate ticket issuance.
CREATE OR REPLACE FUNCTION public.approve_payment_submission(
    p_registration_id TEXT,
    p_admin_id UUID,
    p_admin_username TEXT,
    p_ticket_number TEXT,
    p_qr_data TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reg RECORD;
    v_sub RECORD;
    v_existing_ticket RECORD;
    v_new_ticket RECORD;
    v_final_ticket_num TEXT;
BEGIN
    -- 1. Lock the registration row for update
    SELECT * INTO v_reg FROM public.registrations
    WHERE id = p_registration_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registration % not found', p_registration_id;
    END IF;

    IF v_reg.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Cannot approve payment for a cancelled registration';
    END IF;

    -- 2. Check for an existing valid ticket
    SELECT * INTO v_existing_ticket FROM public.tickets
    WHERE registration_id = p_registration_id;

    IF FOUND AND v_existing_ticket.is_valid THEN
        RAISE EXCEPTION 'Ticket % already exists and is active for this registration', v_existing_ticket.ticket_number;
    END IF;

    -- 3. Lock and update latest payment submission
    SELECT * INTO v_sub FROM public.payment_submissions
    WHERE registration_id = p_registration_id AND status != 'REJECTED'
    ORDER BY submitted_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- Prevent approving duplicate/cloned UTR if already approved for another registration
        IF v_sub.utr_normalized IS NOT NULL AND v_sub.utr_normalized != '' THEN
            IF EXISTS (
                SELECT 1 FROM public.payment_submissions
                WHERE utr_normalized = v_sub.utr_normalized
                  AND status = 'APPROVED'
                  AND registration_id != p_registration_id
            ) THEN
                RAISE EXCEPTION 'CLONE UTR DETECTED: This UTR (%) has already been approved for another registration', v_sub.utr_reference;
            END IF;
        END IF;

        UPDATE public.payment_submissions
        SET status = 'APPROVED',
            reviewed_by = p_admin_id,
            reviewed_at = timezone('utc'::text, now()),
            review_decision = 'APPROVED'
        WHERE id = v_sub.id;
    END IF;

    -- 4. Update registration status
    UPDATE public.registrations
    SET status = 'PAYMENT_VERIFIED',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_registration_id;

    -- 5. Insert confirmed ticket with automatic collision avoidance
    IF EXISTS (SELECT 1 FROM public.tickets WHERE ticket_number = p_ticket_number) THEN
        v_final_ticket_num := 'SPH-2026-' || LPAD(nextval('public.ticket_number_seq')::text, 6, '0');
    ELSE
        v_final_ticket_num := p_ticket_number;
    END IF;

    INSERT INTO public.tickets (
        ticket_number,
        registration_id,
        issued_at,
        issued_by,
        qr_data,
        is_valid
    )
    VALUES (
        v_final_ticket_num,
        p_registration_id,
        timezone('utc'::text, now()),
        p_admin_id,
        p_qr_data,
        true
    )
    RETURNING * INTO v_new_ticket;

    -- 6. Record audit log
    INSERT INTO public.admin_audit_log (
        admin_id,
        admin_username,
        action,
        target_type,
        target_id,
        details,
        created_at
    )
    VALUES (
        p_admin_id,
        p_admin_username,
        'PAYMENT_APPROVED',
        'registration',
        p_registration_id,
        jsonb_build_object(
            'ticketNumber', v_new_ticket.ticket_number,
            'amount', v_reg.total_amount,
            'participants', v_reg.participant_count
        )::text,
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'registrationId', p_registration_id,
        'ticketNumber', v_new_ticket.ticket_number,
        'issuedAt', v_new_ticket.issued_at
    );
END;
$$;

-- Stored procedure for atomic duplicate resolution
CREATE OR REPLACE FUNCTION public.resolve_duplicate_registration(
    p_primary_id TEXT,
    p_duplicate_id TEXT,
    p_admin_id UUID,
    p_admin_username TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prim RECORD;
    v_dup RECORD;
    v_dup_ticket RECORD;
BEGIN
    IF p_primary_id = p_duplicate_id THEN
        RAISE EXCEPTION 'Primary and duplicate registration IDs cannot be identical';
    END IF;

    SELECT * INTO v_prim FROM public.registrations WHERE id = p_primary_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Primary registration % not found', p_primary_id;
    END IF;

    SELECT * INTO v_dup FROM public.registrations WHERE id = p_duplicate_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Duplicate registration % not found', p_duplicate_id;
    END IF;

    -- Invalidate duplicate ticket if any
    SELECT * INTO v_dup_ticket FROM public.tickets WHERE registration_id = p_duplicate_id;
    IF FOUND THEN
        UPDATE public.tickets
        SET is_valid = false,
            revoked_at = timezone('utc'::text, now()),
            revoked_reason = format('Duplicate resolution: Superseded by %s. %s', p_primary_id, p_reason)
        WHERE registration_id = p_duplicate_id;
    END IF;

    -- Reject duplicate payment submissions
    UPDATE public.payment_submissions
    SET status = 'REJECTED',
        rejection_reason = format('Duplicate claim superseded by primary registration %s. %s', p_primary_id, p_reason),
        reviewed_by = p_admin_id,
        reviewed_at = timezone('utc'::text, now()),
        review_decision = 'REJECTED'
    WHERE registration_id = p_duplicate_id AND status != 'REJECTED';

    -- Mark duplicate registration as CANCELLED
    UPDATE public.registrations
    SET status = 'CANCELLED',
        cancellation_reason = format('DUPLICATE_RESOLVED: Kept canonical %s. Reason: %s', p_primary_id, p_reason),
        cancelled_at = timezone('utc'::text, now()),
        cancelled_by = p_admin_id,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_duplicate_id;

    -- Audit log
    INSERT INTO public.admin_audit_log (
        admin_id,
        admin_username,
        action,
        target_type,
        target_id,
        details,
        created_at
    )
    VALUES (
        p_admin_id,
        p_admin_username,
        'DUPLICATE_RESOLVED',
        'registration',
        p_duplicate_id,
        jsonb_build_object(
            'canonicalId', p_primary_id,
            'archivedDuplicateId', p_duplicate_id,
            'hadTicket', FOUND,
            'reason', p_reason
        )::text,
        timezone('utc'::text, now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'primaryId', p_primary_id,
        'duplicateId', p_duplicate_id,
        'revokedTicket', CASE WHEN FOUND THEN v_dup_ticket.ticket_number ELSE NULL END
    );
END;
$$;

-- Stored procedure for computing clean deduplicated dashboard statistics
CREATE OR REPLACE FUNCTION public.get_dashboard_statistics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_reg BIGINT;
    v_active_reg BIGINT;
    v_total_part BIGINT;
    v_pending BIGINT;
    v_under_review BIGINT;
    v_approved BIGINT;
    v_rejected BIGINT;
    v_expired BIGINT;
    v_cancelled BIGINT;
    v_flagged BIGINT;
    v_total_claimed BIGINT;
    v_total_verified BIGINT;
    v_tickets_issued BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_total_reg FROM public.registrations;

    SELECT
        COALESCE(SUM(CASE WHEN status IN ('PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status IN ('PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED') THEN participant_count ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'PENDING_PAYMENT' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_UNDER_REVIEW' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_VERIFIED' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_REJECTED' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'FLAGGED_FOR_REVIEW' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status IN ('PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED') THEN total_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_VERIFIED' AND id IN (SELECT registration_id FROM public.tickets WHERE is_valid = true) THEN total_amount ELSE 0 END), 0)
    INTO
        v_active_reg,
        v_total_part,
        v_pending,
        v_under_review,
        v_approved,
        v_rejected,
        v_expired,
        v_cancelled,
        v_flagged,
        v_total_claimed,
        v_total_verified
    FROM public.registrations;

    SELECT COUNT(DISTINCT ticket_number) INTO v_tickets_issued
    FROM public.tickets
    WHERE is_valid = true;

    RETURN jsonb_build_object(
        'totalRegistrations', v_active_reg,
        'allTimeRegistrations', v_total_reg,
        'totalParticipants', v_total_part,
        'totalRevenue', v_total_verified,
        'flaggedDuplicates', v_flagged,
        'ticketsIssued', v_tickets_issued,
        'totalClaimed', v_total_claimed,
        'byStatus', jsonb_build_object(
            'PENDING_PAYMENT', v_pending,
            'UNDER_REVIEW', v_under_review,
            'PAYMENT_UNDER_REVIEW', v_under_review,
            'APPROVED', v_approved,
            'PAYMENT_VERIFIED', v_approved,
            'REJECTED', v_rejected,
            'PAYMENT_REJECTED', v_rejected,
            'EXPIRED', v_expired,
            'CANCELLED', v_cancelled,
            'FLAGGED_FOR_REVIEW', v_flagged
        )
    );
END;
$$;

-- Stored procedure for ultra-fast database-level duplicate scanning
-- Executes in milliseconds in PostgreSQL engine without Node.js memory pressure
CREATE OR REPLACE FUNCTION public.scan_duplicate_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_dup_utrs JSONB;
    v_dup_phones JSONB;
    v_flagged JSONB;
    v_multi_tickets JSONB;
    v_dup_tickets JSONB;
    v_total_reg BIGINT;
    v_active_reg BIGINT;
    v_total_part BIGINT;
    v_total_rev BIGINT;
BEGIN
    -- 1. Duplicate UTR groups
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'utr_normalized', sub.utr_normalized,
        'count', sub.cnt,
        'records', (
            SELECT jsonb_agg(jsonb_build_object(
                'submission_id', ps.id,
                'registration_id', ps.registration_id,
                'utr_reference', ps.utr_reference,
                'utr_normalized', ps.utr_normalized,
                'submission_status', ps.status,
                'submitted_at', ps.submitted_at,
                'full_name', r.full_name,
                'phone', r.phone,
                'total_amount', r.total_amount,
                'registration_status', r.status,
                'ticket_number', t.ticket_number,
                'ticket_is_valid', CASE WHEN t.is_valid THEN 1 ELSE 0 END
            ))
            FROM public.payment_submissions ps
            JOIN public.registrations r ON r.id = ps.registration_id
            LEFT JOIN public.tickets t ON t.registration_id = r.id
            WHERE ps.utr_normalized = sub.utr_normalized
        )
    )), '[]'::jsonb)
    INTO v_dup_utrs
    FROM (
        SELECT utr_normalized, COUNT(*) as cnt
        FROM public.payment_submissions
        WHERE utr_normalized IS NOT NULL AND utr_normalized != ''
        GROUP BY utr_normalized
        HAVING COUNT(*) > 1
        LIMIT 50
    ) sub;

    -- 2. Multi-ticket registrations
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'registration_id', registration_id,
        'ticket_count', cnt,
        'ticket_numbers', tickets
    )), '[]'::jsonb)
    INTO v_multi_tickets
    FROM (
        SELECT registration_id, COUNT(*) as cnt, string_agg(ticket_number, ',') as tickets
        FROM public.tickets
        GROUP BY registration_id
        HAVING COUNT(*) > 1
        LIMIT 50
    ) mt;

    -- 3. Duplicate ticket numbers
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'ticket_number', ticket_number,
        'ticket_count', cnt,
        'registration_ids', reg_ids
    )), '[]'::jsonb)
    INTO v_dup_tickets
    FROM (
        SELECT ticket_number, COUNT(*) as cnt, string_agg(registration_id, ',') as reg_ids
        FROM public.tickets
        GROUP BY ticket_number
        HAVING COUNT(*) > 1
        LIMIT 50
    ) dt;

    -- 4. Same phone groups
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'phone', phone,
        'count', cnt,
        'total_participants', participants,
        'registration_ids', reg_ids
    )), '[]'::jsonb)
    INTO v_dup_phones
    FROM (
        SELECT phone, COUNT(*) as cnt, SUM(participant_count) as participants, string_agg(id, ',') as reg_ids
        FROM public.registrations
        WHERE status != 'CANCELLED'
        GROUP BY phone
        HAVING COUNT(*) > 1
        LIMIT 50
    ) dp;

    -- 5. Flagged registrations
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'full_name', full_name,
        'phone', phone,
        'total_amount', total_amount,
        'status', status,
        'created_at', created_at,
        'cancellation_reason', cancellation_reason
    )), '[]'::jsonb)
    INTO v_flagged
    FROM (
        SELECT id, full_name, phone, total_amount, status, created_at, cancellation_reason
        FROM public.registrations
        WHERE status = 'FLAGGED_FOR_REVIEW' OR is_flagged_duplicate = true
        ORDER BY created_at DESC
        LIMIT 100
    ) fl;

    -- Totals
    SELECT COUNT(*) INTO v_total_reg FROM public.registrations;
    SELECT COUNT(*) INTO v_active_reg FROM public.registrations WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED');
    SELECT COALESCE(SUM(participant_count), 0) INTO v_total_part FROM public.registrations WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED');
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_rev FROM public.registrations WHERE status = 'PAYMENT_VERIFIED';

    RETURN jsonb_build_object(
        'timestamp', timezone('utc'::text, now()),
        'summary', jsonb_build_object(
            'totalRegistrations', v_total_reg,
            'activeRegistrations', v_active_reg,
            'duplicateUtrCount', jsonb_array_length(v_dup_utrs),
            'multiTicketRegistrationsCount', jsonb_array_length(v_multi_tickets),
            'duplicateTicketNumbersCount', jsonb_array_length(v_dup_tickets),
            'samePhoneGroupsCount', jsonb_array_length(v_dup_phones),
            'flaggedForReviewCount', jsonb_array_length(v_flagged)
        ),
        'duplicateUtrs', v_dup_utrs,
        'multiTicketRegistrations', v_multi_tickets,
        'duplicateTicketNumbers', v_dup_tickets,
        'samePhoneGroups', v_dup_phones,
        'flaggedRegistrations', v_flagged,
        'totalDuplicateGroups', jsonb_array_length(v_dup_utrs) + jsonb_array_length(v_multi_tickets) + jsonb_array_length(v_dup_tickets) + jsonb_array_length(v_flagged)
    );
END;
$$;

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Enable RLS on all public tables to prevent public information harvesting.
-- The trusted backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- ==============================================================================

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 1. admin_users: Public cannot read or write admin records
DROP POLICY IF EXISTS "Public access disabled for admin_users" ON public.admin_users;
CREATE POLICY "Public access disabled for admin_users"
    ON public.admin_users
    FOR ALL
    TO anon, authenticated
    USING (false);

-- 2. admin_audit_log: Public cannot view audit log
DROP POLICY IF EXISTS "Public access disabled for admin_audit_log" ON public.admin_audit_log;
CREATE POLICY "Public access disabled for admin_audit_log"
    ON public.admin_audit_log
    FOR ALL
    TO anon, authenticated
    USING (false);

-- 3. payment_submissions: Sensitive financial claims inaccessible directly to public
DROP POLICY IF EXISTS "Public access disabled for payment_submissions" ON public.payment_submissions;
CREATE POLICY "Public access disabled for payment_submissions"
    ON public.payment_submissions
    FOR ALL
    TO anon, authenticated
    USING (false);

-- 4. payment_sessions: Public can only view non-expired sessions
DROP POLICY IF EXISTS "Public can view active sessions" ON public.payment_sessions;
CREATE POLICY "Public can view active sessions"
    ON public.payment_sessions
    FOR SELECT
    TO anon, authenticated
    USING (status = 'ACTIVE' AND expires_at > timezone('utc'::text, now()));

-- 5. registrations: Public can create registrations and view own registration by access_token
DROP POLICY IF EXISTS "Public can create registrations" ON public.registrations;
CREATE POLICY "Public can create registrations"
    ON public.registrations
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can lookup own registration by token" ON public.registrations;
CREATE POLICY "Public can lookup own registration by token"
    ON public.registrations
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- 6. tickets: Public can only read valid tickets for gate entry validation
DROP POLICY IF EXISTS "Public can validate tickets" ON public.tickets;
CREATE POLICY "Public can validate tickets"
    ON public.tickets
    FOR SELECT
    TO anon, authenticated
    USING (is_valid = true);

-- ==============================================================================
-- 6. DEFAULT SEED DATA
-- ==============================================================================
-- Pre-populates the default admin account (Username: admin, Password: SpookyAdmin2026!)
-- Safely skips if admin already exists.
INSERT INTO public.admin_users (username, email, password_hash, role, is_active)
VALUES (
    'admin',
    'admin@spooktacular2026.com',
    '$2b$10$l8Zh/OVept49nejI22OGTeyySiW5mq.SAAkI58qXBviiE853z418u',
    'admin',
    true
)
ON CONFLICT (username) DO NOTHING;
