// ============================================================
// TEMPLATE PADRÃO DE BUG — compartilhado entre a execução
// (ao marcar "Falhou") e a criação manual de defeitos.
// ============================================================

export const BUG_CARD_TEMPLATE =
  '<p>🐞<strong>Problema:</strong></p><p><br></p><hr>' +
  '<p>👣<strong>Passos para reprodução:</strong></p><ol><li><br></li></ol><hr>' +
  '<p>✅<strong>Resultado esperado:</strong></p>' +
  '<p><strong>Dado que</strong></p><p><strong>Quando</strong></p><p><strong>Então</strong></p><hr>' +
  '<p>📸<strong>Evidência:</strong></p>';

export const SEVERITY_DEFS = [
  { key: 'minor', label: 'Menor' },
  { key: 'normal', label: 'Normal' },
  { key: 'major', label: 'Maior' },
  { key: 'critical', label: 'Crítica' },
];
