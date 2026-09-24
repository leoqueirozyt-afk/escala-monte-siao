INSERT INTO users (id, name, email, phone, password_hash, role, max_services_per_month) VALUES
  (1, 'Administrador', 'admin@montesiao.org', '(11) 99999-0001', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'ADMIN', 8),
  (2, 'Carlos Lima', 'carlos@montesiao.org', '(11) 99999-0002', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'LEADER', 6),
  (3, 'Ana Souza', 'ana@montesiao.org', '(11) 99999-0003', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'LEADER', 6),
  (4, 'Beatriz Rocha', 'beatriz@montesiao.org', '(11) 99999-0004', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'LEADER', 6),
  (5, 'Pedro Alves', 'pedro@montesiao.org', '(11) 99999-0005', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4),
  (6, 'Maria Oliveira', 'maria@montesiao.org', '(11) 99999-0006', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4),
  (7, 'João Pereira', 'joao@montesiao.org', '(11) 99999-0007', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4),
  (8, 'Lucas Martins', 'lucas@montesiao.org', '(11) 99999-0008', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4),
  (9, 'Fernanda Dias', 'fernanda@montesiao.org', '(11) 99999-0009', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4),
  (10, 'Rafael Gomes', 'rafael@montesiao.org', '(11) 99999-0010', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4),
  (11, 'Camila Ferreira', 'camila@montesiao.org', '(11) 99999-0011', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4),
  (12, 'Thiago Rocha', 'thiago@montesiao.org', '(11) 99999-0012', 'pbkdf2$100000$a1b2c3d4e5f6a7b8$c03721c68f75dd890bd181f69829a3ea2ec68ecd13b9b63de64b1442854cfa90', 'VOLUNTEER', 4);

INSERT INTO ministries (id, name, description, leader_id) VALUES
  (1, 'Louvor', 'Ministério de louvor e adoração', 2),
  (2, 'Mídia', 'Som, câmera, projeção e equipamentos', 3),
  (3, 'Infantil', 'Escola dominical e cuidado das crianças', 4);

INSERT INTO roles (id, ministry_id, name) VALUES
  (1, 1, 'Vocal'),
  (2, 1, 'Guitarra'),
  (3, 1, 'Bateria'),
  (4, 1, 'Baixo'),
  (5, 2, 'Câmera'),
  (6, 2, 'Projeção'),
  (7, 2, 'Som'),
  (8, 3, 'Professor Infantil'),
  (9, 3, 'Apoio Infantil');

INSERT INTO user_roles (user_id, role_id) VALUES
  (2, 1), (2, 2),
  (3, 5), (3, 6),
  (4, 8),
  (5, 3), (5, 4),
  (6, 1),
  (7, 6), (7, 7),
  (8, 5),
  (9, 8), (9, 9),
  (10, 2), (10, 3),
  (11, 9),
  (12, 4), (12, 7);

INSERT INTO events (id, title, event_date, location) VALUES
  (1, 'Ensaio do Louvor', datetime('now', 'localtime', 'start of day', '+3 days', '+19 hours', '+30 minutes'), 'Templo Principal'),
  (2, 'Culto de Domingo Manhã', datetime('now', 'localtime', 'start of day', '+4 days', '+10 hours'), 'Templo Principal'),
  (3, 'Culto de Domingo Noite', datetime('now', 'localtime', 'start of day', '+4 days', '+18 hours'), 'Templo Principal'),
  (4, 'Culto de Quarta', datetime('now', 'localtime', 'start of day', '+7 days', '+20 hours'), 'Templo Principal'),
  (5, 'Culto de Domingo Noite', datetime('now', 'localtime', 'start of day', '+11 days', '+18 hours'), 'Templo Principal');

INSERT INTO schedules (event_id, role_id, user_id, status, notes) VALUES
  (1, 1, 6, 'CONFIRMED', NULL),
  (1, 3, 5, 'PENDING', NULL),
  (1, 2, 10, 'CONFIRMED', NULL),
  (2, 1, NULL, 'PENDING', 'Vaga em aberto'),
  (2, 8, 4, 'CONFIRMED', NULL),
  (2, 6, 7, 'CONFIRMED', NULL),
  (2, 7, 12, 'DECLINED', NULL),
  (3, 1, 2, 'CONFIRMED', NULL),
  (3, 3, 5, 'PENDING', NULL),
  (3, 4, NULL, 'PENDING', 'Vaga em aberto'),
  (3, 5, 8, 'CONFIRMED', NULL),
  (3, 6, 7, 'PENDING', NULL),
  (3, 9, 11, 'CONFIRMED', NULL),
  (4, 2, 10, 'PENDING', NULL),
  (4, 7, NULL, 'PENDING', 'Vaga em aberto'),
  (4, 9, 9, 'CONFIRMED', NULL),
  (5, 1, 6, 'PENDING', NULL),
  (5, 5, 8, 'PENDING', NULL),
  (5, 8, NULL, 'PENDING', 'Vaga em aberto');

INSERT INTO unavailabilities (user_id, start_date, end_date, reason) VALUES
  (5, date('now', 'localtime', 'start of day', '+8 days'), date('now', 'localtime', 'start of day', '+12 days'), 'Viagem a trabalho'),
  (7, date('now', 'localtime', 'start of day', '+5 days'), date('now', 'localtime', 'start of day', '+5 days'), 'Compromisso familiar');

INSERT INTO swap_requests (schedule_id, requester_id, target_user_id, status) VALUES
  (9, 5, 10, 'PENDING');
