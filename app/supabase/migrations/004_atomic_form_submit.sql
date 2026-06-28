-- ============================================================
-- 004_atomic_form_submit.sql
-- Atomic form submission: prevents double-submit race condition
-- by locking the order row (SELECT ... FOR UPDATE) and checking
-- form_submitted in a single transaction.
-- ============================================================

-- Function: submit_order_form(p_token, p_form_data, p_user_id)
-- Returns: updated order row (or raises exception)
CREATE OR REPLACE FUNCTION submit_order_form(
  p_token      UUID,
  p_form_data  JSONB,
  p_user_id    UUID DEFAULT NULL
)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order            orders%ROWTYPE;
  v_approval_status  UUID;
  v_draft_status     UUID;
  v_old_status_id    UUID;
  v_current_index    INTEGER;
BEGIN
  -- ============================================================
  -- 1. Lock the order row to prevent concurrent form submissions
  -- ============================================================
  SELECT * INTO v_order
  FROM orders
  WHERE form_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORM_NOT_FOUND';
  END IF;

  -- ============================================================
  -- 2. Reject if already submitted (belt AND suspenders)
  -- ============================================================
  IF v_order.form_submitted THEN
    RAISE EXCEPTION 'FORM_ALREADY_SUBMITTED';
  END IF;

  -- ============================================================
  -- 3. Update order with form data
  -- ============================================================
  UPDATE orders
  SET
    event_date          = COALESCE((p_form_data->>'event_date')::DATE, event_date),
    approval_date       = COALESCE((p_form_data->>'approval_date')::DATE, approval_date),
    format              = COALESCE(p_form_data->>'format', format),
    theme               = COALESCE(p_form_data->>'theme', theme),
    guest_count         = COALESCE((p_form_data->>'guest_count')::INTEGER, guest_count),
    service_rounds      = COALESCE((p_form_data->>'service_rounds')::INTEGER, service_rounds),
    start_time          = COALESCE((p_form_data->>'start_time')::TIME, start_time),
    end_time            = COALESCE((p_form_data->>'end_time')::TIME, end_time),
    waiter_arrival      = COALESCE((p_form_data->>'waiter_arrival')::TIME, waiter_arrival),
    equipment_delivery  = COALESCE(p_form_data->>'equipment_delivery', equipment_delivery),
    tables_ready        = COALESCE((p_form_data->>'tables_ready')::TIME, tables_ready),
    address             = COALESCE(p_form_data->>'address', address),
    access_system       = COALESCE(p_form_data->>'access_system', access_system),
    floor               = COALESCE(p_form_data->>'floor', floor),
    entry_map           = COALESCE(p_form_data->>'entry_map', entry_map),
    electricity         = COALESCE(p_form_data->>'electricity', electricity),
    tables_info         = COALESCE(p_form_data->>'tables_info', tables_info),
    utility_room        = COALESCE(p_form_data->>'utility_room', utility_room),
    banner              = COALESCE(p_form_data->>'banner', banner),
    event_level         = COALESCE(p_form_data->>'event_level', event_level),
    menu_comment        = COALESCE(p_form_data->>'menu_comment', menu_comment),
    alcohol             = COALESCE(p_form_data->>'alcohol', alcohol),
    water               = COALESCE(p_form_data->>'water', water),
    juices              = COALESCE(p_form_data->>'juices', juices),
    coffee              = COALESCE(p_form_data->>'coffee', coffee),
    hot_dishes          = COALESCE(p_form_data->>'hot_dishes', hot_dishes),
    dishware            = COALESCE(p_form_data->>'dishware', dishware),
    extra_requirements  = COALESCE(p_form_data->>'extra_requirements', extra_requirements),
    form_submitted      = TRUE,
    updated_at          = now()
  WHERE id = v_order.id;

  -- ============================================================
  -- 4. Auto-transition: Черновик → На согласовании
  -- ============================================================
  SELECT s.order_index, s.id INTO v_current_index, v_old_status_id
  FROM statuses s
  WHERE s.id = v_order.status_id;

  IF v_current_index = 0 THEN  -- Черновик (order_index = 0)
    SELECT id INTO v_approval_status
    FROM statuses
    WHERE order_index = 1;     -- На согласовании

    IF v_approval_status IS NOT NULL THEN
      UPDATE orders
      SET status_id = v_approval_status, updated_at = now()
      WHERE id = v_order.id;

      INSERT INTO status_history (order_id, old_status_id, new_status_id, changed_by, comment)
      VALUES (v_order.id, v_old_status_id, v_approval_status, p_user_id, 'Форма заполнена клиентом');
    END IF;
  END IF;

  -- ============================================================
  -- 5. Return updated order
  -- ============================================================
  RETURN QUERY SELECT * FROM orders WHERE id = v_order.id;
END;
$$;
