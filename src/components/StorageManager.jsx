/**
 * Storage Manager Component
 * Admin component for managing localStorage
 */

import { useState } from 'react';
import { useStorageContext } from '../contexts/StorageContext.jsx';
import './StorageManager.css';

export function StorageManager() {
  const {
    storageSize,
    cacheStats,
    updateStats,
    clearAll,
    clearExpiredCache,
    clearOldDrafts,
    cleanup,
    exportData,
    importData
  } = useStorageContext();

  const [showConfirm, setShowConfirm] = useState(false);

  const handleClearAll = () => {
    if (showConfirm) {
      clearAll();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redsea-storage-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          importData(data);
          alert('Data imported successfully!');
        } catch (error) {
          alert('Error importing data: ' + error.message);
        }
      };
      reader.readAsText(file);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="storage-manager">
      <h2>Storage Management</h2>

      <div className="storage-stats">
        <div className="stat-card">
          <h3>Storage Size</h3>
          <p className="stat-value">{formatBytes(storageSize)}</p>
        </div>

        <div className="stat-card">
          <h3>Cache Items</h3>
          <p className="stat-value">{cacheStats.total}</p>
          <p className="stat-detail">
            {cacheStats.valid} valid, {cacheStats.expired} expired
          </p>
        </div>
      </div>

      <div className="storage-actions">
        <button onClick={updateStats} className="btn-primary">
          Refresh Stats
        </button>

        <button onClick={clearExpiredCache} className="btn-secondary">
          Clear Expired Cache
        </button>

        <button onClick={() => clearOldDrafts(7)} className="btn-secondary">
          Clear Old Drafts (7+ days)
        </button>

        <button onClick={cleanup} className="btn-secondary">
          Cleanup All
        </button>

        <button onClick={handleExport} className="btn-secondary">
          Export Data
        </button>

        <label className="btn-secondary file-input-label">
          Import Data
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>

        <button
          onClick={handleClearAll}
          className={showConfirm ? 'btn-danger confirm' : 'btn-danger'}
        >
          {showConfirm ? 'Click Again to Confirm' : 'Clear All Storage'}
        </button>
      </div>

      {showConfirm && (
        <p className="warning-text">
          Warning: This will delete all stored data. Click the button again to confirm.
        </p>
      )}
    </div>
  );
}
