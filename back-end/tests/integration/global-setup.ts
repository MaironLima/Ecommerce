import { prepareTestDb } from '../support/test-db.js';

// Runs once: create (if needed), migrate and empty the test database.
export default async function setup() {
  await prepareTestDb();
}
