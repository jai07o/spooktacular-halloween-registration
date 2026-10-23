const fs = require('fs');
const path = require('path');
const { getDbPath } = require('../src/db/database');

function backupDatabase() {
  const dbPath = getDbPath();
  const backupDir = path.resolve(__dirname, '../data/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `spooktacular_backup_${timestamp}.db`);

  // Copy database file
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Database successfully backed up to: ${backupPath}`);

  // Also copy WAL and SHM if they exist
  if (fs.existsSync(`${dbPath}-wal`)) {
    fs.copyFileSync(`${dbPath}-wal`, `${backupPath}-wal`);
  }
  if (fs.existsSync(`${dbPath}-shm`)) {
    fs.copyFileSync(`${dbPath}-shm`, `${backupPath}-shm`);
  }

  return backupPath;
}

if (require.main === module) {
  backupDatabase();
}

module.exports = { backupDatabase };
