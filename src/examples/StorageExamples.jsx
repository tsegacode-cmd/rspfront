/**
 * Storage System Examples
 * Comprehensive examples demonstrating all storage features
 */

import { useState } from 'react';
import {
  useLocalStorage,
  useAuth,
  usePreferences,
  useFormPersist,
  useCache,
  useSearchHistory
} from '../hooks';
import {
  useAuthContext,
  usePreferencesContext,
  useStorageContext
} from '../contexts';

// Example 1: Simple localStorage Hook
export function SimpleStorageExample() {
  const [name, setName, removeName] = useLocalStorage('user-name', '');

  return (
    <div>
      <h3>Simple Storage Example</h3>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your name"
      />
      <button onClick={removeName}>Clear</button>
      <p>Stored name: {name}</p>
    </div>
  );
}

// Example 2: Authentication
export function AuthExample() {
  const { isAuthenticated, user, login, logout } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // Simulate API call
    const mockToken = 'jwt_token_' + Date.now();
    const mockUser = {
      id: 1,
      name: 'John Doe',
      email: email
    };
    
    login(mockToken, mockUser, 3600); // 1 hour expiration
  };

  return (
    <div>
      <h3>Authentication Example</h3>
      {isAuthenticated ? (
        <div>
          <p>Welcome, {user.name}!</p>
          <p>Email: {user.email}</p>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <button onClick={handleLogin}>Login</button>
        </div>
      )}
    </div>
  );
}

// Example 3: Theme and Preferences
export function PreferencesExample() {
  const {
    theme,
    toggleTheme,
    language,
    setLanguage,
    currency,
    setCurrency,
    preferences
  } = usePreferencesContext();

  return (
    <div>
      <h3>Preferences Example</h3>
      
      <div>
        <label>Theme: </label>
        <button onClick={toggleTheme}>
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
        <span> Current: {theme}</span>
      </div>

      <div>
        <label>Language: </label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </div>

      <div>
        <label>Currency: </label>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="SAR">SAR (ريال سعودي)</option>
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </div>

      <div>
        <h4>All Preferences:</h4>
        <pre>{JSON.stringify(preferences, null, 2)}</pre>
      </div>
    </div>
  );
}

// Example 4: Form Persistence
export function FormPersistExample() {
  const {
    formData,
    updateFormData,
    saveDraft,
    deleteDraft,
    resetForm,
    isDirty,
    lastSaved,
    hasDraft
  } = useFormPersist('example-form', {
    title: '',
    description: '',
    category: 'general'
  }, {
    autoSave: true,
    autoSaveDelay: 1000
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Submitting:', formData);
    alert('Form submitted! Draft will be cleared.');
    deleteDraft();
  };

  return (
    <div>
      <h3>Form Persistence Example</h3>
      
      {hasDraft && (
        <div style={{ background: '#d4edda', padding: '10px', marginBottom: '10px' }}>
          ✓ Draft loaded from previous session
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div>
          <label>Title:</label>
          <input
            value={formData.title}
            onChange={(e) => updateFormData({ title: e.target.value })}
            placeholder="Enter title"
          />
        </div>

        <div>
          <label>Description:</label>
          <textarea
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            placeholder="Enter description"
            rows="4"
          />
        </div>

        <div>
          <label>Category:</label>
          <select
            value={formData.category}
            onChange={(e) => updateFormData({ category: e.target.value })}
          >
            <option value="general">General</option>
            <option value="urgent">Urgent</option>
            <option value="important">Important</option>
          </select>
        </div>

        <div>
          <button type="submit">Submit</button>
          <button type="button" onClick={resetForm}>Reset</button>
          <button type="button" onClick={() => saveDraft()}>Save Draft</button>
          <button type="button" onClick={deleteDraft}>Delete Draft</button>
        </div>

        <div>
          {isDirty && <span style={{ color: 'orange' }}>● Unsaved changes</span>}
          {lastSaved && (
            <span style={{ color: 'green', marginLeft: '10px' }}>
              Last saved: {new Date(lastSaved).toLocaleTimeString()}
            </span>
          )}
        </div>
      </form>

      <div>
        <h4>Current Form Data:</h4>
        <pre>{JSON.stringify(formData, null, 2)}</pre>
      </div>
    </div>
  );
}

// Example 5: Data Caching
export function CacheExample() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Simulate API call
  const fetchData = async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      items: ['Item 1', 'Item 2', 'Item 3'],
      timestamp: new Date().toISOString(),
      random: Math.random()
    };
  };

  const {
    data,
    isLoading,
    error,
    isCached,
    refresh,
    invalidate
  } = useCache(`example-data-${refreshKey}`, fetchData, {
    ttl: 60, // 1 minute
    strategy: 'short'
  });

  return (
    <div>
      <h3>Cache Example</h3>
      
      <div>
        <button onClick={refresh} disabled={isLoading}>
          Refresh Data
        </button>
        <button onClick={invalidate}>
          Invalidate Cache
        </button>
        <button onClick={() => setRefreshKey(k => k + 1)}>
          New Cache Key
        </button>
      </div>

      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      
      {data && (
        <div>
          {isCached && (
            <div style={{ background: '#fff3cd', padding: '10px', marginBottom: '10px' }}>
              📦 Showing cached data
            </div>
          )}
          
          <h4>Data:</h4>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// Example 6: Search History
export function SearchHistoryExample() {
  const [query, setQuery] = useState('');
  const { history, addSearch, removeSearch, clearHistory, getPopular } = useSearchHistory();

  const handleSearch = () => {
    if (query.trim()) {
      addSearch(query, { timestamp: Date.now() });
      setQuery('');
    }
  };

  const popularSearches = getPopular(5);

  return (
    <div>
      <h3>Search History Example</h3>
      
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search..."
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      <div>
        <h4>Recent Searches:</h4>
        {history.length === 0 ? (
          <p>No search history</p>
        ) : (
          <ul>
            {history.slice(0, 10).map((item, index) => (
              <li key={index}>
                <span
                  onClick={() => setQuery(item.query)}
                  style={{ cursor: 'pointer', color: 'blue' }}
                >
                  {item.query}
                </span>
                {' '}
                <button onClick={() => removeSearch(item.query)}>×</button>
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && (
          <button onClick={clearHistory}>Clear All History</button>
        )}
      </div>

      {popularSearches.length > 0 && (
        <div>
          <h4>Popular Searches:</h4>
          <ul>
            {popularSearches.map((item, index) => (
              <li key={index}>
                {item.query} ({item.count} times)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Example 7: Storage Management
export function StorageManagementExample() {
  const {
    storageSize,
    cacheStats,
    updateStats,
    clearExpiredCache,
    clearOldDrafts,
    cleanup
  } = useStorageContext();

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div>
      <h3>Storage Management Example</h3>
      
      <div>
        <h4>Statistics:</h4>
        <p>Storage Size: {formatBytes(storageSize)}</p>
        <p>Total Cache Items: {cacheStats.total}</p>
        <p>Valid Cache Items: {cacheStats.valid}</p>
        <p>Expired Cache Items: {cacheStats.expired}</p>
      </div>

      <div>
        <button onClick={updateStats}>Refresh Stats</button>
        <button onClick={clearExpiredCache}>Clear Expired Cache</button>
        <button onClick={() => clearOldDrafts(7)}>Clear Old Drafts</button>
        <button onClick={cleanup}>Cleanup All</button>
      </div>
    </div>
  );
}

// Main Examples Component
export function StorageExamples() {
  const [activeExample, setActiveExample] = useState('simple');

  const examples = {
    simple: { title: 'Simple Storage', component: SimpleStorageExample },
    auth: { title: 'Authentication', component: AuthExample },
    preferences: { title: 'Preferences', component: PreferencesExample },
    form: { title: 'Form Persistence', component: FormPersistExample },
    cache: { title: 'Data Caching', component: CacheExample },
    search: { title: 'Search History', component: SearchHistoryExample },
    management: { title: 'Storage Management', component: StorageManagementExample }
  };

  const ActiveComponent = examples[activeExample].component;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Storage System Examples</h1>
      
      <div style={{ marginBottom: '20px' }}>
        {Object.entries(examples).map(([key, { title }]) => (
          <button
            key={key}
            onClick={() => setActiveExample(key)}
            style={{
              margin: '5px',
              padding: '10px 15px',
              background: activeExample === key ? '#0066cc' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {title}
          </button>
        ))}
      </div>

      <div style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '20px',
        background: '#f8f9fa'
      }}>
        <ActiveComponent />
      </div>
    </div>
  );
}

export default StorageExamples;
