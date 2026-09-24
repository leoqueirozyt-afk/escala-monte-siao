ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'ACTIVE';

INSERT INTO users (name, email, phone, password_hash, role, max_services_per_month, account_status) VALUES
  ('Lucas Candidato', 'lider.novo@montesiao.org', '(11) 99999-0013', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'LEADER', 6, 'PENDING_LEADER');
