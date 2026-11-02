// Audit entries are written with the SAME client as the action they describe, inside the same
// transaction: either both the action and its audit row commit, or neither does. There is no way
// to have an unaudited change (or an audit row for something that was rolled back).
export function audit(client, actorId, action, entityType, entityId, details = {}) {
  return client.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, entityType, entityId, JSON.stringify(details)],
  );
}
