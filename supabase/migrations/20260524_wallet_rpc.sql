-- Run in Supabase SQL Editor
-- Atomic wallet credit/debit functions with double-entry bookkeeping

CREATE OR REPLACE FUNCTION credit_wallet(
  p_user_id UUID,
  p_amount_cents INT,
  p_type TEXT,
  p_description TEXT,
  p_idempotency_key TEXT
) RETURNS void AS $$
DECLARE
  v_wallet_id UUID;
  v_avail_id UUID;
  v_pending_id UUID;
  v_tx_id UUID;
BEGIN
  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  SELECT id INTO v_avail_id FROM ledger_accounts
    WHERE wallet_id = v_wallet_id AND type = 'user_available';
  SELECT id INTO v_pending_id FROM ledger_accounts
    WHERE wallet_id = v_wallet_id AND type = 'user_pending';

  IF v_avail_id IS NULL THEN
    INSERT INTO ledger_accounts (wallet_id, type, name)
      VALUES (v_wallet_id, 'user_available', 'Available')
      RETURNING id INTO v_avail_id;
  END IF;
  IF v_pending_id IS NULL THEN
    INSERT INTO ledger_accounts (wallet_id, type, name)
      VALUES (v_wallet_id, 'user_pending', 'Pending')
      RETURNING id INTO v_pending_id;
  END IF;

  IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency_key AND status = 'completed') THEN
    RETURN;
  END IF;

  INSERT INTO transactions (user_id, type, status, amount_cents, idempotency_key, description, completed_at)
    VALUES (p_user_id, p_type, 'completed', p_amount_cents, p_idempotency_key, p_description, NOW())
    RETURNING id INTO v_tx_id;

  INSERT INTO ledger_entries (transaction_id, ledger_account_id, amount_cents)
    VALUES (v_tx_id, v_avail_id, p_amount_cents);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION debit_wallet(
  p_user_id UUID,
  p_amount_cents INT,
  p_type TEXT,
  p_description TEXT,
  p_idempotency_key TEXT
) RETURNS void AS $$
DECLARE
  v_wallet_id UUID;
  v_avail_id UUID;
  v_pending_id UUID;
  v_tx_id UUID;
  v_balance INT;
BEGIN
  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  SELECT id INTO v_avail_id FROM ledger_accounts
    WHERE wallet_id = v_wallet_id AND type = 'user_available';
  SELECT id INTO v_pending_id FROM ledger_accounts
    WHERE wallet_id = v_wallet_id AND type = 'user_pending';

  IF v_avail_id IS NULL THEN
    INSERT INTO ledger_accounts (wallet_id, type, name)
      VALUES (v_wallet_id, 'user_available', 'Available')
      RETURNING id INTO v_avail_id;
  END IF;
  IF v_pending_id IS NULL THEN
    INSERT INTO ledger_accounts (wallet_id, type, name)
      VALUES (v_wallet_id, 'user_pending', 'Pending')
      RETURNING id INTO v_pending_id;
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_balance
    FROM ledger_entries WHERE ledger_account_id = v_avail_id;

  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance: % < %', v_balance, p_amount_cents;
  END IF;

  IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN;
  END IF;

  INSERT INTO transactions (user_id, type, status, amount_cents, idempotency_key, description, completed_at)
    VALUES (p_user_id, p_type, 'completed', p_amount_cents, p_idempotency_key, p_description, NOW())
    RETURNING id INTO v_tx_id;

  INSERT INTO ledger_entries (transaction_id, ledger_account_id, amount_cents) VALUES
    (v_tx_id, v_avail_id,   -p_amount_cents),
    (v_tx_id, v_pending_id, +p_amount_cents);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
