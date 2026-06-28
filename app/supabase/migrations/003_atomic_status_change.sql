-- ============================================================
-- 003_atomic_status_change.sql
-- Atomic status change: updates order status + inserts history
-- in a single transaction. Eliminates the two-call race condition.
-- ============================================================

-- Function: change_order_status(order_id, new_status_id, user_id, comment)
-- Returns: updated order row
CREATE OR REPLACE FUNCTION change_order_status(
  p_order_id       UUID,
  p_new_status_id  UUID,
  p_user_id        UUID,
  p_comment        TEXT DEFAULT NULL
)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_status_id UUID;
BEGIN
  -- Lock the order row to prevent concurrent status changes
  SELECT status_id INTO v_old_status_id
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  -- No-op if status unchanged
  IF v_old_status_id = p_new_status_id THEN
    RETURN QUERY SELECT * FROM orders WHERE id = p_order_id;
    RETURN;
  END IF;

  -- Update status
  UPDATE orders
  SET status_id = p_new_status_id, updated_at = now()
  WHERE id = p_order_id;

  -- Record history
  INSERT INTO status_history (order_id, old_status_id, new_status_id, changed_by, comment)
  VALUES (p_order_id, v_old_status_id, p_new_status_id, p_user_id, p_comment);

  -- Return updated order
  RETURN QUERY SELECT * FROM orders WHERE id = p_order_id;
END;
$$;
